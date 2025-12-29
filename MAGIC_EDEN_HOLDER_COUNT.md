# Magic Eden API - Holder Count Implementation

This document explains how we use the Magic Eden API to retrieve holder counts for The Damned collection.

## Overview

We use Magic Eden's Bitcoin Ordinals API to check how many The Damned ordinals a wallet address owns. This is used throughout the application to determine holder status, display inventory counts, and calculate total holdings.

## API Endpoint

### Magic Eden API Endpoint

**Base URL:** `https://api-mainnet.magiceden.dev/v2/ord/btc/tokens`

**Query Parameters:**
- `collectionSymbol` (required): `the-damned`
- `ownerAddress` (required): The Bitcoin wallet address to check
- `showAll` (optional): `true`): Include all ordinals, not just listed ones
- `limit` (optional): Number of results per page (default: 100, max: 500)
- `offset` (optional): Pagination offset
- `sortBy` (optional): Sort order (e.g., `priceAsc`, `priceDesc`)

**Example Request:**
```
GET https://api-mainnet.magiceden.dev/v2/ord/btc/tokens?collectionSymbol=the-damned&ownerAddress=bc1q...&showAll=true&limit=100
```

### Authentication

The Magic Eden API requires an API key for authentication:

**Headers:**
```
Accept: application/json
Content-Type: application/json
X-API-Key: {API_KEY}
Authorization: Bearer {API_KEY}
User-Agent: TheDamned/1.0
```

**API Key Location:**
- Environment variable: `NEXT_PUBLIC_MAGIC_EDEN_API_KEY`
- Fallback: `d637ae87-8bfe-4d6a-ac3d-9d563901b444`

## Our Proxy API Route

We proxy Magic Eden API requests through our own API route to:
- Handle authentication centrally
- Add timeout protection
- Support linked wallet aggregation
- Provide consistent error handling

### Endpoint: `/api/magic-eden`

**Location:** `app/api/magic-eden/route.ts`

**Query Parameters:**
- `ownerAddress` (required): Wallet address to check
- `collectionSymbol` (optional): Defaults to `the-damned`
- `includeLinked` (optional: `true`): Include linked wallets in the count
- `fetchAll` (optional: `true`): Fetch all pages of results
- `limit` (optional): Results per page (default: 100)
- `offset` (optional): Pagination offset
- `showAll` (optional: `true`): Include unlisted ordinals

**Example Request:**
```typescript
fetch(`/api/magic-eden?ownerAddress=${walletAddress}&collectionSymbol=the-damned&includeLinked=true&fetchAll=true`)
```

**Response Format:**
```json
{
  "success": true,
  "ownerAddress": "bc1q...",
  "tokens": [...],
  "total": 5,
  "limit": 100,
  "fetchedAll": true,
  "collectionSymbol": "the-damned",
  "linkedWalletsIncluded": true,
  "walletsQueried": 2
}
```

## Holder Count Calculation

### Single Wallet Count

The holder count is extracted from the Magic Eden API response in multiple ways:

1. **From `total` field** (preferred):
   ```typescript
   const total = data.total || 0
   ```

2. **From `tokens` array length** (fallback):
   ```typescript
   const total = Array.isArray(data.tokens) ? data.tokens.length : 0
   ```

3. **Direct array response** (fallback):
   ```typescript
   const total = Array.isArray(data) ? data.length : 0
   ```

### Multi-Wallet Aggregation (Linked Wallets)

When `includeLinked=true`, the API:
1. Fetches linked wallets from `/api/wallet/linked?walletAddress={address}`
2. Queries Magic Eden API for each wallet (primary + linked)
3. Aggregates all tokens from all wallets
4. Returns combined total count

**Implementation:**
```typescript
// Get linked wallets
const linkedWalletsResponse = await fetch(
  `/api/wallet/linked?walletAddress=${walletAddress}`
)
const linkedData = await linkedWalletsResponse.json()
const allWallets = [primaryWallet, ...linkedWallets]

// Query Magic Eden for each wallet
for (const wallet of allWallets) {
  const response = await fetch(
    `https://api-mainnet.magiceden.dev/v2/ord/btc/tokens?collectionSymbol=the-damned&ownerAddress=${wallet}&showAll=true`
  )
  const data = await response.json()
  total += data.total || data.tokens?.length || 0
}
```

## Usage in Profile System

### Profile with Data Route

**Location:** `app/api/profile-with-data/route.ts`

The profile system calculates total holdings from multiple sources:

```typescript
const holderCounts = await Promise.allSettled([
  // 1. Magic Eden ordinals (includes linked wallets)
  fetch(`/api/magic-eden?ownerAddress=${wallet}&collectionSymbol=the-damned&includeLinked=true&fetchAll=true`)
    .then(res => res.json())
    .then(data => ({ total: data.total || data.tokens?.length || 0 })),

  // 2. Abyss burns (from database)
  pool.query(`SELECT COUNT(*) FROM abyss_burns WHERE wallet = $1`, [wallet]),

  // 3. Mint queue (from database)
  pool.query(`SELECT COUNT(*) FROM ascended_images_mint_queue WHERE wallet = $1`, [wallet])
])

const inWallet = holderCounts[0].value.total || 0
const inBurns = holderCounts[1].value.rows[0].count || 0
const inMintQueue = holderCounts[2].value.rows[0].count || 0

const totalHoldings = inWallet + inBurns + inMintQueue
```

**Total Holdings Formula:**
```
Total Holdings = Magic Eden Ordinals + Abyss Burns + Mint Queue
```

## Other Use Cases

### 1. Holder Verification

**Location:** `app/api/verify/route.ts`

Checks if a wallet is a holder by:
- Fetching ordinals from Magic Eden
- Checking for at least one unlisted ordinal
- Verifying no listed ordinals (must own, not just have listed)

```typescript
const apiUrl = `https://api-mainnet.magiceden.dev/v2/ord/btc/tokens?collectionSymbol=the-damned&ownerAddress=${address}&showAll=true`
const response = await fetch(apiUrl, { headers: { 'X-API-Key': apiKey } })
const data = await response.json()
const tokens = data.tokens || []
const hasUnlisted = tokens.some(token => token.listed === false)
const hasAnyListed = tokens.some(token => token.listed === true)
const isHolder = hasUnlisted && !hasAnyListed
```

### 2. Holder Status Check (Discord Bot)

**Location:** `app/api/holders/check/route.ts`

Periodically checks Discord users' holder status:
- Queries Magic Eden API for each user's wallet
- Updates database with current ordinal count
- Adjusts karma based on purchases/sales

```typescript
const apiUrl = `https://api-mainnet.magiceden.dev/v2/ord/btc/tokens?collectionSymbol=the-damned&ownerAddress=${wallet}&showAll=true`
const response = await fetch(apiUrl, { headers: { 'X-API-Key': apiKey } })
const data = await response.json()
const total = data.total ?? (Array.isArray(data.tokens) ? data.tokens.length : 0)
```

### 3. Inventory Display

**Location:** `app/profile/page.tsx`

Fetches and displays user's ordinal inventory:
- Shows total count
- Separates listed vs unlisted ordinals
- Handles pagination for large collections

```typescript
const response = await fetch(
  `/api/magic-eden?ownerAddress=${wallet}&collectionSymbol=the-damned&fetchAll=true`
)
const data = await response.json()
const tokens = data.tokens || []
const listedCount = tokens.filter(token => token.listed === true).length
const totalCount = tokens.length
```

## Error Handling

### Rate Limiting

Magic Eden API returns `429` status when rate limited:

```typescript
if (response.status === 429) {
  return NextResponse.json(
    { error: 'Rate limit exceeded', status: 429 },
    { status: 429 }
  )
}
```

### Timeout Protection

Our proxy includes timeout protection (15-20 seconds):

```typescript
async function fetchWithTimeout(url: string, options: RequestInit & { timeout?: number }) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), options.timeout || 15000)
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    })
    return response
  } finally {
    clearTimeout(timeoutId)
  }
}
```

### Fallback Behavior

If Magic Eden API fails:
- Returns empty array/zero count
- Logs error but doesn't crash
- Allows application to continue with partial data

## Response Format

### Magic Eden API Response

```json
{
  "tokens": [
    {
      "id": "inscription_id",
      "inscriptionNumber": 12345,
      "contentURI": "https://...",
      "collectionSymbol": "the-damned",
      "owner": "bc1q...",
      "listed": false,
      "priceInfo": {
        "price": 0,
        "pricePerToken": 0
      },
      "metadata": {
        "attributes": [...]
      }
    }
  ],
  "total": 5
}
```

### Our Proxy Response

```json
{
  "success": true,
  "ownerAddress": "bc1q...",
  "tokens": [...],
  "total": 5,
  "limit": 100,
  "fetchedAll": true,
  "nextOffset": null,
  "collectionSymbol": "the-damned",
  "linkedWalletsIncluded": true,
  "walletsQueried": 2
}
```

## Caching Strategy

- **Magic Eden API:** `next: { revalidate: 30 }` (30 seconds)
- **Traits endpoint:** `next: { revalidate: 300 }` (5 minutes)
- **Activities endpoint:** `next: { revalidate: 60 }` (1 minute)
- **Profile data:** `cache: 'no-store'` (always fresh)

## Important Notes

1. **Collection Symbol:** Always use `the-damned` (lowercase with hyphen)
2. **Show All:** Use `showAll=true` to include unlisted ordinals in counts
3. **Linked Wallets:** The `includeLinked` parameter aggregates counts across linked wallets
4. **Pagination:** Use `fetchAll=true` to automatically fetch all pages
5. **Holder Definition:** A holder must have at least one unlisted ordinal (not just listed for sale)

## Troubleshooting

### No Ordinals Returned
- Verify wallet address is correct
- Check collection symbol is `the-damned`
- Ensure `showAll=true` is included
- Check API key is valid

### Rate Limit Errors
- Implement exponential backoff
- Reduce request frequency
- Cache results when possible

### Timeout Errors
- Increase timeout duration
- Reduce page size (limit parameter)
- Check network connectivity

### Incorrect Counts
- Verify linked wallets are included if needed
- Check for pagination (use `fetchAll=true`)
- Ensure `showAll=true` to include unlisted ordinals


