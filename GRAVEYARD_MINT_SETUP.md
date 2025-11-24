# Graveyard Awaited Mints - Setup & Usage Guide

## Overview

This system allows users to mint their awaited ascended images from the graveyard page using the exact tapscript pattern from your self-inscribe system. The minting process includes:

- **Image compression** (WebP, 666x666, quality 70) to save on inscription fees
- **Tapscript-based inscriptions** using commit/reveal pattern
- **Gas fee input** for custom fee rates
- **Automatic status tracking** with mempool confirmation polling
- **Complete transaction history** stored in PostgreSQL

---

## Initial Setup

### ✨ Automatic Schema Initialization

**Good news!** The database schema is automatically created on first use. When you create your first commit transaction, the system will:
- Create the `mint_inscriptions` table
- Add `mint_status`, `compressed_image_url`, `is_compressed` fields to `ascended_images_mint_queue`
- Create all necessary indexes
- Mark tables as initialized to avoid redundant DDL operations

**Optional:** You can manually initialize the schema by calling:
```bash
POST http://localhost:3000/api/graveyard/init-mint-schema
```
But this is **not required** - the system handles it automatically! 🎉

### Step 1: Verify Environment Variables

Ensure these are set in your `.env`:

```env
# Sandshrew API (for broadcasting transactions)
SANDSHREW_URL=https://mainnet.sandshrew.io/v2
SANDSHREW_DEVELOPER_KEY=your_key_here

# Mempool API (for transaction confirmation)
MEMPOOL_API_URL=https://mempool.space/api

# PostgreSQL connection
DATABASE_URL=your_postgres_connection_string
```

---

## Database Schema

### mint_inscriptions Table

Tracks every mint inscription with complete transaction details:

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `mint_queue_id` | UUID | References ascended_images_mint_queue |
| `wallet_address` | TEXT | User's ordinal wallet |
| `payment_address` | TEXT | Payment wallet (if different) |
| `receiving_address` | TEXT | Where inscription is sent |
| `commit_tx_id` | TEXT | Commit transaction ID |
| `reveal_tx_id` | TEXT | Reveal transaction ID |
| `inscription_id` | TEXT | Final inscription ID (format: `{txid}i0`) |
| `original_image_url` | TEXT | Original 2MB image URL |
| `compressed_image_url` | TEXT | Compressed WebP URL |
| `compressed_base64` | TEXT | Base64 for inscription |
| `is_compressed` | BOOLEAN | Compression status |
| `fee_rate` | DECIMAL | sat/vB fee rate |
| `commit_fee_sats` | INTEGER | Commit transaction fee |
| `reveal_fee_sats` | INTEGER | Reveal transaction fee |
| `total_cost_sats` | INTEGER | Total cost in sats |
| `mint_status` | TEXT | Current status (see below) |
| `error_message` | TEXT | Error if failed |
| `reveal_data` | JSONB | Stored reveal data for creating reveal tx |
| Timestamps | TIMESTAMPTZ | Various timing fields |

### Mint Status Values

| Status | Description |
|--------|-------------|
| `pending` | Created, waiting for commit |
| `commit_signed` | Commit signed, waiting for broadcast |
| `commit_broadcast` | Commit broadcast, waiting for confirmation |
| `commit_confirmed` | Commit confirmed, creating reveal |
| `reveal_broadcast` | Reveal broadcast, waiting for confirmation |
| `completed` | Inscription complete and confirmed |
| `failed` | Failed at some step |

---

## API Endpoints

### 1. Initialize Schema
```
POST /api/graveyard/init-mint-schema
```
Run once to set up database tables.

### 2. Compress Image
```
POST /api/graveyard/mint/compress
Body: {
  "mintQueueId": "uuid",
  "imageUrl": "https://..."
}
```
Compresses image to WebP 666x666 @ quality 70.

### 3. Create Commit PSBT
```
POST /api/graveyard/mint/create-commit
Body: {
  "mintQueueId": "uuid",
  "compressedBase64": "base64_string",
  "userAddress": "bc1p...",
  "paymentAddress": "bc1q...",
  "paymentPubkey": "hex",
  "taprootPubkey": "hex",
  "feeRate": 0.22
}
```
Creates commit transaction PSBT using tapscript pattern.

Returns:
```json
{
  "success": true,
  "mintInscriptionId": "uuid",
  "commitPsbt": "base64_psbt",
  "commitOutputIndex": 0,
  "commitOutputValue": 12000,
  "fees": {
    "commitTxFee": 280,
    "revealTxFee": 11500,
    "totalCost": 11780
  }
}
```

### 4. Create Reveal Transaction
```
POST /api/graveyard/mint/create-reveal
Body: {
  "mintInscriptionId": "uuid",
  "commitTxId": "txid",
  "feeRate": 0.22
}
```
Creates and signs reveal transaction on server using stored reveal data.

Returns:
```json
{
  "success": true,
  "signedTxHex": "hex",
  "txId": "txid",
  "transaction": {
    "commitTxId": "txid",
    "commitOutputValue": 12000,
    "totalOutputValue": 330,
    "transactionFee": 11670
  }
}
```

### 5. Broadcast Transaction
```
POST /api/graveyard/mint/broadcast
Body: {
  "mintInscriptionId": "uuid",
  "txHex": "hex",
  "txType": "commit" | "reveal",
  "feeRate": 0.22
}
```
Broadcasts transaction using smart routing:
- Fee rate < 1 sat/vB: Try Sandshrew first, fallback to mempool.space
- Fee rate >= 1 sat/vB: Try mempool.space first, fallback to Sandshrew

### 6. Check Status
```
POST /api/graveyard/mint/check-status
Body: {
  "mintInscriptionId": "uuid",
  "pollForConfirmation": true
}
```
Checks mint status and polls mempool for confirmations.

### 7. Get Mint Queue
```
GET /api/graveyard/mint-queue?wallet=bc1p...
```
Returns all mint queue records for a wallet with mint inscription status.

---

## React Component Usage

### MintButton Component

The `MintButton` component handles the entire mint flow:

```tsx
import { MintButton } from '@/components/MintButton'

<MintButton
  mintQueueId="uuid"
  imageUrl="https://original-2mb-image.png"
  compressedImageUrl="https://compressed.webp"
  isCompressed={false}
  onMintComplete={() => {
    // Refresh data
    fetchMintQueueImages()
  }}
  onMintStart={() => {
    toast.info('Minting started', 'Please sign in your wallet')
  }}
/>
```

### Features

- **Gas Input**: User can set custom fee rate (0.1 - 1000 sat/vB)
- **Auto-compression**: Compresses if not already compressed
- **Wallet Signing**: Uses LaserEyes to sign commit PSBT
- **Status Updates**: Real-time status display
- **Confirmation Polling**: Automatically polls mempool every 10 seconds
- **Transaction Links**: Clickable links to mempool.space and ordinals.com
- **Error Handling**: Shows detailed error messages

---

## Minting Flow

### Complete Flow Diagram

```
1. User clicks "Mint" button
   ↓
2. [Optional] Compress image if not already compressed
   ↓
3. Create commit PSBT (tapscript pattern)
   - Generate inscription keypair
   - Create inscription script
   - Create taproot address
   - Build commit transaction PSBT
   - Store reveal data in database
   ↓
4. User signs commit PSBT in wallet
   ↓
5. Broadcast commit transaction
   - Update status to 'commit_broadcast'
   ↓
6. Poll mempool for commit confirmation (every 10 seconds)
   ↓
7. Commit confirmed
   - Update status to 'commit_confirmed'
   ↓
8. Create reveal transaction (server-side)
   - Retrieve reveal data from database
   - Recreate tapscript
   - Sign with inscription private key
   ↓
9. Broadcast reveal transaction
   - Update status to 'reveal_broadcast'
   - Predict inscription ID: {reveal_txid}i0
   ↓
10. Poll mempool for reveal confirmation
    ↓
11. Reveal confirmed
    - Update status to 'completed'
    - Update mint_queue status to 'minted'
    - Show inscription ID
```

### Status Lifecycle

```
pending
  → commit_signed
    → commit_broadcast
      → commit_confirmed (polling)
        → creating_reveal
          → reveal_broadcast
            → completed (polling)

(Any step can go to → failed)
```

---

## Compression Settings

Uses the exact same settings as `/api/damned/compress`:

```javascript
sharp(imageBuffer)
  .resize(666, 666, { 
    fit: 'inside',
    withoutEnlargement: true 
  })
  .webp({ 
    quality: 70, 
    effort: 6 
  })
  .toBuffer()
```

- **Format**: WebP
- **Dimensions**: 666x666 (maintains aspect ratio, no upscaling)
- **Quality**: 70
- **Effort**: 6 (compression level)
- **Storage**: Uploaded to Vercel Blob Storage

---

## Testing

### Test the complete flow:

1. **Visit graveyard page** (tables initialize automatically on first mint):
```
http://localhost:3000/graveyard
```

2. **Connect wallet** with awaited mints

3. **Set gas fee** (e.g., 0.22 sat/vB)

4. **Click "Mint"** button

5. **Sign in wallet** when prompted

6. **Wait for confirmations** (automatic polling)

7. **Verify inscription** on ordinals.com

### Check mint status programmatically:

```javascript
const response = await fetch('/api/graveyard/mint/check-status', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    mintInscriptionId: 'your-mint-id',
    pollForConfirmation: true
  })
})

const data = await response.json()
console.log('Status:', data.mint.status)
console.log('Inscription ID:', data.mint.inscriptionId)
```

---

## Migration Notes

### Differences from Old System

**Removed:**
- ❌ Old `/api/broadcast-transaction` (replaced with `/api/graveyard/mint/broadcast`)
- ❌ MongoDB dependencies for mint tracking
- ❌ Separate commit/reveal API calls (now automated)

**New Features:**
- ✅ Complete PostgreSQL tracking
- ✅ Automatic confirmation polling
- ✅ Mint status lifecycle
- ✅ Compression checking
- ✅ Smart broadcast routing
- ✅ Error tracking

### Database Migration

The schema is **additive** - it adds new tables and fields without removing existing ones. Safe to run in production.

---

## Troubleshooting

### Common Issues

**Issue:** "Mint queue record not found"
- **Solution**: Ensure the user has awaited mints in their queue

**Issue:** "Wallet address does not match"
- **Solution**: User must connect with the same wallet that created the awaited mint

**Issue:** "Insufficient funds"
- **Solution**: User needs more sats in payment wallet

**Issue:** "Broadcast failed"
- **Solution**: Check Sandshrew API key and mempool.space connectivity

**Issue:** "Commit confirmed but reveal not created"
- **Solution**: Check server logs for reveal creation errors

### Debugging

Enable detailed logging:

```javascript
// Check mint status
console.log('Checking mint:', mintInscriptionId)

// Check database record
SELECT * FROM mint_inscriptions WHERE id = 'your-mint-id';

// Check transaction on mempool.space
https://mempool.space/tx/{commit_tx_id}
https://mempool.space/tx/{reveal_tx_id}
```

---

## Production Checklist

Before deploying to production:

- [ ] Verify environment variables are set (tables initialize automatically)
- [ ] Test with small fee rate first (0.22 sat/vB)
- [ ] Verify compression is working
- [ ] Test complete mint flow end-to-end
- [ ] Monitor first few mints closely
- [ ] Set up error alerting for failed mints
- [ ] Back up database regularly

---

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Review server logs for detailed error messages
3. Verify database records in `mint_inscriptions` table
4. Check mempool.space for transaction status

---

## Architecture Summary

```
User Interface (Graveyard Page)
    ↓
MintButton Component (React)
    ↓
API Endpoints (Next.js Route Handlers)
    ↓
Tapscript Utils (self-inscribe/utils)
    ↓
Database (PostgreSQL mint_inscriptions table)
    ↓
Blockchain (Bitcoin Taproot Inscriptions)
```

All using the **exact same tapscript pattern** as your working self-inscribe system! 🎉

