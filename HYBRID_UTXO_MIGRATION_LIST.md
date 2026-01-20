# Hybrid UTXO Migration List

This document lists all API endpoints that currently fetch UTXOs using Subfrost/Sandshrew and need to be migrated to the hybrid approach (mempool.space + Ordiscan).

## Endpoints Requiring Migration

### 1. **Payment UTXO Fetching Endpoints**

#### `/api/speedup/fetch-utxos` ✅ HIGH PRIORITY
- **File**: `app/api/speedup/fetch-utxos/route.ts`
- **Current**: Uses Subfrost `esplora_address::utxo` + individual `ord_output` checks
- **Usage**: Speedup transaction UTXO selection
- **Needs**: Hybrid approach with mempool.space + Ordiscan

#### `/api/self-inscribe/utils/utxo.ts` ✅ HIGH PRIORITY
- **File**: `app/api/self-inscribe/utils/utxo.ts`
- **Current**: Uses Subfrost `esplora_address::utxo` + individual `ord_output` checks
- **Exported Functions**:
  - `fetchUtxos(address, excludedUtxos)`
  - `filterAndSortUtxos(utxos)`
  - `validateSufficientFunds(utxos, targetAmount, excludedCount)`
- **Used By**:
  - `/api/graveyard/mint/create-commit`
  - `/api/admin/megamonsters/mint/create-commit`
- **Needs**: Hybrid approach with mempool.space + Ordiscan

### 2. **Mint Endpoints (Use `fetchUtxos` from utils)**

#### `/api/graveyard/mint/create-commit` ✅ HIGH PRIORITY
- **File**: `app/api/graveyard/mint/create-commit/route.ts`
- **Current**: Uses `fetchUtxos` from `@/app/api/self-inscribe/utils/utxo`
- **Usage**: Graveyard mint commit transaction
- **Needs**: Will automatically benefit from hybrid migration of `fetchUtxos`

#### `/api/admin/megamonsters/mint/create-commit` ✅ HIGH PRIORITY
- **File**: `app/api/admin/megamonsters/mint/create-commit/route.ts`
- **Current**: Uses `fetchUtxos` from `@/app/api/self-inscribe/utils/utxo`
- **Usage**: Mega monster mint commit transaction
- **Needs**: Will automatically benefit from hybrid migration of `fetchUtxos`

### 3. **PSBT Creation Endpoints**

#### `/api/wallet/psbt` ✅ NO MIGRATION NEEDED
- **File**: `app/api/wallet/psbt/route.ts`
- **Current**: Only fetches transaction data for provided inputs (uses `fetchSandshrewTx`)
- **Usage**: Wallet PSBT creation for transfers
- **Note**: Does NOT fetch UTXOs - inputs are provided by client
- **Decision**: No migration needed

#### `/api/horse/psbt` ✅ NO MIGRATION NEEDED
- **File**: `app/api/horse/psbt/route.ts`
- **Current**: Builds PSBT from provided inputs (no UTXO fetching)
- **Usage**: Horse-related PSBT creation
- **Note**: Does NOT fetch UTXOs - inputs are provided by client
- **Decision**: No migration needed

#### `/api/speedup/create-cpfp-psbt` ✅ NO MIGRATION NEEDED
- **File**: `app/api/speedup/create-cpfp-psbt/route.ts`
- **Current**: Uses mempool.space for parent tx, receives `additionalUtxos` from client
- **Usage**: CPFP speedup transaction
- **Note**: Does NOT fetch UTXOs - `additionalUtxos` are provided by client
- **Decision**: No migration needed (client should use hybrid approach to select UTXOs)

#### `/api/speedup/create-cancel-psbt` ✅ NO MIGRATION NEEDED
- **File**: `app/api/speedup/create-cancel-psbt/route.ts`
- **Current**: Uses mempool.space for tx details, inputs come from the transaction itself
- **Usage**: Cancel transaction via RBF
- **Note**: Does NOT fetch UTXOs - uses inputs from the transaction being cancelled
- **Decision**: No migration needed

#### `/api/sat-recovery/build-psbt` ✅ NO MIGRATION NEEDED
- **File**: `app/api/sat-recovery/build-psbt/route.ts`
- **Current**: Receives inputs from client, uses `fetchSandshrewTx` for tx data only
- **Usage**: Sat recovery PSBT building
- **Note**: Does NOT fetch UTXOs - inputs are provided by client
- **Decision**: No migration needed

### 4. **Asset Listing Endpoints**

#### `/api/wallet/assets` ⚠️ SPECIAL CASE
- **File**: `app/api/wallet/assets/route.ts`
- **Current**: Uses `fetchSandshrewBalances` from `lib/sandshrew.ts`
- **Usage**: Lists all wallet assets (inscriptions, runes, spendable)
- **Note**: This endpoint is for **displaying** assets, not for payment UTXO selection
- **Decision**: May need to keep Subfrost for asset detection, but could add hybrid approach for spendable filtering
- **Needs**: Review if spendable UTXOs should use hybrid filtering

### 5. **Other Endpoints to Review**

#### `/api/wallet/check-utxo-inscriptions` ✅ KEEP AS-IS
- **File**: `app/api/wallet/check-utxo-inscriptions/route.ts`
- **Current**: Uses Subfrost `ord_output` for single UTXO check
- **Usage**: Check if a specific UTXO has inscriptions
- **Decision**: Keep as-is (single UTXO check, not bulk fetching)

#### `/api/finalize/route.ts` ⚠️ NEEDS REVIEW
- **File**: `app/api/finalize/route.ts`
- **Current**: Unknown - needs review
- **Usage**: Transaction finalization
- **Needs**: Check if it fetches UTXOs

## Migration Priority

### Phase 1: Core Payment UTXO Fetching (HIGH PRIORITY) ✅ COMPLETED
1. ✅ `/api/self-inscribe/utils/utxo.ts` - **COMPLETED** - Now supports hybrid approach with optional `clientMempoolData` parameter
2. ✅ `/api/speedup/fetch-utxos` - **COMPLETED** - Now supports hybrid approach with optional `clientMempoolData` parameter

### Phase 2: Review and Migrate PSBT Endpoints
3. ✅ **COMPLETED** - All PSBT endpoints reviewed, none fetch UTXOs directly
4. ✅ PSBT endpoints receive inputs from client (client should use hybrid approach)

### Phase 3: Asset Display Endpoints
5. ⚠️ Review `/api/wallet/assets` - decide if spendable filtering should use hybrid approach

## Implementation Plan

### Step 1: Create Hybrid UTXO Utility ✅ COMPLETED
- ✅ Created `lib/hybrid-utxo.ts` with:
  - Client-side mempool.space fetching (`fetchMempoolData`)
  - Server-side hybrid processing (`fetchUtxosHybrid`)
  - All filtering logic from HYBRID_UTXO_FILTERING_GUIDE.md
  - Helper functions (`filterAndSortUtxos`, `validateSufficientFunds`)

### Step 2: Migrate Core Utilities ✅ COMPLETED
- ✅ Updated `fetchUtxos` in `app/api/self-inscribe/utils/utxo.ts`:
  - Now accepts optional `clientMempoolData` parameter
  - Uses hybrid approach if provided, falls back to legacy Subfrost if not
  - Maintains backward compatibility
- ✅ Updated `/api/speedup/fetch-utxos`:
  - Now accepts optional `clientMempoolData` parameter
  - Uses hybrid approach if provided, falls back to legacy Subfrost if not
  - Maintains backward compatibility

### Step 3: Update Client Code (TODO)
- ⚠️ Update client code to fetch mempool data before calling these endpoints
- ⚠️ Pass `clientMempoolData` in request body
- ⚠️ Test mint endpoints (graveyard, megamonsters) with hybrid approach
- ⚠️ Test speedup endpoints with hybrid approach

### Step 4: Review and Migrate PSBT Endpoints ✅ COMPLETED
- ✅ All PSBT endpoints reviewed - none fetch UTXOs directly (they receive inputs from client)

## Notes

- The hybrid approach requires **client-side mempool.space calls** - endpoints will need to accept `clientMempoolData` in the request body
- Ordiscan API key must be set: `ORDISCAN_API_KEY` environment variable
- The >1200 sat filter provides a safe fallback if Ordiscan fails
- Mempool lock detection is critical for avoiding double-spends

## Environment Variables Required

```bash
ORDISCAN_API_KEY=your_ordiscan_api_key_here
```

## Testing Checklist

For each migrated endpoint:
- [ ] Test with address that has many inscriptions
- [ ] Test with address that has runes
- [ ] Test with address that has pending transactions
- [ ] Test with address that has locked UTXOs
- [ ] Test fallback when Ordiscan fails
- [ ] Test with insufficient funds scenario
- [ ] Verify no inscriptions/runes are selected as payment UTXOs
