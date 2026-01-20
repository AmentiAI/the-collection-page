# Runes Transfer Encoding Guide

A comprehensive guide for encoding rune transfers in Bitcoin transactions using OP_RETURN outputs (Runestones).

## Overview

The Runes protocol uses **Runestones** - special OP_RETURN outputs that encode rune operations (etching, minting, transferring). This guide focuses on **transferring runes** between addresses.

## Key Concepts

### Runestone
A Runestone is a Bitcoin transaction output whose `scriptPubKey` starts with `OP_RETURN OP_13`, followed by data pushes containing the encoded rune operations.

### Edicts
Edicts are transfer instructions that specify:
- **Rune ID**: Which rune is being transferred (block height + transaction index)
- **Amount**: How many units to transfer
- **Output Index**: Which transaction output receives the runes

### Rune ID Format
Rune IDs are represented as `block:tx` (e.g., `840000:5`), where:
- `block` = block height where the rune was etched
- `tx` = transaction index within that block

---

## OP_RETURN Structure

### Script Format
```
OP_RETURN OP_13 [data push 1] [data push 2] ... [data push N]
```

- **OP_RETURN** (0x6a): Marks this as an unspendable output
- **OP_13** (0x5d): Protocol identifier for Runes
- **Data pushes**: One or more pushdata opcodes (≤ 78 bytes each) containing the payload

### Payload Encoding

The concatenated data pushes form a **payload buffer** that is decoded as:
1. A sequence of **128-bit unsigned integers** encoded using **LEB128 varint** encoding
2. These integers represent:
   - **Fields**: Tags and values for etching/minting (if applicable)
   - **Edicts**: Transfer instructions (rune ID, amount, output index)

---

## LEB128 Varint Encoding

LEB128 (Little-Endian Base-128) is a variable-length integer encoding:

- Each byte contains 7 bits of data + 1 continuation bit
- If the continuation bit (MSB) is set, more bytes follow
- Maximum value: 128-bit (u128)

### Example Encoding
```
Value: 300
Binary: 100101100
LEB128: [0b10101100, 0b00000010]
        (0xAC, 0x02)
```

---

## Edict Structure

Each edict is a **4-integer tuple**:

1. **Block Height** (u64): Block where rune was etched
2. **Transaction Index** (u32): Transaction index within that block
3. **Amount** (u128): Number of rune units to transfer
4. **Output Index** (u32): Which output receives the runes (0-based)

### Delta Encoding

Edicts must be **sorted by Rune ID** (block, then tx), then **delta-encoded**:

- First edict: Uses absolute values for block and tx
- Subsequent edicts: Use deltas relative to the previous edict

**Example:**
```
Edicts (unsorted):
  Rune 100:5 → 10 units → output 1
  Rune 50:2  → 5 units  → output 0
  Rune 100:7 → 20 units → output 2

Sorted by Rune ID:
  Rune 50:2  → 5 units  → output 0
  Rune 100:5 → 10 units → output 1
  Rune 100:7 → 20 units → output 2

Delta-encoded:
  Edict 1: block=50, tx=2, amount=5, output=0
  Edict 2: block_delta=50, tx_delta=3, amount=10, output=1
  Edict 3: block_delta=0, tx_delta=2, amount=20, output=2
```

---

## Building a Transfer Transaction

### Step 1: Gather Inputs

Collect UTXOs that contain the rune balances you want to transfer:
- Each input UTXO must have rune balances
- The total input rune balance must be ≥ the amount you want to transfer

### Step 2: Create Transaction Outputs

Build your transaction outputs:
- **Recipient outputs**: Addresses that will receive runes
- **Change output**: Your address for remaining runes (if any)
- **OP_RETURN output**: The Runestone (must be first OP_RETURN OP_13 output)

**Important**: Output indices in edicts refer to **all outputs** in the transaction, including the OP_RETURN.

### Step 3: Build the Runestone

#### 3.1 Prepare Edicts

For each rune transfer:
1. Identify the rune ID (block:tx)
2. Determine the amount to transfer
3. Determine the output index (which output receives it)

**Example:**
```typescript
const edicts = [
  {
    runeId: { block: 840000, tx: 5 },  // Rune "DOGGOTOTHEMOON"
    amount: BigInt("100000000000"),    // Amount to transfer
    output: 1                           // Output index 1 (first recipient)
  },
  {
    runeId: { block: 840100, tx: 2 },  // Different rune
    amount: BigInt("50000000000"),
    output: 2                           // Output index 2 (second recipient)
  }
]
```

#### 3.2 Sort Edicts

Sort by Rune ID (block first, then tx):
```typescript
edicts.sort((a, b) => {
  if (a.runeId.block !== b.runeId.block) {
    return a.runeId.block - b.runeId.block
  }
  return a.runeId.tx - b.runeId.tx
})
```

#### 3.3 Delta Encode

Apply delta encoding to block and tx values:
```typescript
let prevBlock = 0
let prevTx = 0

const deltaEncoded = edicts.map(edict => {
  const blockDelta = edict.runeId.block - prevBlock
  const txDelta = edict.runeId.tx - prevTx
  
  prevBlock = edict.runeId.block
  prevTx = edict.runeId.tx
  
  return {
    blockDelta,
    txDelta,
    amount: edict.amount,
    output: edict.output
  }
})
```

#### 3.4 Encode as LEB128

Convert each integer to LEB128:
```typescript
function encodeLEB128(value: bigint): Uint8Array {
  const bytes: number[] = []
  let remaining = value
  
  while (remaining >= 0x80n) {
    bytes.push(Number(remaining & 0x7Fn) | 0x80)
    remaining >>= 7n
  }
  bytes.push(Number(remaining))
  
  return new Uint8Array(bytes)
}

// Encode each edict
const payload: Uint8Array[] = []
for (const edict of deltaEncoded) {
  payload.push(encodeLEB128(BigInt(edict.blockDelta)))
  payload.push(encodeLEB128(BigInt(edict.txDelta)))
  payload.push(encodeLEB128(edict.amount))
  payload.push(encodeLEB128(BigInt(edict.output)))
}
```

#### 3.5 Build OP_RETURN Script

Concatenate all payload bytes and create data pushes:
```typescript
const fullPayload = Buffer.concat(payload)

// Split into chunks ≤ 78 bytes (PUSHDATA78 limit)
const chunks: Buffer[] = []
for (let i = 0; i < fullPayload.length; i += 78) {
  chunks.push(fullPayload.slice(i, i + 78))
}

// Build script: OP_RETURN OP_13 [pushdata chunks]
const script: (number | Buffer)[] = [
  0x6a,  // OP_RETURN
  0x5d,  // OP_13
]

for (const chunk of chunks) {
  if (chunk.length <= 75) {
    script.push(chunk.length)  // OP_PUSHDATA1-75
  } else if (chunk.length <= 255) {
    script.push(0x4c)  // OP_PUSHDATA1
    script.push(chunk.length)
  } else {
    script.push(0x4d)  // OP_PUSHDATA2
    script.push(chunk.length & 0xFF)
    script.push((chunk.length >> 8) & 0xFF)
  }
  script.push(chunk)
}
```

### Step 4: Add OP_RETURN Output to Transaction

```typescript
// Add OP_RETURN output (value = 0, unspendable)
psbt.addOutput({
  script: Buffer.from(script),
  value: 0n
})
```

---

## Handling Multiple Runes

### Multiple Runes, Multiple Outputs

You can transfer multiple different runes in a single transaction:

```typescript
const transfers = [
  { rune: "840000:5", amount: "100000000000", to: outputIndex1 },
  { rune: "840100:2", amount: "50000000000", to: outputIndex2 },
  { rune: "840000:5", amount: "200000000000", to: outputIndex3 },  // Same rune, different output
]

// Sort and delta-encode as described above
```

### Unallocated Runes (Pointer)

If you don't allocate all input runes via edicts, remaining runes go to:
- **Default**: First non-OP_RETURN output
- **Pointer field**: A specific output index (if set)

To set a pointer, include a **Pointer tag** in the runestone before edicts.

---

## Special Cases

### Amount = 0

If an edict has `amount = 0`, it means **"all remaining unallocated units"** of that rune.

### Output Index = Number of Outputs

If `output = number_of_outputs`, it's treated as a **burn** (runes are destroyed).

---

## Validation Rules

The indexer will reject (cenotaph) if:

1. ❌ Multiple `OP_RETURN OP_13` outputs (only first is used)
2. ❌ Non-data-push opcodes after `OP_13`
3. ❌ Invalid LEB128 encoding (overflow, truncated)
4. ❌ Output index exceeds number of outputs
5. ❌ Malformed edict structure
6. ❌ Edicts not sorted by Rune ID
7. ❌ Invalid delta encoding

---

## Complete Example

### Scenario
Transfer two different runes:
- Rune `840000:5`: Send 100 units to output 1
- Rune `840200:10`: Send 50 units to output 2
- Remaining runes go to change output (index 3)

### Transaction Structure
```
Inputs:
  - UTXO 1: Contains rune 840000:5 (balance: 200)
  - UTXO 2: Contains rune 840200:10 (balance: 100)

Outputs:
  0: OP_RETURN (Runestone)
  1: Recipient 1 address (receives 100 of rune 840000:5)
  2: Recipient 2 address (receives 50 of rune 840200:10)
  3: Change address (receives remaining 100 of rune 840000:5)
```

### Edicts
```typescript
[
  { runeId: { block: 840000, tx: 5 }, amount: 100n, output: 1 },
  { runeId: { block: 840200, tx: 10 }, amount: 50n, output: 2 },
  { runeId: { block: 840000, tx: 5 }, amount: 0n, output: 3 }  // All remaining
]
```

### Delta-Encoded
```typescript
[
  { blockDelta: 840000, txDelta: 5, amount: 100n, output: 1 },
  { blockDelta: 200, txDelta: 5, amount: 50n, output: 2 },
  { blockDelta: -200, txDelta: -5, amount: 0n, output: 3 }
]
```

---

## Implementation Checklist

- [ ] Collect input UTXOs with rune balances
- [ ] Create recipient outputs
- [ ] Create change output (if needed)
- [ ] Build edicts for each transfer
- [ ] Sort edicts by Rune ID
- [ ] Delta-encode block and tx values
- [ ] Encode all integers as LEB128
- [ ] Build OP_RETURN script with data pushes
- [ ] Add OP_RETURN output to transaction (value = 0)
- [ ] Validate output indices are in range
- [ ] Test with a rune indexer

---

## References

- [Runes Specification](https://docs.ordinals.com/runes/specification.html)
- [Runes Documentation](https://docs.ordinals.com/runes.html)
- LEB128 encoding: Standard variable-length integer encoding

---

## Notes

- OP_RETURN outputs have **0 sats** (unspendable)
- Rune balances live in **normal UTXOs** (spendable outputs)
- The Runestone only contains **instructions** for where runes go
- Always test with a small amount first
- Malformed runestones cause runes to be **burned** (cenotaph)
