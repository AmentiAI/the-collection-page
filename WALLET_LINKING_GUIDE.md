# Multi-Wallet Linking Feature

## Overview
Users can now link multiple Bitcoin wallets to a single profile, aggregating all holdings and progress across wallets.

## What Was Implemented

### 1. Database Schema (`linked_wallets` table)
- `primary_wallet`: The main wallet that owns the profile
- `linked_wallet`: Additional wallet linked to the primary
- `signature`: Cryptographic proof of ownership
- `message`: The signed message for verification
- `is_active`: Soft delete flag for unlinking
- Unique constraints prevent double-linking

### 2. API Routes

#### `/api/wallet/link` (POST)
Links a new wallet to a profile.
```json
{
  "primaryWallet": "bc1q...",
  "linkedWallet": "bc1q...",
  "signature": "base64_signature",
  "message": "Link this wallet to bc1q... Timestamp: 1234567890 Nonce: uuid"
}
```

#### `/api/wallet/unlink` (POST)
Unlinks a wallet from a profile.
```json
{
  "primaryWallet": "bc1q...",
  "linkedWallet": "bc1q..."
}
```

#### `/api/wallet/linked` (GET)
Fetches all linked wallets for an address.
```
GET /api/wallet/linked?walletAddress=bc1q...
```

Returns:
```json
{
  "primaryWallet": "bc1q...",
  "linkedWallets": [
    {"wallet": "bc1q...", "linkedAt": "2025-11-20T..."}
  ],
  "allWallets": ["bc1q...", "bc1q..."],
  "isLinkedWallet": false
}
```

### 3. Frontend Component (`LinkedWalletsManager`)
- Located at: `app/components/LinkedWalletsManager.tsx`
- Shows primary wallet and all linked wallets
- Handles linking workflow with LaserEyes `signMessage`
- Allows unlinking wallets
- Shows current wallet status

### 4. Profile Page Integration
The `LinkedWalletsManager` component is now displayed on the profile page between the Discord/Twitter section and the Help section.

## User Workflow

### To Link a New Wallet:
1. User connects with their **primary wallet** (Wallet A)
2. User clicks "Link New Wallet" on their profile page
3. User **disconnects** Wallet A and **connects** the wallet they want to link (Wallet B)
4. User clicks "Sign & Link Current Wallet"
5. LaserEyes prompts to sign a message proving ownership of Wallet B
6. System verifies the signature and creates the link
7. User can switch back to Wallet A

### To Unlink a Wallet:
1. Connect with any wallet (primary or linked)
2. Click the unlink button next to the linked wallet
3. Confirm the action

## Security Features

✅ **Cryptographic Proof**: Uses LaserEyes `signMessage` for verification
✅ **Timestamp Validation**: Messages expire after 5 minutes to prevent replay attacks
✅ **Unique Constraints**: Prevents a wallet from being linked to multiple profiles
✅ **Soft Delete**: Unlinking uses `is_active=FALSE` for audit trail
✅ **Wallet Ownership**: Only the wallet owner can link it (must sign message)

## Future Database Query Updates

When querying for user data across multiple wallets, use this pattern:

```sql
SELECT * FROM table_name
WHERE LOWER(wallet_column) IN (
  SELECT LOWER(linked_wallet) 
  FROM linked_wallets 
  WHERE LOWER(primary_wallet) = LOWER($1) AND is_active = TRUE
  UNION
  SELECT LOWER($1)
)
```

This will aggregate data from:
- The primary wallet
- All actively linked wallets

## Benefits

✅ Users can aggregate holdings from multiple wallets
✅ One profile for all wallets
✅ Cryptographic proof of ownership via signatures
✅ Can unlink wallets if needed
✅ No need to stay connected to all wallets
✅ Seamless switching between wallets

## Implementation Notes

- **LaserEyes Integration**: Uses native `signMessage` - no additional Bitcoin libraries needed
- **Primary Wallet**: The first wallet that creates the profile
- **Linked Wallets**: Additional wallets that share the same profile
- **Wallet Switching**: Users disconnect and reconnect to switch wallets (LaserEyes handles this)
- **Signature Format**: LaserEyes returns base64 signature, stored for verification and audit

