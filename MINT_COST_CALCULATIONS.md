# Mint Cost Calculations & UTXO Validation

## Overview
The minting system has comprehensive cost calculation and UTXO validation to ensure users have sufficient funds before creating transactions.

## Cost Components

### 1. Reveal Transaction Fee
**Location:** `app/api/self-inscribe/utils/fees.ts` - `calculateRevealTxFees()`

**Calculation includes:**
- Base transaction size (version, inputs, outputs, locktime)
- Input size (32 bytes txid + 4 bytes vout + script length)
- Output sizes (inscription output + platform fee output)
- Witness data (signature + inscription script + control block)
- Transaction weight calculation (base × 4 + witness)
- Virtual size = weight / 4 (rounded up)

**Formula:**
```
revealTxFee = vSize × feeRate
```

**Example for 666x666 WebP inscription:**
- Content: ~50KB WebP
- MIME type: `image/webp` (10 bytes)
- Virtual size: ~13,000 vB
- Fee at 1 sat/vB: ~13,000 sats

### 2. Commit Transaction Fee
**Location:** `app/api/self-inscribe/utils/fees.ts` - `calculateExactCommitFee()`

**Calculation includes:**
- Address type detection (P2PKH, P2SH, P2WPKH, P2TR)
- Input sizes per address type:
  - P2PKH: 147.25 vB
  - P2SH: 94 vB
  - P2WPKH: 72 vB
  - P2TR: 52 vB
- Output sizes per address type:
  - P2PKH: 34 vB
  - P2SH: 43.5 vB
  - P2WPKH: 39 vB
  - P2TR: 46 vB

**Formula:**
```
commitTxSize = baseTxSize + (inputCount × inputSize) + (outputCount × outputSize)
commitTxFee = commitTxSize × feeRate
```

**Example:**
- 2 P2TR inputs, 3 P2TR outputs
- Size: 10.5 + (2 × 52) + (3 × 46) = 253 vB
- Fee at 1 sat/vB: 253 sats

### 3. Safety Buffer
**Location:** `app/api/graveyard/mint/create-commit/route.ts`

To account for fee rate fluctuations and ensure transaction success:
```
baseRevealCost = revealTxFee + 330 (inscription output)
safetyBuffer = baseRevealCost × 0.15 (15%)
revealSatsNeeded = baseRevealCost + safetyBuffer
```

### 4. Tool Fee
**Location:** `app/api/self-inscribe/utils/fees.ts` - `fetchToolFeeSettings()`

Platform inscription fee fetched from settings:
- Default: 0 sats (for pass holders)
- Configurable per deployment

### 5. Total Cost
```
totalCost = commitTxFee + revealTxFee + toolFee
```

## UTXO Validation

### 1. UTXO Fetching
**Location:** `app/api/self-inscribe/utils/utxo.ts` - `fetchUtxos()`

**Process:**
1. Fetch all spendable UTXOs from address
2. Filter out excluded UTXOs (from pending transactions)
3. Return available UTXOs and exclusion count

**Exclusion tracking prevents:**
- RBF (Replace-by-Fee) errors
- Double-spending attempts
- "Fee too low" errors from UTXO reuse

### 2. UTXO Filtering
**Location:** `app/api/self-inscribe/utils/utxo.ts` - `filterAndSortUtxos()`

**Filters:**
- Remove UTXOs < 800 sats (dust threshold)
- Sort by value (largest first) for efficient selection

### 3. Sufficient Funds Validation
**Location:** `app/api/self-inscribe/utils/utxo.ts` - `validateSufficientFunds()`

**Checks:**
1. At least one spendable UTXO exists
2. Total UTXO value ≥ target amount
3. Provides clear error messages with shortage amount
4. Warns about excluded UTXOs if funds insufficient

**Example error:**
```
Insufficient funds: need 15000 sats but only have 12000 sats available 
(short by 3000 sats). Note: 2 UTXO(s) are currently excluded from 
pending transactions. Please wait for pending transactions to confirm 
or add more funds.
```

## UTXO Selection Target

**Location:** `app/api/graveyard/mint/create-commit/route.ts`

```
targetForUTXOSelection = revealSatsNeeded + estimatedCommitFee + toolFeeInSats
```

Where:
- `revealSatsNeeded` includes reveal fee + 330 sats + 15% buffer
- `estimatedCommitFee` = ~280 vB × feeRate (conservative estimate)
- `toolFeeInSats` from settings

## User-Facing Cost Display

**Location:** `components/MintButton.tsx`

After commit PSBT is created, the UI displays:
- **Commit Fee:** Blue badge showing commit transaction cost
- **Reveal Fee:** Green badge showing reveal transaction cost
- **Total Cost:** Yellow badge showing total sats + BTC equivalent

**Example:**
```
Cost Breakdown:
Commit Fee:    253 sats
Reveal Fee:  13,000 sats
Total Cost:  13,253 sats
           ≈ 0.00013253 BTC
```

## Fee Rate Validation

**Location:** `app/api/self-inscribe/utils/fees.ts` - `validateFeeRate()`

Validates requested fee rate against available funds:
- Checks if total available sats can support the fee rate
- Calculates actual achievable fee rate
- Recommends maximum safe fee rate (90% of available)

## Cost Optimization Features

### 1. WebP Compression
**Location:** `app/api/graveyard/mint/compress/route.ts`

- Format: WebP (best compression for ordinals)
- Quality: 70 (good quality/size balance)
- Effort: 6 (maximum compression)
- Size: 666×666px (TheCollectionDAO standard)
- Typical savings: 80-95% reduction from original

**Example:**
- Original PNG: 2.1 MB → WebP: 52 KB
- Fee savings at 1 sat/vB: ~51,000 sats (~$30)

### 2. Efficient UTXO Selection
**Location:** `app/api/self-inscribe/utils/psbt.ts` - `createCommitPsbt()`

- Selects largest UTXOs first (minimize inputs)
- Includes only necessary UTXOs to reach target
- Reduces transaction size and fees

### 3. Address Type Detection
**Location:** `app/api/self-inscribe/utils/fees.ts`

- Automatically detects address types
- Uses precise size calculations per type
- Optimizes for P2TR (Taproot) where possible

## Real-World Example

**Scenario:** Mint 666×666px WebP (50KB) at 1 sat/vB

**Cost Breakdown:**
```
1. Reveal tx virtual size: ~12,800 vB
   Reveal fee: 12,800 sats

2. Base reveal cost: 12,800 + 330 = 13,130 sats
   Safety buffer (15%): 1,970 sats
   Reveal sats needed: 15,100 sats

3. Commit tx size: ~253 vB
   Commit fee: 253 sats

4. Tool fee: 0 sats (pass holder)

5. UTXO selection target: 15,100 + 253 + 0 = 15,353 sats
   Total cost to user: 13,053 sats (~$7.80 at $60K BTC)
```

**Safety checks:**
- ✅ User has sufficient UTXOs (validated before tx creation)
- ✅ No excluded UTXOs blocking transaction
- ✅ Fee rate supported by available funds
- ✅ Costs displayed to user before signing

## Error Handling

### Insufficient Funds
- Clear error message with exact shortage
- Lists excluded UTXOs if any
- Suggests waiting for confirmations or adding funds

### Invalid Fee Rate
- Calculates maximum supported rate
- Suggests recommended rate (90% of max)
- Prevents transaction creation if impossible

### UTXO Exclusion
- Automatically excludes pending transaction UTXOs
- Clears exclusions after 1 hour (auto-cleanup)
- Clears exclusions on transaction completion/failure

## Console Logging

All cost calculations are logged for debugging:
```
💰 Reveal fee calculation:
   Virtual size: 12800 vBytes
   Fee: 12800 sats (1 sat/vB)
   Base cost: 13130 sats
   Safety buffer: 1970 sats
   Total reveal sats: 15100 sats

🔍 UTXO selection target: 15353 sats

💰 Commit fee calculation:
   Payment address: bc1p... (P2TR)
   Inputs: 2, Outputs: 3
   Estimated size: 253 vB
   Final fee: 253 sats
```

## Summary

The minting system provides:
- ✅ **Accurate cost calculation** using Bitcoin transaction standards
- ✅ **Comprehensive UTXO validation** before transaction creation
- ✅ **Safety buffers** to prevent transaction failures
- ✅ **User-facing cost display** for transparency
- ✅ **UTXO exclusion tracking** to prevent double-spend errors
- ✅ **Address type optimization** for minimal fees
- ✅ **WebP compression** for massive cost savings
- ✅ **Clear error messages** with actionable guidance






