# Speed Up Transaction System Documentation

## Overview

The speed up transaction system allows users to accelerate pending Bitcoin transactions using two primary methods:
1. **RBF (Replace-By-Fee)**: Replace the original transaction with a higher-fee version
2. **CPFP (Child-Pays-For-Parent)**: Create a child transaction that pays fees for both itself and the parent

This system handles UTXO selection, filtering, transaction building for different wallet types, and PSBT finalization.

---

## 1. UTXO Selection Using `sandshrew_balances`

### API Endpoint
**File**: `app/api/speedup/fetch-utxos/route.ts`

### How It Works

The system uses Sandshrew's `sandshrew_balances` RPC method to fetch available UTXOs:

```typescript
const requestBody = {
  jsonrpc: "2.0",
  id: "speedup",
  method: 'sandshrew_balances',
  params: [{ address }]
}

const utxoResponse = await fetch(`${SANDSHREW_API_URL}/${SANDSHREW_DEVELOPER_KEY}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(requestBody),
  cache: 'no-store'
})
```

### Response Structure

The Sandshrew API returns:
```json
{
  "result": {
    "spendable": [
      {
        "outpoint": "txid:vout",
        "value": 10000,
        ...
      }
    ]
  }
}
```

The system extracts `result.spendable` array which contains all available UTXOs.

---

## 2. UTXO Filtering

### Automatic Size Filtering

**UTXOs ≤ 800 sats are automatically excluded** from selection:

```typescript
const filteredUtxos = utxos
  .filter((utxo: any) => {
    if (utxo.value <= 800) {
      return false  // Too small, exclude
    }
    // ... other filters
  })
```

**Why 800 sats?**
- Below Bitcoin's dust limit (546 sats), these UTXOs are uneconomical to spend
- The 800 sat threshold provides a small buffer above the dust limit
- Prevents selecting UTXOs that would create dust outputs

### Next Use Prevention Filtering

**File**: `services/utxo-exclusion-service.ts`

The system maintains an in-memory exclusion list to prevent reusing UTXOs that are already in pending transactions:

```typescript
// Add UTXOs to exclusion list when used in a transaction
InscriptionService.addExcludedUtxos(paymentAddress, usedOutpoints)

// When fetching UTXOs, exclude those in the list
const filteredUtxos = utxos.filter((utxo: any) => {
  if (excludedUtxos.includes(utxo.outpoint)) {
    return false  // Already in use, exclude
  }
  return true
})
```

**How It Works:**
1. When a transaction is created, all UTXOs used as inputs are added to the exclusion list
2. The exclusion list is keyed by wallet address (normalized to lowercase)
3. Exclusions expire after **1 hour** (auto-cleanup)
4. When fetching UTXOs, the system checks against the exclusion list

**Why This Matters:**
- Prevents "fee too low" errors when creating multiple transactions
- Prevents RBF conflicts when the same UTXO is used in multiple pending transactions
- Ensures transactions don't conflict with each other

### Sorting

After filtering, UTXOs are sorted by value (largest first):

```typescript
.sort((a: any, b: any) => b.value - a.value)
```

This ensures the system selects the largest available UTXOs first, which is more efficient for fee payment.

---

## 3. Wallet Type Detection

**File**: `app/api/self-inscribe/utils/bitcoin.ts`

The system detects wallet types by examining the address prefix:

```typescript
export function getAddressType(address: string): AddressType {
  const normalized = address.toLowerCase()
  
  if (normalized.startsWith('bc1p')) {
    return 'p2tr'      // Taproot (P2TR)
  }
  if (normalized.startsWith('bc1q')) {
    return 'p2wpkh'   // Native SegWit (P2WPKH)
  }
  if (normalized.startsWith('3')) {
    return 'p2sh'     // P2SH-P2WPKH (Nested SegWit)
  }
  if (normalized.startsWith('1')) {
    return 'p2pkh'    // Legacy (P2PKH)
  }
  
  return 'unknown'
}
```

### Three Main Wallet Types

1. **P2TR (Taproot)** - `bc1p...`
   - Most modern, efficient
   - Uses taproot public key for signing

2. **P2WPKH (Native SegWit)** - `bc1q...`
   - Common in wallets like Magic Eden
   - Uses payment public key for signing

3. **P2SH (Nested SegWit)** - `3...`
   - Backward compatible
   - Uses payment public key + redeem script

---

## 4. Transaction Building for Different Wallet Types

### PSBT Input Signing Info

**File**: `app/api/self-inscribe/utils/bitcoin.ts`

The `addInputSigningInfo` function adds wallet-specific signing information to PSBT inputs:

```typescript
export function addInputSigningInfo(
  psbt: bitcoin.Psbt,
  inputIndex: number,
  address: string,
  paymentPublicKey?: string,
  taprootPublicKey?: string,
  valueSats?: number
) {
  const type = getAddressType(address)

  if (type === 'p2tr') {
    // Taproot: Use tapInternalKey
    if (!taprootPublicKey) return
    
    let keyBuffer = Buffer.from(taprootPublicKey, 'hex')
    // Handle 33-byte compressed key (remove prefix byte)
    if (keyBuffer.length === 33 && (keyBuffer[0] === 0x02 || keyBuffer[0] === 0x03)) {
      keyBuffer = keyBuffer.subarray(1)
    }
    
    psbt.updateInput(inputIndex, {
      tapInternalKey: keyBuffer  // 32-byte internal key
    })
    return
  }

  if (type === 'p2sh') {
    // P2SH: Requires payment key + redeem script
    if (!paymentPublicKey || typeof valueSats !== 'number') return
    
    const pubkeyBuffer = Buffer.from(paymentPublicKey, 'hex')
    const nested = bitcoin.payments.p2sh({
      redeem: bitcoin.payments.p2wpkh({ pubkey: pubkeyBuffer, network }),
      network
    })
    
    psbt.updateInput(inputIndex, {
      redeemScript: nested.redeem?.output,
      witnessUtxo: {
        script: nested.output,
        value: BigInt(valueSats)
      }
    })
    return
  }

  // P2WPKH and P2PKH: Use BIP32 derivation
  if (!paymentPublicKey) return
  
  const pubkeyBuffer = Buffer.from(paymentPublicKey, 'hex')
  psbt.updateInput(inputIndex, {
    bip32Derivation: [{
      masterFingerprint: Buffer.alloc(4),
      pubkey: pubkeyBuffer,
      path: ''
    }]
  })
}
```

### Transaction Building Examples

#### CPFP Transaction (`app/api/speedup/create-cpfp-psbt/route.ts`)

```typescript
// 1. Add parent transaction output as input
psbt.addInput({
  hash: parentTxid,
  index: outputIndex,
  witnessUtxo: {
    script: parentUtxo.script,
    value: BigInt(outputValue)
  }
})

// 2. Add signing info for parent output (usually taproot)
addInputSigningInfo(psbt, 0, outputAddress, normalizedPaymentKey, normalizedTaprootKey, Number(outputValue))

// 3. Add additional wallet UTXOs as inputs (if needed for fee)
for (const utxo of additionalUtxos) {
  psbt.addInput({
    hash: utxo.txid,
    index: utxo.vout,
    witnessUtxo: {
      script: utxoOutput.script,
      value: BigInt(utxo.value)
    }
  })
  
  // Add signing info based on wallet type
  addInputSigningInfo(psbt, i + 1, userAddress, normalizedPaymentKey, normalizedTaprootKey, Number(utxo.value))
}

// 4. Add outputs
psbt.addOutput({
  script: inscriptionOutputScript,
  value: BigInt(inscriptionOutput)
})

if (changeAmount > 0) {
  psbt.addOutput({
    script: changeOutputScript,
    value: BigInt(changeAmount)
  })
}
```

#### RBF Transaction (`app/api/speedup/create-rbf-psbt/route.ts`)

```typescript
// 1. Add all original inputs with RBF sequence
for (const input of txDetails.vin) {
  psbt.addInput({
    hash: input.txid,
    index: input.vout,
    sequence: 0xfffffffd,  // RBF sequence
    witnessUtxo: {
      script: prevOutput.script,
      value: BigInt(prevOutput.value)
    }
  })
  
  // Add signing info based on input address type
  addInputSigningInfo(psbt, i, address, paymentPublicKey, taprootPublicKey)
}

// 2. Add outputs with reduced values (to pay higher fee)
parentTransaction.outs.forEach((out, index) => {
  const newValue = updatedOutputValues[index]  // Reduced for fee
  psbt.addOutput({
    script: Buffer.from(out.script),
    value: BigInt(newValue)
  })
})
```

#### Cancel Transaction (`app/api/speedup/create-cancel-psbt/route.ts`)

Similar to RBF, but sends all funds back to a single return address:

```typescript
// 1. Add all original inputs
// 2. Add single output to return address
const returnScript = bitcoin.address.toOutputScript(returnAddress, bitcoin.networks.bitcoin)
psbt.addOutput({
  script: Buffer.from(returnScript),
  value: BigInt(returnValue)  // All inputs minus new fee
})
```

---

## 5. PSBT Finalization

**File**: `app/api/finalize/route.ts`

### When Finalization is Needed

Some wallets (notably **Magic Eden with bc1q addresses**) sign PSBTs but don't finalize them. The system detects this and calls Sandshrew's `finalizepsbt` method:

```typescript
// Check if finalization is needed
const psbt = bitcoin.Psbt.fromBase64(psbtBase64)
const requiresFinalization = psbt.data.inputs.some(
  (input) => !input.finalScriptSig && !input.finalScriptWitness
)

if (requiresFinalization) {
  // Call Sandshrew finalize API
  const finalizeResponse = await fetch('/api/finalize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ txBase64: psbtBase64 })
  })
  
  const finalizeData = await finalizeResponse.json()
  const txHex = finalizeData.hex  // Use finalized hex for broadcasting
}
```

### Finalization API

```typescript
// app/api/finalize/route.ts
const response = await fetch(`${SANDSHREW_API_URL}/${SANDSHREW_DEVELOPER_KEY}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: `finalize-${Date.now()}`,
    method: 'finalizepsbt',
    params: [txBase64]
  })
})

const payload = await response.json()
const finalized = payload?.result

if (!finalized?.complete) {
  throw new Error("Transaction is not finalized")
}

// Returns: { complete: true, hex: "..." }
```

### Wallet-Specific Finalization

**Magic Eden (bc1q addresses)**:
- Signs PSBTs but doesn't finalize
- Requires manual finalization via Sandshrew API
- Finalization combines all signatures into final transaction hex

**Other Wallets**:
- May auto-finalize (check `psbt.data.inputs` for `finalScriptSig`/`finalScriptWitness`)
- If already finalized, can extract transaction directly:
  ```typescript
  const txHex = psbt.extractTransaction().toHex()
  ```

---

## 6. Complete Transaction Flow

### CPFP Flow

1. **Parse parent transaction** → Identify user's output
2. **Calculate required child fee** → Based on target fee rate
3. **Fetch UTXOs** → Using `sandshrew_balances`
4. **Filter UTXOs** → Exclude ≤800 sats, exclude used UTXOs
5. **Select additional UTXOs** → If parent output insufficient for fee
6. **Build PSBT** → Add parent output + wallet UTXOs as inputs
7. **Add signing info** → Based on wallet type (P2TR/P2WPKH/P2SH)
8. **Sign PSBT** → Using wallet client
9. **Check finalization** → If needed, call Sandshrew finalize API
10. **Broadcast** → Via mempool.space
11. **Track UTXOs** → Add used UTXOs to exclusion list

### RBF Flow

1. **Parse parent transaction** → Verify opt-in RBF, wallet ownership
2. **Calculate fee increase** → Based on target fee rate
3. **Reduce change outputs** → To pay higher fee
4. **Build PSBT** → Reuse all original inputs with RBF sequence
5. **Add signing info** → Based on each input's address type
6. **Sign PSBT** → Using wallet client
7. **Check finalization** → If needed, call Sandshrew finalize API
8. **Broadcast** → Via mempool.space

---

## 7. Building Future PSBT Transactions

### Key Functions to Reuse

1. **`fetchUtxos(address, excludedUtxos)`** - Get available UTXOs
   ```typescript
   const response = await fetch('/api/speedup/fetch-utxos', {
     method: 'POST',
     body: JSON.stringify({ address, excludedUtxos })
   })
   ```

2. **`addInputSigningInfo(psbt, index, address, paymentKey, taprootKey, value)`** - Add wallet-specific signing info
   ```typescript
   import { addInputSigningInfo } from '@/app/api/self-inscribe/utils/bitcoin'
   addInputSigningInfo(psbt, 0, address, paymentPublicKey, taprootPublicKey, valueSats)
   ```

3. **`getAddressType(address)`** - Detect wallet type
   ```typescript
   import { getAddressType } from '@/app/api/self-inscribe/utils/bitcoin'
   const type = getAddressType(address)  // 'p2tr' | 'p2wpkh' | 'p2sh' | 'p2pkh'
   ```

4. **Finalization check and call**
   ```typescript
   const requiresFinalization = psbt.data.inputs.some(
     (input) => !input.finalScriptSig && !input.finalScriptWitness
   )
   
   if (requiresFinalization) {
     const finalizeResponse = await fetch('/api/finalize', {
       method: 'POST',
       body: JSON.stringify({ txBase64: psbt.toBase64() })
     })
     const { hex } = await finalizeResponse.json()
     // Use hex for broadcasting
   }
   ```

### Example: Building a Custom PSBT

```typescript
import * as bitcoin from 'bitcoinjs-lib'
import { addInputSigningInfo, getAddressType } from '@/app/api/self-inscribe/utils/bitcoin'

// 1. Create PSBT
const psbt = new bitcoin.Psbt({ network: bitcoin.networks.bitcoin })

// 2. Fetch and filter UTXOs
const utxoResponse = await fetch('/api/speedup/fetch-utxos', {
  method: 'POST',
  body: JSON.stringify({ 
    address: userAddress,
    excludedUtxos: getExcludedUtxos(userAddress)  // From utxo-exclusion-service
  })
})
const { utxos } = await utxoResponse.json()

// 3. Select UTXOs (largest first, already sorted)
let totalInput = 0
const selectedUtxos = []
for (const utxo of utxos) {
  selectedUtxos.push(utxo)
  totalInput += utxo.value
  if (totalInput >= requiredAmount + estimatedFee) break
}

// 4. Add inputs
for (let i = 0; i < selectedUtxos.length; i++) {
  const utxo = selectedUtxos[i]
  
  // Fetch transaction hex
  const txHex = await fetch(`https://mempool.space/api/tx/${utxo.txid}/hex`).then(r => r.text())
  const tx = bitcoin.Transaction.fromHex(txHex)
  const output = tx.outs[utxo.vout]
  
  psbt.addInput({
    hash: utxo.txid,
    index: utxo.vout,
    witnessUtxo: {
      script: output.script,
      value: BigInt(utxo.value)
    }
  })
  
  // Add signing info based on wallet type
  addInputSigningInfo(
    psbt, 
    i, 
    userAddress, 
    paymentPublicKey, 
    taprootPublicKey, 
    utxo.value
  )
}

// 5. Add outputs
const outputScript = bitcoin.address.toOutputScript(destinationAddress, bitcoin.networks.bitcoin)
psbt.addOutput({
  script: Buffer.from(outputScript),
  value: BigInt(outputAmount)
})

// Change output (if any)
if (changeAmount > 546) {  // Dust limit
  const changeScript = bitcoin.address.toOutputScript(userAddress, bitcoin.networks.bitcoin)
  psbt.addOutput({
    script: Buffer.from(changeScript),
    value: BigInt(changeAmount)
  })
}

// 6. Sign PSBT
const signedPsbt = await walletClient.signPsbt(psbt.toBase64(), true, false)

// 7. Check and finalize if needed
let txHex: string
const finalPsbt = bitcoin.Psbt.fromBase64(signedPsbt)
const requiresFinalization = finalPsbt.data.inputs.some(
  (input) => !input.finalScriptSig && !input.finalScriptWitness
)

if (requiresFinalization) {
  const finalizeResponse = await fetch('/api/finalize', {
    method: 'POST',
    body: JSON.stringify({ txBase64: signedPsbt })
  })
  const { hex } = await finalizeResponse.json()
  txHex = hex
} else {
  txHex = finalPsbt.extractTransaction().toHex()
}

// 8. Broadcast
await fetch('https://mempool.space/api/tx', {
  method: 'POST',
  headers: { 'Content-Type': 'text/plain' },
  body: txHex
})

// 9. Track used UTXOs
const usedOutpoints = selectedUtxos.map(u => `${u.txid}:${u.vout}`)
addExcludedUtxos(userAddress, usedOutpoints)
```

---

## 8. Important Constants and Thresholds

- **Dust Limit**: 546 sats (minimum output value)
- **UTXO Size Filter**: ≤800 sats excluded
- **UTXO Exclusion Expiry**: 1 hour
- **RBF Sequence**: `0xfffffffd` (allows replacement)
- **Child Anchor Size**: 140 vB (estimated CPFP child transaction size)
- **Minimum Change Output**: 546 sats (below this, add to fee instead)

---

## 9. Error Handling

### Common Issues

1. **"Insufficient funds"**
   - Check if UTXOs are filtered out (too small or excluded)
   - Verify exclusion list isn't blocking all UTXOs
   - Check if UTXOs are already spent

2. **"Transaction not finalized"**
   - Wallet signed but didn't finalize (Magic Eden)
   - Call `/api/finalize` before broadcasting

3. **"Fee too low"**
   - UTXO already in use in another pending transaction
   - Check exclusion list and wait for confirmation

4. **"RBF not possible"**
   - Transaction doesn't signal opt-in RBF (`sequence < 0xfffffffe`)
   - Not all inputs belong to wallet
   - Transaction already confirmed

---

## 10. Testing Recommendations

1. Test with each wallet type (P2TR, P2WPKH, P2SH)
2. Test UTXO filtering (small UTXOs, excluded UTXOs)
3. Test finalization flow (Magic Eden vs other wallets)
4. Test concurrent transactions (exclusion list)
5. Test RBF with insufficient change (should suggest CPFP)
6. Test dust output handling (should add to fee)

---

This documentation provides a complete guide to understanding and extending the speed up transaction system for building future PSBT-based transactions.


