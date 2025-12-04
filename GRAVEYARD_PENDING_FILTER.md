# Graveyard Pending Status Filter

## Summary
Updated the graveyard API to exclude abyss_burns records with `status = 'pending'` from being displayed on the graveyard page.

## Problem
The graveyard page was showing ALL abyss_burns records (except hidden ones), including those still in 'pending' status. Pending burns are not yet confirmed on the blockchain and shouldn't appear in the graveyard until they're confirmed.

## Solution
Added a status filter to the graveyard query to exclude pending records.

## Changes Made

### File: `app/api/abyss/burns/route.ts`

**Modified Query (lines 575-593):**

**Before:**
```sql
WHERE LOWER(ordinal_wallet) = LOWER($1)
  AND hidden = FALSE
```

**After:**
```sql
WHERE LOWER(ordinal_wallet) = LOWER($1)
  AND hidden = FALSE
  AND status != 'pending'
```

## Impact

### What's Filtered Out:
- ❌ Records with `status = 'pending'` (not confirmed on blockchain yet)

### What Still Shows:
- ✅ Records with `status = 'confirmed'` (confirmed on blockchain)
- ✅ Records with any other status that's not 'pending'
- ✅ Only non-hidden records (`hidden = FALSE`)

## Status Values in abyss_burns

The `status` field typically has these values:
- `pending` - Transaction broadcast but not confirmed (NOW FILTERED OUT)
- `confirmed` - Transaction confirmed on blockchain (SHOWN)
- Other possible statuses would also be shown

## User Experience

### Before:
- User burns an ordinal
- Transaction is pending (waiting for blockchain confirmation)
- **Immediately appears in graveyard** with pending status
- Could cause confusion or premature actions

### After:
- User burns an ordinal
- Transaction is pending
- **Does NOT appear in graveyard yet**
- Once confirmed on blockchain → appears in graveyard
- Cleaner, more accurate display

## API Endpoint
`GET /api/abyss/burns?includeGraveyard=true&ordinalWallet={address}`

This is called by the graveyard page's `loadGraveyard()` function.

## Related Code

### Frontend (app/graveyard/page.tsx):
The `loadGraveyard` function calls this API:
```typescript
const response = await fetch(`/api/abyss/burns?${params.toString()}`, {
  headers: { 'Cache-Control': 'no-store' },
})
```

### Query Performance:
The query already had an index on status:
```sql
CREATE INDEX IF NOT EXISTS idx_abyss_burns_status ON abyss_burns(status)
```

This makes the `status != 'pending'` filter efficient.

## Testing Recommendations

1. Burn an ordinal and verify it doesn't immediately appear in graveyard
2. Wait for confirmation and verify it appears after confirmation
3. Check that existing confirmed burns still display correctly
4. Verify hidden burns remain hidden regardless of status
5. Confirm the order (by created_at DESC) remains correct

## Notes

- The `pending` filter applies ONLY to the graveyard view
- Other API endpoints may still return pending records if needed
- The `includePending` parameter still works for other use cases
- This change is specific to `includeGraveyard=true` requests

