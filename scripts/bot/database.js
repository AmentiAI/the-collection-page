// Database module for storing Luminex tokens
import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const dbPath = join(__dirname, '..', 'data', 'tokens.db');

// Ensure data directory exists
import { existsSync, mkdirSync } from 'fs';
const dataDir = join(__dirname, '..', 'data');
if (!existsSync(dataDir)) {
  mkdirSync(dataDir, { recursive: true });
}

const db = new Database(dbPath);

// Initialize schema
db.exec(`
  CREATE TABLE IF NOT EXISTS tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pubkey TEXT UNIQUE NOT NULL,
    token_identifier TEXT,
    token_address TEXT,
    name TEXT NOT NULL,
    ticker TEXT NOT NULL,
    symbol TEXT,
    decimals INTEGER,
    icon_url TEXT,
    holder_count INTEGER,
    total_supply TEXT,
    max_supply TEXT,
    is_freezable INTEGER DEFAULT 0,
    pool_lp_pubkey TEXT,
    pool_address TEXT,
    price_usd REAL,
    agg_volume_24h_usd REAL,
    agg_liquidity_usd REAL,
    agg_price_change_24h_pct REAL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_ticker ON tokens(ticker);
  CREATE INDEX IF NOT EXISTS idx_symbol ON tokens(symbol);
  CREATE INDEX IF NOT EXISTS idx_name ON tokens(name);
  CREATE INDEX IF NOT EXISTS idx_pool_lp_pubkey ON tokens(pool_lp_pubkey);
`);

// Prepare statements for performance
const insertStmt = db.prepare(`
  INSERT INTO tokens (
    pubkey, token_identifier, token_address, name, ticker, symbol, decimals,
    icon_url, holder_count, total_supply, max_supply, is_freezable,
    pool_lp_pubkey, pool_address, price_usd, agg_volume_24h_usd,
    agg_liquidity_usd, agg_price_change_24h_pct
  ) VALUES (
    ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
  )
  ON CONFLICT(pubkey) DO UPDATE SET
    token_identifier = excluded.token_identifier,
    token_address = excluded.token_address,
    name = excluded.name,
    ticker = excluded.ticker,
    symbol = excluded.symbol,
    decimals = excluded.decimals,
    icon_url = excluded.icon_url,
    holder_count = excluded.holder_count,
    total_supply = excluded.total_supply,
    max_supply = excluded.max_supply,
    is_freezable = excluded.is_freezable,
    pool_lp_pubkey = excluded.pool_lp_pubkey,
    pool_address = excluded.pool_address,
    price_usd = excluded.price_usd,
    agg_volume_24h_usd = excluded.agg_volume_24h_usd,
    agg_liquidity_usd = excluded.agg_liquidity_usd,
    agg_price_change_24h_pct = excluded.agg_price_change_24h_pct,
    updated_at = CURRENT_TIMESTAMP
`);

const findByNameStmt = db.prepare(`
  SELECT * FROM tokens 
  WHERE LOWER(ticker) = LOWER(?) 
     OR LOWER(symbol) = LOWER(?) 
     OR LOWER(name) LIKE LOWER(? || '%')
     OR LOWER(ticker) LIKE LOWER(? || '%')
     OR LOWER(symbol) LIKE LOWER(? || '%')
  ORDER BY 
    CASE 
      WHEN LOWER(ticker) = LOWER(?) THEN 1
      WHEN LOWER(symbol) = LOWER(?) THEN 2
      WHEN LOWER(ticker) LIKE LOWER(? || '%') THEN 3
      WHEN LOWER(symbol) LIKE LOWER(? || '%') THEN 4
      WHEN LOWER(name) LIKE LOWER(? || '%') THEN 5
      ELSE 6
    END,
    agg_volume_24h_usd DESC
  LIMIT 1
`);

const findAllStmt = db.prepare('SELECT * FROM tokens ORDER BY agg_volume_24h_usd DESC');

// Functions
export function upsertToken(token) {
  return insertStmt.run(
    token.pubkey,
    token.token_identifier,
    token.token_address,
    token.name,
    token.ticker,
    token.symbol || token.ticker,
    token.decimals,
    token.icon_url,
    token.holder_count,
    token.total_supply,
    token.max_supply,
    token.is_freezable ? 1 : 0,
    token.pool_lp_pubkey,
    token.pool_address,
    token.price_usd,
    token.agg_volume_24h_usd,
    token.agg_liquidity_usd,
    token.agg_price_change_24h_pct
  );
}

export function findTokenByName(name) {
  // Pass the same search term multiple times for all the placeholders
  const searchTerm = name.trim();
  return findByNameStmt.get(
    searchTerm,  // ticker exact match
    searchTerm,  // symbol exact match
    searchTerm,  // name LIKE
    searchTerm,  // ticker LIKE
    searchTerm,  // symbol LIKE
    searchTerm,  // ORDER BY ticker exact
    searchTerm,  // ORDER BY symbol exact
    searchTerm,  // ORDER BY ticker LIKE
    searchTerm,  // ORDER BY symbol LIKE
    searchTerm   // ORDER BY name LIKE
  );
}

export function getAllTokens() {
  return findAllStmt.all();
}

export function getTokenCount() {
  return db.prepare('SELECT COUNT(*) as count FROM tokens').get().count;
}

export function close() {
  db.close();
}

