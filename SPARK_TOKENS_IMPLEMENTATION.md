# Spark Tokens Page Implementation Guide

This document details the implementation of the Spark Tokens page (`/spark`), including all the challenges encountered and solutions implemented.

## Overview

The Spark Tokens page displays Flashnet liquidity pools and trading pairs, showing token information including prices, market caps, liquidity, supply, and trading metrics. The page integrates with the Spark SDK to fetch real-time pool data and token metadata.

## Architecture

### Key Components

1. **Frontend**: `app/spark/page.tsx` - React component displaying the token table
2. **API Route**: `app/api/flashnet/pools/route.ts` - Fetches and returns pool data
3. **Library**: `lib/flashnet.ts` - Core functions for interacting with Flashnet/Spark SDK
4. **Metadata API**: `app/api/flashnet/token-metadata/route.ts` - Fetches token metadata on-demand

### Data Flow

```
User Browser
    ↓
app/spark/page.tsx (Frontend)
    ↓
/api/flashnet/pools (API Route)
    ↓
lib/flashnet.ts (Library Functions)
    ↓
FlashnetClient → Spark SDK → Flashnet Network
```

## Major Challenges and Solutions

### 1. Token Supply Display Issue

**Problem**: All tokens were showing "BITCOIN" as the token name and "21,000,000" as the supply, even for non-Bitcoin tokens.

**Root Cause**: 
- After filtering pools, we have TOKEN/BTC pairs where:
  - Asset A = Token (HOU, SOON, UTXO, etc.)
  - Asset B = Bitcoin
- The code was incorrectly displaying Asset B (Bitcoin) data instead of Asset A (the token)
- Bitcoin metadata was being incorrectly assigned to non-Bitcoin tokens

**Solution**:
1. **Switched display logic from Asset B to Asset A**:
   ```typescript
   // Before: Displaying Asset B (Bitcoin)
   const tokenBPrice = getTokenPrice(pool, 'b')
   const tokenBName = getTokenName(pool, 'b')
   
   // After: Displaying Asset A (the token)
   const tokenPrice = getTokenPrice(pool, 'a')
   const tokenName = getTokenName(pool, 'a')
   ```

2. **Added metadata verification** to prevent Bitcoin metadata from being used for non-Bitcoin tokens:
   ```typescript
   const assetAMetadataIsBitcoin = pool.asset_a_metadata?.ticker?.toLowerCase() === 'btc' || 
                                   pool.asset_a_metadata?.name?.toLowerCase() === 'bitcoin'
   
   const useMetadata = pool.asset_a_metadata && (isAssetABitcoin === assetAMetadataIsBitcoin)
   ```

3. **Default supply logic**: Non-Bitcoin tokens default to 1 billion when metadata is missing:
   ```typescript
   const tokenASupply = maxSupply
     ? maxSupply
     : isAssetABitcoin
       ? null // Don't default Bitcoin supply
       : (1_000_000_000 * Math.pow(10, decimalsA)).toString() // 1B with decimals
   ```

### 2. Fetching Actual Token Supply from SDK

**Problem**: The Spark SDK's `query_token_metadata` doesn't always return `max_supply` (returns `null` for some tokens like UTXO which has 21M supply).

**Solution**:
1. **Created batch metadata API endpoint** (`POST /api/flashnet/token-metadata`):
   - Accepts multiple tokens in one request
   - Checks database first, then fetches from Spark SDK
   - Fetches in chunks to avoid connection overload

2. **Added manual supply overrides** for tokens where SDK doesn't return supply:
   ```typescript
   const MANUAL_SUPPLY_OVERRIDES: Record<string, string> = {
     // UTXO token: 21 million with 6 decimals = 21,000,000 * 10^6
     'btkn1pzvck7xzt96vj4h9agnyu493t7a9jdc4v3j2z3n3fs4cwlcq9yps2zgm4z': '21000000000000',
     '08998b78c25974c956e5ea264e54b15fba5937156464a146714c2b877f002903': '21000000000000',
   }
   ```

3. **Frontend metadata caching**:
   - Caches fetched metadata to avoid redundant API calls
   - Automatically fetches missing metadata in background
   - Uses batch requests to minimize connection overhead

### 3. Connection Management Issues

**Problem**: "Channel has been shut down" errors when fetching metadata, caused by too many simultaneous requests and improper client lifecycle management.

**Root Cause**:
- Creating and closing Spark token clients for each request
- Too many individual GET requests instead of batching
- Closing clients manually when SDK manages lifecycle

**Solution**:
1. **Removed manual client closing**:
   ```typescript
   // Before: Closing client manually
   finally {
     if (sparkTokenClient?.close) {
       sparkTokenClient.close()
     }
   }
   
   // After: Let connection manager handle lifecycle
   // Don't close the client - let the connection manager handle it
   ```

2. **Implemented batch requests**:
   - Frontend collects all tokens needing metadata
   - Sends single POST request with all tokens
   - Backend processes in chunks with delays between chunks

3. **Added request debouncing**:
   - 500ms debounce to prevent rapid-fire requests
   - Pending request tracking to avoid duplicates

### 4. Token Identifier Format Handling

**Problem**: Tokens can be identified in multiple formats:
- Bech32m format: `btkn1pzvck7xzt96vj4h9agnyu493t7a9jdc4v3j2z3n3fs4cwlcq9yps2zgm4z`
- Hex format: `08998b78c25974c956e5ea264e54b15fba5937156464a146714c2b877f002903`

**Solution**:
1. **Enhanced lookup function** to handle both formats:
   ```typescript
   export async function listFlashnetTokenMetadata(tokenIdentifiers: string[]) {
     // Build lookup keys: include original, lowercase, and hex representation
     const lookupKeys = new Set<string>()
     for (const id of tokenIdentifiers) {
       lookupKeys.add(id)
       lookupKeys.add(id.toLowerCase())
       
       // Try to convert bech32m to hex for lookup
       try {
         const bytes = toTokenIdentifierBytes(id, FLASHNET_NETWORK)
         if (bytes) {
           const hexKey = Buffer.from(bytes).toString('hex').toLowerCase()
           lookupKeys.add(hexKey)
         }
       } catch (e) {
         // Ignore conversion errors
       }
     }
     // ... query database with all lookup keys
   }
   ```

2. **Metadata map building** uses multiple lookup strategies:
   - Token identifier (bech32m)
   - Token address (hex)
   - Lowercase variants
   - Converted formats

### 5. Price Calculation for TOKEN/BTC Pairs

**Problem**: Price calculation needed to handle TOKEN/BTC pairs where Asset A is the token and Asset B is Bitcoin.

**Solution**:
1. **Updated `getTokenPrice` for side 'a'**:
   ```typescript
   if (side === 'a') {
     // Price of A (the token) in USD
     // If Asset B is BTC, we can calculate: price_A = (reserve_B * BTC_price) / reserve_A
     
     const isAssetBBitcoin = isBitcoinAsset(...)
     
     if (isAssetBBitcoin && btcPrice && pool.asset_a_reserve && pool.asset_b_reserve) {
       const adjustedReserveA = pool.asset_a_reserve / Math.pow(10, decimalsA)
       const adjustedReserveB = pool.asset_b_reserve / Math.pow(10, decimalsB)
       
       // Price of A in USD = (BTC reserve * BTC price) / Token A reserve
       const priceInUSD = (adjustedReserveB * btcPrice) / adjustedReserveA
       return priceInUSD
     }
   }
   ```

### 6. Table Sorting Implementation

**Problem**: User wanted full table sorting on all columns with bidirectional sorting.

**Solution**:
1. **Added sorting state**:
   ```typescript
   const [sortColumn, setSortColumn] = useState<SortColumn | null>(null)
   const [sortDirection, setSortDirection] = useState<SortDirection>(null)
   ```

2. **Implemented sort handler** with cycling:
   ```typescript
   const handleSort = (column: SortColumn) => {
     if (sortColumn === column) {
       // Cycle through: asc -> desc -> null
       if (sortDirection === 'asc') {
         setSortDirection('desc')
       } else if (sortDirection === 'desc') {
         setSortDirection(null)
         setSortColumn(null)
       }
     } else {
       setSortColumn(column)
       setSortDirection('asc')
     }
   }
   ```

3. **Sorting logic** handles all column types:
   - Strings: Alphabetical sorting
   - Numbers: Numerical sorting
   - Null/undefined: Placed at end
   - Supply: Accounts for decimals and metadata cache

4. **Visual indicators**:
   - `ArrowUp` = ascending
   - `ArrowDown` = descending
   - `ArrowUpDown` = not sorted (grayed out)
   - Hover effects on sortable headers

## Key Functions

### `fetchFlashnetTokenMetadata`
Fetches token metadata from Spark SDK:
- Converts token identifiers to bytes
- Queries Spark token client
- Normalizes response to our format
- Applies manual overrides for missing supplies
- Does NOT close the client (connection manager handles it)

### `normalizeTokenMetadata`
Normalizes SDK response to our database format:
- Handles multiple data types (bigint, string, number)
- Converts to bech32m token identifier
- Applies manual supply overrides
- Validates and sanitizes data

### `attachStoredMetadataToPools`
Attaches stored metadata to pool records:
- Looks up metadata from database
- Creates synthetic Bitcoin metadata when needed
- Verifies metadata matches actual token (prevents Bitcoin metadata on non-Bitcoin tokens)
- Handles multiple lookup strategies

### `enrichPoolsWithMetadata`
Enriches pools with fresh metadata from SDK:
- Identifies tokens missing metadata
- Fetches in batches
- Stores in database for future use

## Database Schema

### `flashnet_pools` Table
Stores pool information:
- Pool identifiers (lp_public_key)
- Asset addresses and metadata
- Reserves, TVL, volume
- Price and fee information

### `flashnet_token_metadata` Table
Stores token metadata:
- Token identifiers (bech32m and hex)
- Name, ticker, decimals
- **max_supply** (the key field for supply display)
- Icon URL

## API Endpoints

### `GET /api/flashnet/pools`
Returns paginated list of pools:
- Fetches from SDK first, falls back to database
- Enriches with metadata
- Filters out BTC/TOKEN pools (only shows TOKEN/BTC)

### `POST /api/flashnet/token-metadata`
Batch endpoint for fetching metadata:
- Accepts array of token identifiers
- Checks database first
- Fetches missing tokens from SDK in chunks
- Returns all metadata in one response

### `GET /api/flashnet/token-metadata?token=...`
Single token endpoint (backwards compatibility):
- Same logic as POST but for single token

## Frontend Features

### Metadata Caching
- Client-side cache to avoid redundant requests
- Automatically fetches missing metadata in background
- Updates UI when metadata arrives

### Supply Calculation
1. Check pool metadata first
2. Check metadata cache
3. Apply manual override if available
4. Default to 1B for non-Bitcoin tokens

### Price Display
- Fetches BTC price from CoinGecko
- Converts token prices to USD using BTC price
- Handles missing prices gracefully

## Manual Supply Overrides

For tokens where the SDK doesn't return `max_supply`, we maintain a manual override map:

```typescript
const MANUAL_SUPPLY_OVERRIDES: Record<string, string> = {
  // Format: token_identifier or token_address -> supply in raw units (with decimals)
  'btkn1pzvck7xzt96vj4h9agnyu493t7a9jdc4v3j2z3n3fs4cwlcq9yps2zgm4z': '21000000000000', // UTXO: 21M with 6 decimals
}
```

**To add a new override:**
1. Get the token identifier (bech32m) or address (hex)
2. Calculate: `supply * 10^decimals` (e.g., 21M with 6 decimals = 21,000,000 * 1,000,000 = 21,000,000,000,000)
3. Add to `MANUAL_SUPPLY_OVERRIDES` in `lib/flashnet.ts`

## Debugging

### Console Logs
The implementation includes extensive debug logging:

- `[Flashnet] Raw SDK response` - Shows what SDK actually returns
- `[Supply Debug]` - Shows supply calculation for first 3 pools and UTXO
- `[Supply Display]` - Shows how supply is formatted for display
- `[UTXO Pool Debug]` / `[SOON Pool Debug]` - Full pool details for specific tokens

### Key Debug Points
1. Check if metadata is being fetched correctly
2. Verify token identifier format matches
3. Check if manual override is being applied
4. Verify decimals are correct for supply calculation

## Future Improvements

1. **Better Supply Detection**: 
   - Query token state directly if SDK adds support
   - Use on-chain data as fallback

2. **Performance**:
   - Implement virtual scrolling for large tables
   - Cache sorted results
   - Optimize metadata fetching

3. **User Experience**:
   - Add filters (by token name, min/max price, etc.)
   - Save user's sort preferences
   - Add column visibility toggles

4. **Data Accuracy**:
   - Periodic metadata refresh
   - Validate supply data against multiple sources
   - Handle supply updates for tokens

## Testing

To test the implementation:

1. **Supply Display**:
   - Check that non-Bitcoin tokens show 1B default
   - Verify UTXO shows 21M (from manual override)
   - Check that tokens with metadata show correct supply

2. **Sorting**:
   - Click each column header
   - Verify ascending/descending works
   - Check that clicking again removes sort

3. **Metadata Fetching**:
   - Open browser console
   - Check for metadata fetch logs
   - Verify no "Channel has been shut down" errors

4. **Token Names**:
   - Verify actual token names display (not "BITCOIN")
   - Check that pair names are correct (TOKEN/BTC format)

## Troubleshooting

### All tokens show "BITCOIN"
- Check that we're using Asset A data, not Asset B
- Verify metadata verification logic is working

### Supply shows 21M for all tokens
- Check that metadata verification prevents Bitcoin metadata on non-Bitcoin tokens
- Verify default supply logic is working

### "Channel has been shut down" errors
- Check that we're not closing Spark token clients manually
- Verify batch requests are being used
- Check connection manager is handling client lifecycle

### Supply not showing correctly
- Check console logs for metadata fetch
- Verify manual override is applied if needed
- Check decimals are correct for calculation

## Professional Production Setup

### Background Sync Architecture

For production use with hundreds of concurrent users, we use a **background sync pattern**:

1. **Cron Job** (`/api/cron/sync-flashnet-pools`):
   - Runs every 5 minutes (`*/5 * * * *`)
   - Fetches ALL pools from SDK with pagination
   - Saves to database
   - Enriches with metadata
   - No user-facing requests hit the SDK

2. **API Endpoint** (`/api/flashnet/pools`):
   - Serves from database only (fast, cached)
   - No SDK calls per request
   - Can handle hundreds of concurrent users
   - Sorting works on complete dataset

### How It Works

```
┌─────────────────┐
│  Vercel Cron    │  Every 15 minutes
│  (Background)   │
└────────┬────────┘
         │
         ▼
┌─────────────────────────┐
│ /api/cron/sync-        │
│ flashnet-pools         │
│                         │
│ 1. Fetch ALL pools     │
│    from SDK            │
│ 2. Save to database    │
│ 3. Enrich metadata     │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│  PostgreSQL Database    │
│  (flashnet_pools)      │
└────────┬────────────────┘
         │
         │ (Read-only)
         ▼
┌─────────────────────────┐
│ /api/flashnet/pools    │
│ (GET endpoint)         │
│                         │
│ - Fast DB queries      │
│ - No SDK calls         │
│ - Handles 100s users   │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│  Frontend (/spark)     │
│  - Fast loading        │
│  - Complete data       │
│  - Full sorting        │
└─────────────────────────┘
```

### Benefits

1. **Performance**: Database queries are 10-100x faster than SDK calls
2. **Scalability**: Can handle hundreds of concurrent users
3. **Reliability**: If SDK is down, users still see cached data
4. **Complete Data**: All pools available for sorting (not just first page)
5. **Cost**: Fewer SDK calls = lower API costs

### Cron Job Details

**Schedule**: Every 15 minutes (`*/15 * * * *`)

**Why 15 minutes?**
- Pool data (prices, volume, TVL) changes frequently - 15 min is a good balance
- Token metadata (names, symbols, supply) rarely changes - no need for frequent updates
- Reduces API calls and costs while keeping data fresh
- Users still see updated prices/volume within 15 minutes

**What it does**:
1. Fetches all pools from SDK (paginated, up to 1000 pools)
2. Normalizes and saves to database
3. Enriches with token metadata
4. Updates existing pools, inserts new ones

**Security**: 
- Verifies Vercel cron header or CRON_SECRET
- Only runs from authorized sources

### Manual Trigger

You can manually trigger the sync:
```bash
curl -X GET "https://your-domain.com/api/cron/sync-flashnet-pools" \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

### Update Frequency Considerations

**15 minutes is a good balance because:**
- **Pool data** (prices, volume, TVL) changes frequently - 15 min keeps it fresh
- **Token metadata** (names, symbols, supply) rarely changes - no need for frequent updates
- **Reduces costs** - Fewer API calls = lower costs
- **Rate limits** - Less likely to hit SDK rate limits
- **User experience** - 15 min is still very fresh for trading data

**Alternative schedules:**
- `*/10 * * * *` - Every 10 minutes (more frequent, higher costs)
- `*/30 * * * *` - Every 30 minutes (less frequent, lower costs)
- `0 * * * *` - Every hour (too infrequent for trading data)

### Monitoring

Check cron job logs in Vercel dashboard:
- Look for `[Flashnet Sync]` log messages
- Monitor sync duration and pool counts
- Check for errors in metadata enrichment

## Conclusion

The Spark Tokens page implementation required careful handling of:
- Token identifier formats (bech32m vs hex)
- SDK connection lifecycle management
- Metadata fetching and caching
- Supply calculation with proper decimal handling
- Table sorting and user experience
- **Production architecture with background sync**

The key insight was understanding that after filtering, pools are TOKEN/BTC pairs where Asset A is the token we want to display, not Asset B (Bitcoin). This fundamental understanding fixed the display issues and allowed proper metadata handling.

The professional setup ensures the page can scale to hundreds of users by serving from a database that's kept fresh by background cron jobs (every 15 minutes), rather than hitting the SDK on every request. This balances data freshness with API costs and rate limits.

