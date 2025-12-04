# Graveyard Mint Fixes - Complete Audit Report

**Date:** November 24, 2025  
**Objective:** Fix graveyard minting process by comparing to working self-inscribe implementation  
**Methodology:** Line-by-line comparison, zero guessing, solutions derived ONLY from working code

---

## 🔍 AUDIT METHODOLOGY

All fixes were derived by:
1. **Direct comparison** with working `self-inscribe` implementation
2. **No guessing** - only patterns found in proven, working code
3. **Exact replication** of cryptographic operations from working code
4. **Verification** of data structures, imports, and function calls

---

## 🐛 BUG #1: Double-Encoding Script in Witness Data

### **Location:** `app/api/graveyard/mint/create-reveal/route.ts`

### **Root Cause:**
The script array was being double-encoded before adding to witness data:
```typescript
// WRONG (causing "Invalid Schnorr signature"):
const scriptEncoded = Script.encode(script)
txData.vin[0].witness = [sig, scriptEncoded, cblock]
```

### **Working Pattern (from `self-inscribe/create-reveal-psbt/route.ts`):**
```typescript
// CORRECT:
txData.vin[0].witness = [sig, script, cblock]
```

### **Why This Matters:**
- `createInscriptionScript()` returns an array that is ALREADY in the format expected by `cmdcode/tapscript`
- `Script.encode()` converts this array to a hex string representation
- The witness expects the raw array, not the encoded string
- Double encoding breaks the signature verification

### **Fix Applied:**
```typescript
// Line ~296 in create-reveal/route.ts
txData.vin[0].witness = [sig, script, cblock]  // No Script.encode()
```

---

## 🐛 BUG #2: Missing Safety Buffer in Commit Output Value

### **Location:** `app/api/graveyard/mint/create-commit/route.ts` and `create-reveal/route.ts`

### **Root Cause:**
The `create-commit` endpoint calculated `revealSatsNeeded` with a 15% safety buffer, but this value was NOT explicitly stored in the database. The `create-reveal` endpoint then recalculated the value WITHOUT the buffer:

```typescript
// IN CREATE-COMMIT: Calculated with buffer, but NOT stored
const revealSatsNeeded = Math.ceil((baseRevealSats + revealTxFee) * 1.15)

// IN CREATE-REVEAL: Recalculated WITHOUT buffer
const commitOutputValue = outputs[0].value + revealData.fees.revealTxFee
```

### **Working Pattern (from `self-inscribe/create-psbt/route.ts`):**
The working code stores the complete `revealData` object with all necessary values for the reveal transaction.

### **Fix Applied:**

**In `create-commit/route.ts` (~line 257):**
```typescript
const revealData = {
  inscriptionScript: inscriptionAddress.tapleaf,
  rawInscriptionScript: Script.encode(inscriptionAddress.script).hex,
  inscriptionPrivKey: privKey,
  inscription: inscriptionAddress.inscription,
  taprootInfo: {
    tapkey: inscriptionAddress.tapkey,
    cblock: inscriptionAddress.cblock,
    address: inscriptionAddress.address,
  },
  outputs: [
    {
      address: userAddress,
      value: 330
    }
  ],
  fees: {
    commitTxFee: commitTx.actualCommitFee,
    revealTxFee: revealTxFee
  },
  commitOutputValue: revealSatsNeeded  // ✅ Store value WITH safety buffer
}
```

**In `create-reveal/route.ts` (~line 160):**
```typescript
// OLD: const commitOutputValue = outputs[0].value + revealData.fees.revealTxFee
const commitOutputValue = revealData.commitOutputValue  // ✅ Retrieve stored value
```

---

## 🐛 BUG #3: Incorrect Broadcast Logic for Low Fee Rates

### **Location:** `app/api/graveyard/mint/broadcast/route.ts`

### **Root Cause:**
Graveyard broadcast logic forced ALL reveal transactions to use mempool.space:
```typescript
// WRONG:
if (txType === 'reveal') {
  return await broadcastViaMempool(txHex)  // Always mempool for reveals!
}
```

But the user's fee rate was **0.22 sat/vB**, and mempool.space may reject transactions with such low fee rates.

### **Working Pattern (from `InscriptionService.broadcastTransaction()`):**
```typescript
// CORRECT:
static async broadcastTransaction(signedTxHex: string, feeRate?: number): Promise<string> {
  if (feeRate && feeRate < 1) {
    return this.broadcastViaSandshrew(signedTxHex)  // Use Sandshrew for <1 sat/vB
  }
  return this.broadcastViaMempoolSpace(signedTxHex)  // Use mempool.space for >=1 sat/vB
}
```

The working code uses **Sandshrew for ALL transactions <1 sat/vB, including reveals**.

### **Fix Applied:**
```typescript
async function smartBroadcast(txHex: string, feeRate: number, txType: 'commit' | 'reveal') {
  // EXACT PATTERN FROM WORKING CODE:
  // Use Sandshrew for ALL transactions <1 sat/vB (including reveals!)
  // Use mempool.space for transactions >=1 sat/vB
  const preferSandshrew = feeRate < 1
  
  const attempts = preferSandshrew
    ? [
        { name: 'sandshrew', handler: () => broadcastViaSandshrew(txHex) },
        { name: 'mempool', handler: () => broadcastViaMempool(txHex) },
      ]
    : [
        { name: 'mempool', handler: () => broadcastViaMempool(txHex) },
        { name: 'sandshrew', handler: () => broadcastViaSandshrew(txHex) },
      ]
  // ... fallback logic
}
```

---

## ✅ VERIFIED CORRECT PATTERNS

These patterns were confirmed to match the working code EXACTLY:

### 1. **Script Creation**
```typescript
// Both use identical pattern:
const script = createInscriptionScript(pubKeyHex, inscriptions)
const tapleaf = Tap.encodeScript(script)
```

### 2. **Key Derivation**
```typescript
// Both use identical pattern:
const secKey = cmdEcc.keys.get_seckey(inscriptionPrivKey)
const pubKey = cmdEcc.keys.get_pubkey(inscriptionPrivKey, true)
```

### 3. **Transaction Signing**
```typescript
// Both use identical pattern:
const sig = Signer.taproot.sign(secKey, txData, 0, { extension: tapleaf })
```

### 4. **Witness Construction**
```typescript
// Both use identical pattern (after Bug #1 fix):
txData.vin[0].witness = [sig, script, cblock]
```

### 5. **Inscription Object Structure**
```typescript
// Both store inscription with identical structure:
inscription: {
  content: string,
  mimeType: string,
  delegateAddress?: string
}
```

### 6. **Taproot Info Storage**
```typescript
// Both store taprootInfo with identical structure:
taprootInfo: {
  tapkey: string,
  cblock: string,
  address: string
}
```

---

## 📊 COMPARISON SUMMARY

| Component | Working Code | Graveyard (Before) | Graveyard (After) | Status |
|-----------|-------------|-------------------|-------------------|--------|
| Witness Construction | `[sig, script, cblock]` | `[sig, Script.encode(script), cblock]` | `[sig, script, cblock]` | ✅ FIXED |
| Commit Output Value | Stored in revealData | Recalculated without buffer | Stored in revealData | ✅ FIXED |
| Broadcast Logic (<1 sat/vB) | Sandshrew | Mempool.space (for reveals) | Sandshrew | ✅ FIXED |
| Script Creation | `createInscriptionScript()` | `createInscriptionScript()` | `createInscriptionScript()` | ✅ CORRECT |
| Key Derivation | `cmdEcc.keys.get_seckey()` | `cmdEcc.keys.get_seckey()` | `cmdEcc.keys.get_seckey()` | ✅ CORRECT |
| Transaction Signing | `Signer.taproot.sign()` | `Signer.taproot.sign()` | `Signer.taproot.sign()` | ✅ CORRECT |
| Inscription Object | `{content, mimeType, delegateAddress?}` | `{content, mimeType, delegateAddress?}` | `{content, mimeType, delegateAddress?}` | ✅ CORRECT |

---

## 🎯 EXPECTED OUTCOME

With all three bugs fixed, the graveyard minting process should now:

1. ✅ **Create valid reveal transactions** with properly formatted witness data
2. ✅ **Include safety buffer** to prevent "insufficient funds" errors
3. ✅ **Use correct broadcast method** (Sandshrew for 0.22 sat/vB reveals)
4. ✅ **Match working code** in all critical cryptographic operations

---

## 🔬 TESTING RECOMMENDATIONS

1. **Test low fee rate minting** (0.22 sat/vB) - should use Sandshrew
2. **Test normal fee rate minting** (>1 sat/vB) - should use mempool.space
3. **Verify reveal transaction broadcast** - should succeed without "Invalid Schnorr signature"
4. **Monitor commit output values** - should include 15% safety buffer
5. **Check inscription creation** - should properly inscribe on rare sats

---

## 📝 NOTES

- **All fixes derived from working code** - zero speculation or guessing
- **Exact patterns replicated** - no "close enough" approximations
- **Cryptographic operations verified** - signature, witness, taproot all match
- **Data structures confirmed** - inscription object, taprootInfo, revealData all identical
- **Broadcast logic corrected** - now matches InscriptionService pattern exactly

---

## 🔍 ADDITIONAL INVESTIGATION: Signature Still Invalid

After applying all three fixes, the signature verification is still failing with:
```
mandatory-script-verify-flag-failed (Invalid Schnorr signature)
```

**Observations from Logs:**
- ✅ Tapleaf matches perfectly between commit and reveal
- ✅ Tapkey matches perfectly
- ✅ Cblock matches perfectly
- ✅ Witness structure is correct: `[sig, script(118), cblock(66)]`
- ✅ Script has 118 elements (appropriate for ~75KB content)
- ❌ Signature verification fails on broadcast

**Added Diagnostic Logging:**
To investigate if data is being corrupted during database storage/retrieval:

1. **In `create-commit/route.ts`:**
   - Log privKey length and preview before storage
   - Log inscription content length before and after `createInscriptionAddresses`

2. **In `create-reveal/route.ts`:**
   - Log privKey length and preview after retrieval from database
   - Compare with commit values to verify no corruption

**Hypothesis:**
The issue may be:
1. **PrivKey corruption** during JSON serialization/deserialization in PostgreSQL JSONB
2. **Content corruption** (though tapleaf matches, suggesting content is identical)
3. **Subtle difference** in txData structure not yet identified

**Next Steps:**
1. Run a new mint to capture diagnostic logs
2. Verify privKey integrity between commit and reveal
3. If privKey matches, investigate transaction structure in more detail
4. Compare with actual working self-inscribe transaction hex

---

## 🎉 STATUS: THREE BUGS FIXED, INVESTIGATION ONGOING

All three identified bugs have been fixed using ONLY patterns from the proven, working implementation. Additional diagnostic logging added to investigate remaining signature issue.
