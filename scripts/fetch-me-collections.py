#!/usr/bin/env python3
"""
Fetch Magic Eden collection info for all slugs in magic-eden-slugs.txt
and store results in the me_collections table.

Processes 2 slugs concurrently per second. Safe to stop and restart --
already-fetched slugs are skipped.

Requirements:
    pip install aiohttp asyncpg

Usage:
    python3 fetch-me-collections.py
    (reads NEON_DB and NEXT_PUBLIC_MAGIC_EDEN_API_KEY from .env.local automatically)
"""

import asyncio
import json
import os
import sys
import time
from pathlib import Path

import aiohttp
import asyncpg

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

SCRIPT_DIR = Path(__file__).parent
SLUGS_FILE = SCRIPT_DIR / "magic-eden-slugs.txt"

# Load .env.local from project root (one level up from scripts/)
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
        if key not in os.environ:  # don't override real env vars
            os.environ[key] = val

_load_env_local()

DB_URL = os.environ.get("NEON_DB") or os.environ.get("SUPABASE_DB")
ME_API_KEY = os.environ.get("ME_API_KEY") or os.environ.get("NEXT_PUBLIC_MAGIC_EDEN_API_KEY")

ME_BASE_URL = "https://api-mainnet.magiceden.dev/v2/ord/btc/collections"

CONCURRENCY = 2        # requests per second batch
BATCH_DELAY = 1.0      # seconds between batches

# ---------------------------------------------------------------------------
# DB helpers
# ---------------------------------------------------------------------------

CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS me_collections (
  slug                    TEXT PRIMARY KEY,
  name                    TEXT,
  description             TEXT,
  chain                   TEXT,
  image_uri               TEXT,
  inscription_icon        TEXT,
  supply                  INTEGER,
  twitter                 TEXT,
  discord                 TEXT,
  website                 TEXT,
  telegram                TEXT,
  coin_market_cap         TEXT,
  creator_tips_address    TEXT,
  labels                  JSONB,
  enable_collection_offer BOOLEAN,
  me_created_at           TIMESTAMPTZ,
  raw_data                JSONB,
  fetch_status            TEXT NOT NULL DEFAULT 'success',
  fetched_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_me_collections_fetch_status ON me_collections(fetch_status);
CREATE INDEX IF NOT EXISTS idx_me_collections_supply ON me_collections(supply DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_me_collections_chain  ON me_collections(chain);
"""

UPSERT_SQL = """
INSERT INTO me_collections (
  slug, name, description, chain, image_uri, inscription_icon,
  supply, twitter, discord, website, telegram, coin_market_cap,
  creator_tips_address, labels, enable_collection_offer, me_created_at,
  raw_data, fetch_status, fetched_at
) VALUES (
  $1, $2, $3, $4, $5, $6,
  $7, $8, $9, $10, $11, $12,
  $13, $14, $15, $16,
  $17, $18, NOW()
)
ON CONFLICT (slug) DO UPDATE SET
  name                    = EXCLUDED.name,
  description             = EXCLUDED.description,
  chain                   = EXCLUDED.chain,
  image_uri               = EXCLUDED.image_uri,
  inscription_icon        = EXCLUDED.inscription_icon,
  supply                  = EXCLUDED.supply,
  twitter                 = EXCLUDED.twitter,
  discord                 = EXCLUDED.discord,
  website                 = EXCLUDED.website,
  telegram                = EXCLUDED.telegram,
  coin_market_cap         = EXCLUDED.coin_market_cap,
  creator_tips_address    = EXCLUDED.creator_tips_address,
  labels                  = EXCLUDED.labels,
  enable_collection_offer = EXCLUDED.enable_collection_offer,
  me_created_at           = EXCLUDED.me_created_at,
  raw_data                = EXCLUDED.raw_data,
  fetch_status            = EXCLUDED.fetch_status,
  fetched_at              = NOW()
"""


async def ensure_table(pool: asyncpg.Pool) -> None:
    async with pool.acquire() as conn:
        await conn.execute(CREATE_TABLE_SQL)


async def load_done_slugs(pool: asyncpg.Pool) -> set[str]:
    """Return slugs that were already successfully fetched."""
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT slug FROM me_collections WHERE fetch_status = 'success'"
        )
    return {r["slug"] for r in rows}


async def save_result(pool: asyncpg.Pool, slug: str, data: dict | None, status: str) -> None:
    if data:
        name                    = _str(data.get("name"))
        description             = _str(data.get("description"))
        chain                   = _str(data.get("chain"))
        image_uri               = _str(data.get("imageURI"))
        inscription_icon        = _str(data.get("inscriptionIcon"))
        supply                  = _int(data.get("supply"))
        twitter                 = _str(data.get("twitterLink"))
        discord                 = _str(data.get("discordLink"))
        website                 = _str(data.get("websiteLink"))
        telegram                = _str(data.get("telegramLink"))
        coin_market_cap         = _str(data.get("coinMarketCapLink"))
        creator_tips_address    = _str(data.get("creatorTipsAddress"))
        labels                  = json.dumps(data.get("labels") or [])
        enable_collection_offer = data.get("enableCollectionOffer")
        me_created_at           = _parse_date(data.get("createdAt"))
        raw_data                = json.dumps(data)
    else:
        name = description = chain = image_uri = inscription_icon = None
        supply = None
        twitter = discord = website = telegram = coin_market_cap = None
        creator_tips_address = labels = enable_collection_offer = me_created_at = None
        raw_data = None

    async with pool.acquire() as conn:
        await conn.execute(
            UPSERT_SQL,
            slug, name, description, chain, image_uri, inscription_icon,
            supply, twitter, discord, website, telegram, coin_market_cap,
            creator_tips_address, labels, enable_collection_offer, me_created_at,
            raw_data, status,
        )


def _int(val) -> int | None:
    try:
        return int(val) if val is not None else None
    except (ValueError, TypeError):
        return None

def _str(val) -> str | None:
    if val is None:
        return None
    s = str(val).strip()
    return s if s else None

def _parse_date(val):
    # ME returns dates like "Wed, 15 Nov 2023 11:47:23 GMT"
    if not val:
        return None
    try:
        from email.utils import parsedate_to_datetime
        return parsedate_to_datetime(val)  # returns a datetime object
    except Exception:
        return None


# ---------------------------------------------------------------------------
# ME API fetch
# ---------------------------------------------------------------------------

async def fetch_collection(
    session: aiohttp.ClientSession,
    slug: str,
    max_retries: int = 5,
) -> tuple[str, dict | None, str]:
    """Returns (slug, data_or_None, status). Retries on 429/5xx with backoff."""
    url = f"{ME_BASE_URL}/{slug}"
    headers = {"Authorization": f"Bearer {ME_API_KEY}"} if ME_API_KEY else {}
    backoff = 2.0
    for attempt in range(max_retries):
        try:
            async with session.get(url, headers=headers, timeout=aiohttp.ClientTimeout(total=15)) as resp:
                if resp.status == 200:
                    data = await resp.json(content_type=None)
                    return slug, data, "success"
                elif resp.status == 404:
                    return slug, None, "not_found"
                elif resp.status == 429:
                    retry_after = min(float(resp.headers.get("Retry-After", backoff)), 5.0)
                    print(f"  [RATE LIMIT] {slug}: 429 -- sleeping {retry_after:.1f}s (attempt {attempt+1}/{max_retries})")
                    await asyncio.sleep(retry_after)
                    backoff = min(backoff * 2, 60)
                elif resp.status >= 500:
                    text = await resp.text()
                    print(f"  [WARN] {slug}: HTTP {resp.status} -- retrying (attempt {attempt+1}/{max_retries})")
                    await asyncio.sleep(backoff)
                    backoff = min(backoff * 2, 60)
                else:
                    text = await resp.text()
                    print(f"  [WARN] {slug}: HTTP {resp.status} -- {text[:120]}")
                    return slug, None, f"error_{resp.status}"
        except asyncio.TimeoutError:
            print(f"  [WARN] {slug}: timeout (attempt {attempt+1}/{max_retries})")
            await asyncio.sleep(backoff)
            backoff = min(backoff * 2, 60)
        except Exception as e:
            print(f"  [WARN] {slug}: {e}")
            return slug, None, "error"
    print(f"  [FAIL] {slug}: gave up after {max_retries} attempts")
    return slug, None, "error_max_retries"


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

async def main() -> None:
    if not DB_URL:
        print("ERROR: NEON_DB (or SUPABASE_DB) environment variable is not set.")
        sys.exit(1)

    if not ME_API_KEY:
        print("WARNING: ME_API_KEY / NEXT_PUBLIC_MAGIC_EDEN_API_KEY not set -- requests will be unauthenticated.")

    # Read slugs
    if not SLUGS_FILE.exists():
        print(f"ERROR: {SLUGS_FILE} not found.")
        sys.exit(1)

    all_slugs = [line.strip() for line in SLUGS_FILE.read_text().splitlines() if line.strip()]
    print(f"Total slugs in file: {len(all_slugs)}")

    # Connect to DB
    # asyncpg needs postgresql:// not postgres://
    dsn = DB_URL.replace("postgres://", "postgresql://", 1)
    pool = await asyncpg.create_pool(dsn, ssl="require", min_size=2, max_size=5)

    await ensure_table(pool)
    print("Table ready.")

    done = await load_done_slugs(pool)
    remaining = [s for s in all_slugs if s not in done]
    print(f"Already done: {len(done)}  |  Remaining: {len(remaining)}")

    if not remaining:
        print("All slugs already fetched. Done.")
        await pool.close()
        return

    # Process in batches of CONCURRENCY slugs, one batch per second
    total = len(remaining)
    processed = 0
    success = 0
    not_found = 0
    errors = 0

    connector = aiohttp.TCPConnector(limit=CONCURRENCY * 2)
    async with aiohttp.ClientSession(connector=connector) as session:
        for batch_start in range(0, total, CONCURRENCY):
            batch = remaining[batch_start : batch_start + CONCURRENCY]
            batch_t0 = time.monotonic()

            tasks = [fetch_collection(session, slug) for slug in batch]
            results = await asyncio.gather(*tasks)

            # Save all results
            save_tasks = []
            for slug, data, status in results:
                save_tasks.append(save_result(pool, slug, data, status))
                processed += 1
                if status == "success":
                    success += 1
                elif status == "not_found":
                    not_found += 1
                else:
                    errors += 1

            await asyncio.gather(*save_tasks)

            pct = processed / total * 100
            print(
                f"  [{processed}/{total} {pct:.1f}%]  "
                f"ok={success}  404={not_found}  err={errors}  "
                f"batch={[r[0] for r in results]}"
            )

            # Respect rate limit: wait remainder of 1 second
            elapsed = time.monotonic() - batch_t0
            wait = BATCH_DELAY - elapsed
            if wait > 0 and batch_start + CONCURRENCY < total:
                await asyncio.sleep(wait)

    print(f"\nDone.  success={success}  not_found={not_found}  errors={errors}")
    await pool.close()


if __name__ == "__main__":
    asyncio.run(main())
