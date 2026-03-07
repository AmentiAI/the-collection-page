#!/usr/bin/env python3
"""
Dumps me_collections, me_inscriptions, me_token_details, me_token_progress
to a SQL file with CREATE TABLE + INSERT statements.

Usage:
    python3 dump-me-tables.py
    # output: scripts/me-tables-dump.sql
"""

import asyncio
import json
import os
from datetime import datetime
from pathlib import Path

import asyncpg

SCRIPT_DIR = Path(__file__).parent
OUT_FILE   = SCRIPT_DIR / "me-tables-dump.sql"

TABLES = [
    "me_collections",
    "me_token_progress",
    "me_inscriptions",
    "me_token_details",
]

def load_env():
    env_file = SCRIPT_DIR.parent / ".env.local"
    if not env_file.exists():
        return
    for line in env_file.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        k = k.strip(); v = v.strip().strip('"').strip("'")
        if k not in os.environ:
            os.environ[k] = v

def escape(val):
    if val is None:
        return "NULL"
    if isinstance(val, bool):
        return "TRUE" if val else "FALSE"
    if isinstance(val, (int, float)):
        return str(val)
    if isinstance(val, datetime):
        return f"'{val.isoformat()}'"
    s = str(val).replace("'", "''")
    return f"${s}$" if "'" in s else f"'{s}'"

async def dump_table(conn, table: str, f):
    # get column names in order
    cols = await conn.fetch("""
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1
        ORDER BY ordinal_position
    """, table)
    col_names = [r["column_name"] for r in cols]

    f.write(f"\n-- {table}\n")
    f.write(f"TRUNCATE TABLE {table} CASCADE;\n")

    rows = await conn.fetch(f"SELECT * FROM {table}")
    print(f"  {table}: {len(rows)} rows")

    if not rows:
        return

    col_list = ", ".join(col_names)
    batch = []
    for row in rows:
        vals = ", ".join(escape(row[c]) for c in col_names)
        batch.append(f"({vals})")
        if len(batch) >= 500:
            f.write(f"INSERT INTO {table} ({col_list}) VALUES\n")
            f.write(",\n".join(batch) + ";\n")
            batch = []
    if batch:
        f.write(f"INSERT INTO {table} ({col_list}) VALUES\n")
        f.write(",\n".join(batch) + ";\n")


async def main():
    load_env()
    dsn = os.environ["NEON_DB"].split("?")[0]
    pool = await asyncpg.create_pool(dsn, ssl="require", min_size=1, max_size=3)

    print(f"Dumping to {OUT_FILE} ...")

    with open(OUT_FILE, "w", encoding="utf-8") as f:
        f.write(f"-- ME tables dump\n-- Generated: {datetime.utcnow().isoformat()}Z\n\n")
        f.write("SET session_replication_role = replica; -- disable FK checks during restore\n")

        async with pool.acquire() as conn:
            # write schema for each table
            for table in TABLES:
                ddl = await conn.fetchval("""
                    SELECT 'CREATE TABLE IF NOT EXISTS ' || $1 || ' (' ||
                    string_agg(
                        column_name || ' ' || udt_name ||
                        CASE WHEN character_maximum_length IS NOT NULL
                             THEN '(' || character_maximum_length || ')' ELSE '' END ||
                        CASE WHEN is_nullable = 'NO' THEN ' NOT NULL' ELSE '' END,
                        ', ' ORDER BY ordinal_position
                    ) || ');'
                    FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = $1
                """, table)
                f.write(f"\n-- Schema: {table}\n-- (see create-me-tokens-table.sql for full DDL)\n")

            # write data
            f.write("\n-- Data\n")
            for table in TABLES:
                await dump_table(conn, table, f)

        f.write("\nSET session_replication_role = DEFAULT;\n")

    size_mb = OUT_FILE.stat().st_size / 1024 / 1024
    print(f"Done. File: {OUT_FILE} ({size_mb:.1f} MB)")
    await pool.close()

asyncio.run(main())
