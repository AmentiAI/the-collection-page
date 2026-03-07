#!/usr/bin/env python3
"""
Fetch all tokens for every collection in me_collections and store them in
me_inscriptions + me_token_details tables.

- Reads slugs from me_collections (only 'success' rows)
- Paginates each collection 100 at a time until fewer than 100 returned
- Tracks progress in me_token_progress (safe to stop/restart)
- Rate limited to 2 requests/second with retry/backoff on 429/5xx

Requirements:
    pip install aiohttp asyncpg

Usage:
    python3 fetch-me-tokens.py
    (reads NEON_DB and NEXT_PUBLIC_MAGIC_EDEN_API_KEY from .env.local)
"""

import asyncio
import json
import os
import sys
import time
from pathlib import Path
from email.utils import parsedate_to_datetime

import aiohttp
import asyncpg

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

SCRIPT_DIR = Path(__file__).parent

def _load_env_local():
    env_file = SCRIPT_DIR.parent / ".env.local"
    if not env_file.exists():
        return
    for line in env_file.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        key = key.strip()
        val = val.strip().strip('"').strip("'")
        if key not in os.environ:
            os.environ[key] = val

_load_env_local()

DB_URL      = os.environ.get("NEON_DB") or os.environ.get("SUPABASE_DB")
ME_API_KEY  = os.environ.get("ME_API_KEY") or os.environ.get("NEXT_PUBLIC_MAGIC_EDEN_API_KEY")
ME_BASE_URL = "https://api-mainnet.magiceden.dev/v2/ord/btc/tokens"

LIMIT        = 100   # must be 20-100, multiple of 20
BATCH_SIZE   = 4     # collections processed concurrently
BATCH_DELAY  = 1.0   # seconds between page fetches within each collection

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _str(v):
    if v is None: return None
    s = str(v).strip()
    return s or None

def _int(v):
    try: return int(v) if v is not None else None
    except (ValueError, TypeError): return None

def _bool(v):
    return bool(v) if v is not None else None

def _date(v):
    if not v: return None
    try: return parsedate_to_datetime(str(v))
    except Exception: return None

def _json(v):
    if v is None: return None
    return json.dumps(v)

# ---------------------------------------------------------------------------
# DB setup
# ---------------------------------------------------------------------------

CREATE_TABLES_SQL = open(SCRIPT_DIR / "create-me-tokens-table.sql").read()

UPSERT_INSCRIPTION_SQL = """
INSERT INTO me_inscriptions (
  inscription_id, collection_symbol, inscription_number,
  owner, listed, listed_price, fetched_at
) VALUES ($1, $2, $3, $4, $5, $6, NOW())
ON CONFLICT (inscription_id) DO UPDATE SET
  collection_symbol  = EXCLUDED.collection_symbol,
  inscription_number = EXCLUDED.inscription_number,
  owner              = EXCLUDED.owner,
  listed             = EXCLUDED.listed,
  listed_price       = EXCLUDED.listed_price,
  fetched_at         = NOW()
"""

UPSERT_DETAIL_SQL = """
INSERT INTO me_token_details (
  inscription_id, collection_symbol, chain, item_type,
  content_type, content_uri, content_preview_uri, content_body,
  genesis_transaction, genesis_block_height, genesis_block_time, genesis_block_hash,
  sat, sat_name, sat_rarity, sat_block_height, sat_block_time, satributes,
  meta_name, display_name, attributes,
  location, location_block_height, location_block_time, location_block_hash,
  output, output_value, mempool_tx_id, mempool_tx_timestamp,
  listed_at, listed_maker_fee_bp, listed_seller_receive_address, listed_for_mint,
  last_sale_price, brc20_transfer_amt, brc20_listed_unit_price, domain,
  sac_address, sac_merkle_tree_size, has_transient_rbf_protection,
  collection_name, collection_image_uri, me_updated_at, raw_data, fetched_at
) VALUES (
  $1,  $2,  $3,  $4,
  $5,  $6,  $7,  $8,
  $9,  $10, $11, $12,
  $13, $14, $15, $16, $17, $18,
  $19, $20, $21,
  $22, $23, $24, $25,
  $26, $27, $28, $29,
  $30, $31, $32, $33,
  $34, $35, $36, $37,
  $38, $39, $40,
  $41, $42, $43, $44, NOW()
)
ON CONFLICT (inscription_id) DO UPDATE SET
  location                     = EXCLUDED.location,
  location_block_height        = EXCLUDED.location_block_height,
  location_block_time          = EXCLUDED.location_block_time,
  location_block_hash          = EXCLUDED.location_block_hash,
  output                       = EXCLUDED.output,
  output_value                 = EXCLUDED.output_value,
  listed_at                    = EXCLUDED.listed_at,
  listed_seller_receive_address = EXCLUDED.listed_seller_receive_address,
  last_sale_price              = EXCLUDED.last_sale_price,
  me_updated_at                = EXCLUDED.me_updated_at,
  raw_data                     = EXCLUDED.raw_data,
  fetched_at                   = NOW()
"""

UPDATE_PROGRESS_SQL = """
INSERT INTO me_token_progress (collection_symbol, status, last_offset, total_fetched, started_at, updated_at)
VALUES ($1, $2, $3, $4, NOW(), NOW())
ON CONFLICT (collection_symbol) DO UPDATE SET
  status        = EXCLUDED.status,
  last_offset   = EXCLUDED.last_offset,
  total_fetched = EXCLUDED.total_fetched,
  updated_at    = NOW(),
  started_at    = COALESCE(me_token_progress.started_at, NOW()),
  completed_at  = CASE WHEN EXCLUDED.status = 'complete' THEN NOW() ELSE me_token_progress.completed_at END,
  error_message = CASE WHEN EXCLUDED.status = 'error' THEN me_token_progress.error_message ELSE NULL END
"""

UPDATE_ERROR_SQL = """
UPDATE me_token_progress SET
  status = 'error', error_message = $2, updated_at = NOW()
WHERE collection_symbol = $1
"""


async def ensure_tables(pool):
    async with pool.acquire() as conn:
        await conn.execute(CREATE_TABLES_SQL)


async def load_collections(pool):
    """Return list of (symbol, supply) for all successfully fetched collections."""
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT slug, supply FROM me_collections WHERE fetch_status = 'success' ORDER BY supply DESC NULLS LAST"
        )
    return [(r["slug"], r["supply"]) for r in rows]


async def load_progress(pool):
    """Return dict of symbol -> {status, last_offset, total_fetched}."""
    async with pool.acquire() as conn:
        rows = await conn.fetch("SELECT collection_symbol, status, last_offset, total_fetched FROM me_token_progress")
    return {r["collection_symbol"]: dict(r) for r in rows}


def _build_rows(tokens: list, collection_symbol: str):
    """Pre-build all row tuples so we can executemany in one shot."""
    insc_rows   = []
    detail_rows = []
    for t in tokens:
        insc_id = _str(t.get("id"))
        if not insc_id:
            continue
        coll = t.get("collection") or {}
        meta = t.get("meta") or {}
        sym  = _str(t.get("collectionSymbol")) or collection_symbol

        insc_rows.append((
            insc_id, sym,
            _int(t.get("inscriptionNumber")),
            _str(t.get("owner")),
            _bool(t.get("listed")),
            _int(t.get("listedPrice")),
        ))
        detail_rows.append((
            insc_id, sym,
            _str(t.get("chain")),
            _str(t.get("itemType")),
            _str(t.get("contentType")),
            _str(t.get("contentURI")),
            _str(t.get("contentPreviewURI")),
            _str(t.get("contentBody")),
            _str(t.get("genesisTransaction")),
            _int(t.get("genesisTransactionBlockHeight")),
            _date(t.get("genesisTransactionBlockTime")),
            _str(t.get("genesisTransactionBlockHash")),
            _int(t.get("sat")),
            _str(t.get("satName")),
            _str(t.get("satRarity")),
            _int(t.get("satBlockHeight")),
            _date(t.get("satBlockTime")),
            _json(t.get("satributes")),
            _str(meta.get("name")),
            _str(t.get("displayName")),
            _json(meta.get("attributes")),
            _str(t.get("location")),
            _int(t.get("locationBlockHeight")),
            _date(t.get("locationBlockTime")),
            _str(t.get("locationBlockHash")),
            _str(t.get("output")),
            _int(t.get("outputValue")),
            _str(t.get("mempoolTxId")),
            _date(t.get("mempoolTxTimestamp")),
            _date(t.get("listedAt")),
            _int(t.get("listedMakerFeeBp")),
            _str(t.get("listedSellerReceiveAddress") or t.get("listedSellerReceiverAddress")),
            _bool(t.get("listedForMint")),
            _int(t.get("lastSalePrice")),
            t.get("brc20TransferAmt"),
            t.get("brc20ListedUnitPrice"),
            _str(t.get("domain")),
            _str(t.get("sacAddress")),
            _int(t.get("sacMerkleTreeSize")),
            _bool(t.get("hasTransientRbfProtection")),
            _str(coll.get("name")),
            _str(coll.get("imageURI")),
            _date(t.get("updatedAt")),
            json.dumps(t),
        ))
    return insc_rows, detail_rows


async def save_tokens(pool, tokens: list, collection_symbol: str, new_offset: int, new_total: int):
    """Upsert a page of tokens + progress in one atomic transaction."""
    insc_rows, detail_rows = _build_rows(tokens, collection_symbol)
    if not insc_rows:
        return
    async with pool.acquire() as conn:
        async with conn.transaction():
            await conn.executemany(UPSERT_INSCRIPTION_SQL, insc_rows)
            await conn.executemany(UPSERT_DETAIL_SQL, detail_rows)
            await conn.execute(UPDATE_PROGRESS_SQL, collection_symbol, "in_progress", new_offset, new_total)


# ---------------------------------------------------------------------------
# API fetch
# ---------------------------------------------------------------------------

async def fetch_page(session, slug: str, offset: int, max_retries: int = 5):
    """Fetch one page of tokens. Returns list of token dicts."""
    url = (
        f"{ME_BASE_URL}?collectionSymbol={slug}"
        f"&showAll=true&limit={LIMIT}&offset={offset}&sortBy=inscriptionNumberAsc"
    )
    headers = {"Authorization": f"Bearer {ME_API_KEY}"} if ME_API_KEY else {}
    backoff = 2.0

    for attempt in range(max_retries):
        try:
            async with session.get(url, headers=headers, timeout=aiohttp.ClientTimeout(total=20)) as resp:
                if resp.status == 200:
                    data = await resp.json(content_type=None)
                    return data.get("tokens", [])
                elif resp.status == 429:
                    wait = min(float(resp.headers.get("Retry-After", backoff)), 5.0)
                    print(f"    [429] {slug} offset={offset} sleeping {wait:.1f}s")
                    await asyncio.sleep(wait)
                    backoff = min(backoff * 2, 30)
                elif resp.status >= 500:
                    print(f"    [{resp.status}] {slug} offset={offset} retry {attempt+1}/{max_retries}")
                    await asyncio.sleep(backoff)
                    backoff = min(backoff * 2, 30)
                else:
                    print(f"    [WARN] {slug} offset={offset} HTTP {resp.status}")
                    return []
        except asyncio.TimeoutError:
            print(f"    [TIMEOUT] {slug} offset={offset} retry {attempt+1}/{max_retries}")
            await asyncio.sleep(backoff)
            backoff = min(backoff * 2, 30)
        except Exception as e:
            print(f"    [ERR] {slug} offset={offset}: {e}")
            return []

    print(f"    [FAIL] {slug} offset={offset} gave up after {max_retries} attempts")
    return []


# ---------------------------------------------------------------------------
# Per-collection scrape
# ---------------------------------------------------------------------------

async def scrape_collection(session, pool, slug: str, supply: int, progress: dict):
    prog        = progress.get(slug, {})
    start_offset = prog.get("last_offset", 0) if prog.get("status") == "in_progress" else 0
    fetched_so_far = prog.get("total_fetched", 0) if prog.get("status") == "in_progress" else 0

    # mark in_progress
    async with pool.acquire() as conn:
        await conn.execute(UPDATE_PROGRESS_SQL, slug, "in_progress", start_offset, fetched_so_far)

    offset = start_offset
    total_fetched = fetched_so_far

    try:
        while True:
            tokens = await fetch_page(session, slug, offset)

            if tokens:
                total_fetched += len(tokens)
                offset += len(tokens)
                await save_tokens(pool, tokens, slug, offset, total_fetched)

                supply_str = f"/{supply}" if supply else ""
                print(f"  {slug}: saved offset={offset} total={total_fetched}{supply_str}")

            # done when fewer than LIMIT returned
            if len(tokens) < LIMIT:
                break

            await asyncio.sleep(BATCH_DELAY)

        # mark complete
        async with pool.acquire() as conn:
            await conn.execute(UPDATE_PROGRESS_SQL, slug, "complete", offset, total_fetched)

        supply_str = f"/{supply}" if supply else ""
        print(f"  [DONE] {slug}: {total_fetched}{supply_str} tokens")

    except Exception as e:
        async with pool.acquire() as conn:
            await conn.execute(UPDATE_ERROR_SQL, slug, str(e))
        print(f"  [ERROR] {slug}: {e}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

async def main():
    if not DB_URL:
        print("ERROR: NEON_DB not set")
        sys.exit(1)

    dsn = DB_URL.replace("postgres://", "postgresql://", 1).split("?")[0]
    pool = await asyncpg.create_pool(dsn, ssl="require", min_size=2, max_size=10)

    await ensure_tables(pool)
    print("Tables ready.")

    collections = await load_collections(pool)
    print(f"Collections to process: {len(collections)}")

    progress = await load_progress(pool)
    complete = {s for s, p in progress.items() if p["status"] == "complete"}
    remaining = [(s, sup) for s, sup in collections if s not in complete]
    print(f"Already complete: {len(complete)}  |  Remaining: {len(remaining)}")

    if not remaining:
        print("All collections done.")
        await pool.close()
        return

    connector = aiohttp.TCPConnector(limit=BATCH_SIZE * 2)
    async with aiohttp.ClientSession(connector=connector) as session:
        # process BATCH_SIZE collections concurrently
        for i in range(0, len(remaining), BATCH_SIZE):
            batch = remaining[i : i + BATCH_SIZE]
            tasks = [scrape_collection(session, pool, slug, supply, progress) for slug, supply in batch]
            await asyncio.gather(*tasks)

            done_count = len(complete) + min(i + BATCH_SIZE, len(remaining))
            total_count = len(complete) + len(remaining)
            print(f"[{done_count}/{total_count} collections done]")
            await asyncio.sleep(1.0)

    await pool.close()
    print("All done.")


if __name__ == "__main__":
    asyncio.run(main())
