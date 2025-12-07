# Wallet Connect & LaserEyes Integration Documentation

This document outlines the wallet connection system and LaserEyes integration used by the Ordzaar platform for Bitcoin wallet connectivity and transaction signing.

## Overview

The platform uses LaserEyes (`@omnisat/lasereyes`) as the primary wallet integration framework, providing a unified interface for connecting to various Bitcoin wallets and handling transaction signing. The implementation uses `LaserEyesWrapper` component in `app/layout.tsx` which dynamically imports `LaserEyesProvider` from `@omnisat/lasereyes` and wraps a custom `WalletProvider` that adds verification logic.

## Architecture Components

### Core Libraries
- `@omnisat/lasereyes`: React-specific LaserEyes components (primary package)
- `@omnisat/lasereyes-core`: Core wallet integration framework (used internally)
- `@omnisat/lasereyes-react`: Additional React utilities (available but not primary)
- `bitcoinjs-lib`: Bitcoin transaction handling (when needed for PSBT operations)
- `@bitcoinerlab/secp256k1`: Cryptographic operations (when needed for signing)

### Critical Import Patterns

#### Primary LaserEyes Imports (React Components)
```typescript
// Main LaserEyes React hook and provider
import { 
  LaserEyesProvider,
  useLaserEyes,
  UNISAT,
  XVERSE,
  PHANTOM,
  MAGIC_EDEN
} from '@omnisat/lasereyes'
```

#### LaserEyes Core Imports (Advanced/Internal Use Only)
```typescript
// Core LaserEyes functionality (rarely needed directly)
import { 
  LaserEyesClient, 
  createStores, 
  createConfig, 
  type ProviderType 
} from '@omnisat/lasereyes-core'
```

#### Bitcoin.js Integration
```typescript
// Bitcoin transaction handling
import * as bitcoin from 'bitcoinjs-lib'
import { ECPairFactory } from 'ecpair'
import * as ecc from '@bitcoinerlab/secp256k1'

// Initialize ECC library
bitcoin.initEccLib(ecc)
const ECPair = ECPairFactory(ecc)
```

#### LaserEyes Types and Utilities
```typescript
// Network types and utilities
import {
  NetworkType,
  P2TR,
  P2WPKH,
  P2WSH,
  P2SH,
  P2PKH,
  SIGNET,
  TESTNET,
  TESTNET4,
  P2SH_P2WPKH,
  EsploraUtxo,
  OYLNET,
  LasereyesUTXO,
} from '@omnisat/lasereyes'
```

### Common Import Issues and Solutions

#### Issue 1: Mixed Core and React Imports
❌ **Wrong** - Don't mix core and React imports:
```typescript
// DON'T DO THIS
import { LaserEyesClient } from '@omnisat/lasereyes' // Wrong package
import { useLaserEyes } from '@omnisat/lasereyes-core' // Wrong package
```

✅ **Correct** - Use the right package for each:
```typescript
// Core functionality
import { LaserEyesClient } from '@omnisat/lasereyes-core'

// React hooks
import { useLaserEyes } from '@omnisat/lasereyes'
```

#### Issue 2: Provider Import Confusion
❌ **Wrong** - Don't import providers from wrong package:
```typescript
// DON'T DO THIS
import { UNISAT, XVERSE } from '@omnisat/lasereyes-core' // Providers not in core
```

✅ **Correct** - Import providers from React package:
```typescript
// Provider constants
import { UNISAT, XVERSE, OYL, MAGIC_EDEN, LEATHER } from '@omnisat/lasereyes'
```

#### Issue 3: Type Import Issues
❌ **Wrong** - Don't import types from wrong package:
```typescript
// DON'T DO THIS
import { ProviderType } from '@omnisat/lasereyes' // Types not in React package
```

✅ **Correct** - Import types from core package:
```typescript
// Type definitions
import { type ProviderType } from '@omnisat/lasereyes-core'
```

### Complete Import Examples

#### For Wallet Connection Components
```typescript
"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import Link from "next/link"

// LaserEyes imports
import { UNISAT, XVERSE, OYL, MAGIC_EDEN, LEATHER } from "@omnisat/lasereyes"
import { useWallet } from "@/lib/wallet/compatibility"

// UI components
import { User, FolderOpen, FileText, Copy, RefreshCw, ChevronDown, Bitcoin, Receipt, CheckCircle, XCircle, Clock, Star, Coins } from "lucide-react"
```

#### For Provider Setup
```typescript
"use client"

import type React from "react"

// LaserEyes React provider
import { LaserEyesProvider as LaserEyesProviderOriginal } from "@omnisat/lasereyes"

// Custom wallet provider
import { WalletProvider } from "@/lib/wallet/compatibility"

export function LaserEyesProvider({ children }: { children: React.ReactNode }) {
  return (
    <LaserEyesProviderOriginal config={{ network: "mainnet" }}>
      <WalletProvider>{children}</WalletProvider>
    </LaserEyesProviderOriginal>
  )
}
```

#### For Wallet Context/Compatibility Layer
```typescript
"use client"

import React, { createContext, useContext, useState, useEffect, useCallback } from "react"

// LaserEyes React hook
import { useLaserEyes } from "@omnisat/lasereyes"

// Types
interface WalletContextType {
  isConnected: boolean
  currentAddress: string | null
  client: any
  isVerified: boolean
  isVerifying: boolean
  verifyWallet: () => Promise<boolean>
  connect: (provider: any) => Promise<void>
  disconnect: () => void
}
```

#### For Transaction Signing
```typescript
import * as bitcoin from 'bitcoinjs-lib'
import { ECPairFactory } from 'ecpair'
import * as ecc from '@bitcoinerlab/secp256k1'

// Initialize ECC library
bitcoin.initEccLib(ecc)
const ECPair = ECPairFactory(ecc)

// LaserEyes client for signing
const { client } = useLaserEyes()

// Sign PSBT
const signedResult = await client.signPsbt(psbtBase64, false, false)
```

### Package.json Dependencies
```json
{
  "dependencies": {
    "@omnisat/lasereyes": "^0.0.161",
    "@omnisat/lasereyes-core": "^0.0.83",
    "@omnisat/lasereyes-react": "^0.0.78",
    "bitcoinjs-lib": "^6.1.5",
    "ecpair": "^2.0.1",
    "@bitcoinerlab/secp256k1": "^1.1.3"
  }
}
```

### TypeScript Configuration
```json
{
  "compilerOptions": {
    "moduleResolution": "node",
    "allowSyntheticDefaultImports": true,
    "esModuleInterop": true
  }
}
```

### Key Files
- `components/WalletConnect.tsx`: Main wallet connection UI component (uses `useLaserEyes()` directly)
- `components/LaserEyesWrapper.tsx`: **Primary provider wrapper** used in `app/layout.tsx` (dynamically imports LaserEyesProvider)
- `lib/wallet/compatibility.tsx`: Wallet compatibility layer with `useWallet()` hook (adds verification logic)
- `providers/LaserEyesProvider.tsx`: Alternative provider wrapper (not currently used in layout)
- `lib/wallet/context.tsx`: Legacy wallet context (deprecated, not used)

## Supported Wallets

LaserEyes Core supports the following Bitcoin wallets:

### Currently Supported Wallets
- **UniSat** - Popular Bitcoin wallet with Ordinals support (`UNISAT`)
- **Xverse** - Multi-chain wallet with Bitcoin focus (`XVERSE`)
- **Phantom** - Multi-chain wallet (`PHANTOM`)
- **Magic Eden** - NFT marketplace wallet (`MAGIC_EDEN`)
- **OYO** - Custom wallet integration (handled separately, not via LaserEyes)

### Available but Not Currently Used
- **Oyl** - Available in LaserEyes but not in WalletConnect component
- **Leather** - Available in LaserEyes but not in WalletConnect component
- **OKX** - Available in LaserEyes but not in WalletConnect component

## Network Support

LaserEyes supports multiple Bitcoin networks:
- **mainnet** - Production Bitcoin network (default)
- **testnet3** - Bitcoin testnet
- **testnet4** - Bitcoin testnet4
- **fractal** - Fractal Bitcoin network
- **fractal testnet** - Fractal testnet
- **signet** - Bitcoin signet

## useWallet Hook Architecture & Placement

### Component Hierarchy
```
App Root (app/layout.tsx)
├── ToastProvider
│   └── LaserEyesWrapper (components/LaserEyesWrapper.tsx)
│       ├── DynamicLaserEyesProvider (from @omnisat/lasereyes, dynamically imported)
│       │   └── WalletProvider (lib/wallet/compatibility.tsx)
│       │       └── All Components
│       │           ├── WalletConnect.tsx (uses useLaserEyes() directly)
│       │           ├── BattlePage (uses useLaserEyes() directly)
│       │           ├── DungeonCrawlPage (uses useLaserEyes() directly)
│       │           └── Other Components (may use useWallet() or useLaserEyes())
│       └── MusicPlayerProvider
```

### useWallet Hook Locations

#### 1. **useLaserEyes Hook** (Primary - Used Directly)
**Package**: `@omnisat/lasereyes`
```typescript
import { useLaserEyes } from '@omnisat/lasereyes'

// Returns: { connected, address, balance, client, connect, disconnect }
const { connected, address, balance, client, connect, disconnect } = useLaserEyes()
```
**Used in**: `WalletConnect.tsx`, `battle/page.tsx`, `dungeon-crawl/page.tsx`, and many other pages

#### 2. **useWallet Hook** (Secondary - Adds Verification)
**File**: `lib/wallet/compatibility.tsx`
```typescript
import { useWallet } from '@/lib/wallet/compatibility'

// Returns: { isConnected, currentAddress, client, isVerified, isVerifying, verifyWallet, connect, disconnect }
const { isConnected, currentAddress, client, isVerified, verifyWallet } = useWallet()
```
**Used in**: Some tools pages that need verification logic

#### 3. **Legacy Hook Definition** (Deprecated - Not Used)
**File**: `lib/wallet/context.tsx`
- This file exists but is not imported or used anywhere in the codebase

### Provider Setup Chain

#### 1. **LaserEyesWrapper** (`components/LaserEyesWrapper.tsx`) - **ACTUALLY USED**
```typescript
'use client'

import { ReactNode } from 'react'
import dynamic from 'next/dynamic'
import { WalletProvider } from '@/lib/wallet/compatibility'

const DynamicLaserEyesProvider = dynamic(
  () => import('@omnisat/lasereyes').then((mod) => mod.LaserEyesProvider),
  { ssr: false, loading: () => null }
)

export default function LaserEyesWrapper({ children }: { children: ReactNode }) {
  return (
    <DynamicLaserEyesProvider config={{ network: 'mainnet' }}>
      <WalletProvider>{children}</WalletProvider>
    </DynamicLaserEyesProvider>
  )
}
```
**Used in**: `app/layout.tsx` as the root provider

#### 2. **LaserEyesProvider** (`providers/LaserEyesProvider.tsx`) - **NOT CURRENTLY USED**
```typescript
// This file exists but is NOT used in app/layout.tsx
// LaserEyesWrapper is used instead
```

#### 3. **WalletProvider** (`lib/wallet/compatibility.tsx`)
```typescript
export function WalletProvider({ children }: { children: React.ReactNode }) {
  const { connected, address, client } = useLaserEyes()
  
  // Wallet verification and state management
  const [isVerified, setIsVerified] = useState(false)
  const [isVerifying, setIsVerifying] = useState(false)
  const [userCancelled, setUserCancelled] = useState(false)
  
  // Context value
  const value: WalletContextType = {
    isConnected: connected,
    currentAddress: address,
    client,
    isVerified,
    isVerifying,
    verifyWallet,
    connect: async (provider: any) => { /* ... */ },
    disconnect: () => { /* ... */ },
  }

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
}
```

### useWallet Usage Examples

#### 1. **WalletConnect Component** - **ACTUAL IMPLEMENTATION**
```typescript
// components/WalletConnect.tsx
import { useLaserEyes, UNISAT, XVERSE, PHANTOM, MAGIC_EDEN } from '@omnisat/lasereyes'

export default function WalletConnect() {
  const { connect, disconnect, connected, address, balance, client } = useLaserEyes()
  
  // Component logic...
  // Uses useLaserEyes() directly, not useWallet()
}
```

#### 2. **Battle Page** - **ACTUAL IMPLEMENTATION**
```typescript
// app/battle/page.tsx
import { useLaserEyes } from '@omnisat/lasereyes'

export default function BattlePage() {
  const { connected, address } = useLaserEyes()
  
  // Battle logic...
  // Uses useLaserEyes() directly
}
```

#### 3. **Dungeon Crawl Page** - **ACTUAL IMPLEMENTATION**
```typescript
// app/dungeon-crawl/page.tsx
import { useLaserEyes } from '@omnisat/lasereyes'

export default function DungeonCrawlPage() {
  const { connected, address } = useLaserEyes()
  
  // Dungeon crawl logic...
  // Uses useLaserEyes() directly
}
```

#### 4. **Tools Pages** - **ACTUAL IMPLEMENTATION**
```typescript
// app/tools/speedup/page.tsx
import { useWallet } from '@/lib/wallet/compatibility'
import { useLaserEyes } from '@omnisat/lasereyes'

export default function SpeedupPage() {
  const { isConnected, currentAddress, client } = useWallet() // Uses useWallet for verification
  const { balance } = useLaserEyes() // Also uses useLaserEyes for balance
  
  // Tools logic...
}
```

### Hook Interface

#### **useLaserEyes Interface** (from @omnisat/lasereyes) - **PRIMARY**
```typescript
// Returned by useLaserEyes() hook
interface LaserEyesContext {
  connected: boolean
  address: string | null
  balance: number | null
  client: LaserEyesClient | null
  connect: (provider: any) => Promise<void>
  disconnect: () => void
}
```

#### **useWallet Interface** (compatibility.tsx) - **SECONDARY**
```typescript
// Returned by useWallet() hook - wraps useLaserEyes with verification
interface WalletContextType {
  isConnected: boolean        // Alias for connected
  currentAddress: string | null // Alias for address
  client: any
  isVerified: boolean          // Additional verification state
  isVerifying: boolean        // Verification in progress
  verifyWallet: () => Promise<boolean> // Message signing verification
  connect: (provider: any) => Promise<void>
  disconnect: () => void
}
```

#### **Legacy useWallet Interface** (context.tsx - deprecated, NOT USED)
- This interface exists in `lib/wallet/context.tsx` but the file is not imported anywhere
- Do not use this - it's legacy code

### Migration Notes

#### **Primary Implementation** (Most Common)
- **Package**: `@omnisat/lasereyes`
- **Hook**: `useLaserEyes()`
- **Features**: Direct access to LaserEyes functionality, connection state, balance
- **Import**: `import { useLaserEyes } from "@omnisat/lasereyes"`
- **Used in**: `WalletConnect.tsx`, `battle/page.tsx`, `dungeon-crawl/page.tsx`, most pages

#### **Secondary Implementation** (When Verification Needed)
- **File**: `lib/wallet/compatibility.tsx`
- **Hook**: `useWallet()`
- **Uses**: Wraps `useLaserEyes()` with additional verification logic
- **Features**: Message signing verification, session management, verification state
- **Import**: `import { useWallet } from "@/lib/wallet/compatibility"`
- **Used in**: Some tools pages that require wallet verification

#### **Legacy Implementation** (Deprecated - NOT USED)
- **File**: `lib/wallet/context.tsx`
- **Status**: File exists but is not imported anywhere in the codebase
- **Do not use**: This is old code that should be removed

### Provider Placement in App Structure

#### **Root Layout** (`app/layout.tsx`) - **ACTUAL IMPLEMENTATION**
```typescript
import LaserEyesWrapper from '@/components/LaserEyesWrapper'
import { ToastProvider } from '@/components/Toast'
import { MusicPlayerProvider } from '@/providers/MusicPlayerProvider'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ToastProvider>
          <LaserEyesWrapper>
            <MusicPlayerProvider>
              {children}
            </MusicPlayerProvider>
          </LaserEyesWrapper>
        </ToastProvider>
      </body>
    </html>
  )
}
```

#### **Component Usage**
```typescript
// Any component can now use useWallet
import { useWallet } from "@/lib/wallet/compatibility"

function MyComponent() {
  const { isConnected, currentAddress, client } = useWallet()
  
  if (!isConnected) {
    return <div>Please connect your wallet</div>
  }
  
  return <div>Connected to: {currentAddress}</div>
}
```

## Wallet Connection Flow

### 1. Provider Initialization (ACTUAL)
```typescript
// components/LaserEyesWrapper.tsx
'use client'

import { ReactNode } from 'react'
import dynamic from 'next/dynamic'
import { WalletProvider } from '@/lib/wallet/compatibility'

const DynamicLaserEyesProvider = dynamic(
  () => import('@omnisat/lasereyes').then((mod) => mod.LaserEyesProvider),
  { ssr: false, loading: () => null }
)

export default function LaserEyesWrapper({ children }: { children: ReactNode }) {
  return (
    <DynamicLaserEyesProvider config={{ network: 'mainnet' }}>
      <WalletProvider>{children}</WalletProvider>
    </DynamicLaserEyesProvider>
  )
}
```

### 2. Wallet Context Setup (ACTUAL)
```typescript
// lib/wallet/compatibility.tsx
export function WalletProvider({ children }: { children: React.ReactNode }) {
  const laserEyes = useLaserEyes()
  const { connected, address, client, connect: laserEyesConnect, disconnect: laserEyesDisconnect } = laserEyes
  
  const [isVerified, setIsVerified] = useState(false)
  const [isVerifying, setIsVerifying] = useState(false)
  const [userCancelled, setUserCancelled] = useState(false)
  
  // Wraps LaserEyes with verification logic
  const connect = async (provider: any) => {
    await laserEyesConnect(provider)
  }
  
  const disconnect = () => {
    laserEyesDisconnect()
    setIsVerified(false)
    setUserCancelled(false)
  }
  
  // Verification logic using client.signMessage()
}
```

### 3. Connection Process (ACTUAL)
```typescript
// In WalletConnect.tsx - uses useLaserEyes() directly
const { connect, disconnect, connected, address, balance, client } = useLaserEyes()

const handleConnect = async (wallet: any) => {
  try {
    setIsConnecting(true)
    
    // Check if client is available
    if (!client && typeof window !== 'undefined') {
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    
    if (!connect) {
      throw new Error('Wallet connection not available. Please refresh the page.')
    }
    
    // Connect via LaserEyes
    await connect(wallet)
    // LaserEyes handles: requestAccounts, address, balance automatically
  } catch (error) {
    console.error('Failed to connect wallet:', error)
    // Error handling...
  } finally {
    setIsConnecting(false)
  }
}
```

## Wallet Verification System

### Message Signing Verification
The platform implements a robust wallet verification system using message signing:

```typescript
const verifyWallet = useCallback(async (): Promise<boolean> => {
  if (!connected || !address || !client || isVerifying || userCancelled) {
    return false
  }

  try {
    setIsVerifying(true)
    const message = `Verify wallet ownership for ${address} at ${Date.now()}`
    
    try {
      const signature = await client.signMessage(message)
      
      // Store verification in sessionStorage
      const verificationKey = `wallet_verified_${address}`
      sessionStorage.setItem(verificationKey, 'true')
      setIsVerified(true)
      setUserCancelled(false)
      return true
    } catch (signError) {
      console.log("Wallet verification cancelled or failed:", signError)
      setIsVerified(false)
      setUserCancelled(true)
      
      // Disconnect on cancellation
      if (client && client.disconnect) {
        client.disconnect()
      }
      return false
    }
  } catch (error) {
    console.log("Wallet verification error:", error)
    setIsVerified(false)
    setUserCancelled(true)
    return false
  } finally {
    setIsVerifying(false)
  }
}, [connected, address, client, isVerifying, userCancelled])
```

### Verification States
- **isVerified**: Wallet has been successfully verified
- **isVerifying**: Currently in verification process
- **userCancelled**: User cancelled verification (prevents retries)

## Address Management

### Address Types
The platform manages multiple address types for different purposes:

```typescript
interface WalletContextType {
  currentAddress: string | null      // Main wallet address
  paymentAddress: string | null      // Payment address (P2SH-P2WPKH)
  taprootAddress: string | null      // Taproot address for inscriptions
}
```

### Address Derivation
```typescript
// Get payment address - P2SH-P2WPKH for compatibility
const paymentAddr = await client.getPaymentAddress()

// Set taproot address (main address is usually taproot in LaserEyes)
const taprootAddr = accounts[0] // Typically the taproot address

// Save both addresses to user profile
await updateUserProfile(accounts[0], paymentAddr, taprootAddr)
```

## Transaction Signing

### PSBT Signing Process
The platform uses PSBT (Partially Signed Bitcoin Transaction) for transaction signing:

```typescript
// Sign PSBT without auto-finalize/broadcast
const signedResult = await client.signPsbt(psbtBase64, false, false)

// Handle different wallet response formats
if (signedResult && (signedResult.txId || signedResult.signedPsbtHex || signedResult.signedPsbtBase64)) {
  console.log("✅ Wallet signed successfully")
  
  // If no txId, wallet expects manual broadcast
  if (!signedResult.txId && signedResult.signedPsbtHex) {
    // Convert signed PSBT to transaction and broadcast
    const psbt = bitcoin.Psbt.fromHex(signedResult.signedPsbtHex)
    const tx = psbt.finalizeAllInputs().extractTransaction()
    const txHex = tx.toHex()
    
    // Broadcast via mempool.space
    const broadcastResult = await broadcastTransaction(txHex)
  }
}
```

### Signing Modes
1. **Auto-finalize**: Wallet handles finalization and broadcasting
2. **Manual finalize**: Platform handles finalization and broadcasting
3. **PSBT mode**: Returns signed PSBT for manual processing

## Wallet UI Component

### WalletConnect Component Features (ACTUAL)
```typescript
// components/WalletConnect.tsx
import { useLaserEyes, UNISAT, XVERSE, PHANTOM, MAGIC_EDEN } from '@omnisat/lasereyes'

export default function WalletConnect() {
  const { connect, disconnect, connected, address, balance, client } = useLaserEyes()
  
  // State management
  const [isConnecting, setIsConnecting] = useState(false)
  const [isVerifying, setIsVerifying] = useState(false)
  const [isHolder, setIsHolder] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  
  // Supported wallets
  const WALLET_OPTIONS = [
    { id: 'unisat', name: 'Unisat', icon: '🔗', wallet: UNISAT, type: 'lasereyes' },
    { id: 'xverse', name: 'Xverse', icon: '⚡', wallet: XVERSE, type: 'lasereyes' },
    { id: 'phantom', name: 'Phantom', icon: '👻', wallet: PHANTOM, type: 'lasereyes' },
    { id: 'magiceden', name: 'Magic Eden', icon: '✨', wallet: MAGIC_EDEN, type: 'lasereyes' },
    { id: 'oyo', name: 'OYO', icon: '🦉', wallet: OYO_WALLET, type: 'custom' },
  ]
  
  // Wallet connection handlers
  const handleConnect = async (wallet: any) => {
    try {
      setIsConnecting(true)
      await connect(wallet)
      setShowDropdown(false)
    } catch (err) {
      console.error("Failed to connect wallet:", err)
    } finally {
      setIsConnecting(false)
    }
  }
}
```

### UI Features
- **Wallet Selection**: Dropdown with supported wallet options
- **Balance Display**: Real-time balance updates
- **Verification Status**: Visual indicators for wallet verification
- **Points System**: User points integration
- **Profile Management**: Quick access to user profile
- **Address Copying**: One-click address copying

## Balance Management

### Balance Fetching (ACTUAL)
```typescript
// useLaserEyes() provides balance directly - no manual fetching needed
const { connected, address, balance, client } = useLaserEyes()

// Balance is automatically updated by LaserEyes
// No need for manual fetchBalance() function
// balance is already a number (in satoshis) or null

// If you need to format it:
const formatBalance = () => {
  if (balance === null || balance === undefined) return "0.00000000"
  // Convert satoshis to BTC (1 BTC = 100,000,000 satoshis)
  return (Number(balance) / 100000000).toFixed(8)
}
```

### Balance Formatting
```typescript
const formatBalance = () => {
  if (balance === null || balance === undefined) return "0.00000000"
  // Convert satoshis to BTC (1 BTC = 100,000,000 satoshis)
  return (Number(balance) / 100000000).toFixed(8)
}
```

## Error Handling

### Connection Errors
- **Wallet Not Available**: Graceful fallback when wallet is not installed
- **User Cancellation**: Proper handling of user-initiated cancellations
- **Network Errors**: Retry mechanisms for network-related issues
- **Verification Failures**: Automatic disconnection on verification failure

### Transaction Errors
- **Insufficient Funds**: Clear error messages for insufficient balance
- **Signing Failures**: Fallback mechanisms for signing issues
- **Broadcast Failures**: Retry logic for transaction broadcasting

## Security Considerations

### Private Key Management
- **No Private Key Access**: Platform never accesses user private keys
- **Wallet-Side Signing**: All signing operations handled by wallet
- **Message Verification**: Cryptographic proof of wallet ownership

### Session Management
- **Session Storage**: Verification state stored in sessionStorage
- **Address Validation**: Proper address format validation
- **Network Validation**: Network-specific address validation

## Integration with Inscription System

### Address Compatibility
The wallet system provides addresses compatible with the inscription process:

```typescript
// P2SH-P2WPKH addresses for wallet compatibility
const paymentAddress = await client.getPaymentAddress()

// Taproot addresses for inscription outputs
const taprootAddress = accounts[0] // Main address (usually taproot)
```

### Transaction Flow Integration
1. **Commit Transaction**: Uses payment address for inputs
2. **Reveal Transaction**: Uses taproot address for inscription outputs
3. **Fee Management**: Proper fee calculation across address types

## Development Guidelines

### Adding New Wallets
1. Ensure wallet is supported by LaserEyes Core
2. Add wallet provider to WalletConnect component
3. Test connection and signing functionality
4. Verify address format compatibility

### Testing Wallet Integration
1. Test connection flow for each supported wallet
2. Verify message signing functionality
3. Test PSBT signing with different transaction types
4. Validate address derivation and formatting

### Debugging Wallet Issues
1. Check browser console for LaserEyes errors
2. Verify wallet extension is properly installed
3. Test with different network configurations
4. Validate address format compatibility

## Best Practices

### User Experience
- **Clear Error Messages**: Provide actionable error messages
- **Loading States**: Show appropriate loading indicators
- **Verification Feedback**: Clear verification status indicators
- **Graceful Degradation**: Fallback options for unsupported wallets

### Security
- **Never Store Private Keys**: Always use wallet-side signing
- **Validate Addresses**: Proper address format validation
- **Verify Ownership**: Always verify wallet ownership before transactions
- **Secure Communication**: Use HTTPS for all wallet communications

### Performance
- **Lazy Loading**: Load wallet providers only when needed
- **Caching**: Cache verification state appropriately
- **Error Recovery**: Implement proper error recovery mechanisms
- **Memory Management**: Clean up wallet connections properly

## Troubleshooting Common Issues

### Error: `api.requestAccounts is not a function`

This error occurs when the wallet provider isn't properly initialized or the wallet extension isn't available. Here are the solutions:

#### **Issue 1: Wallet Extension Not Installed**
```typescript
// In WalletConnect.tsx - actual implementation
const handleConnect = async (wallet: any, walletType: string) => {
  try {
    setIsConnecting(true)
    setShowDropdown(false)
    
    if (walletType === 'custom') {
      // Handle custom wallet connections (OYO)
      const address = await wallet.connect()
      console.log('Custom wallet connected:', address)
    } else {
      // Check if client is available before connecting
      if (!client && typeof window !== 'undefined') {
        await new Promise(resolve => setTimeout(resolve, 100))
      }
      
      if (!connect) {
        throw new Error('Wallet connection not available. Please refresh the page.')
      }
      
      // Use LaserEyes for standard wallets
      await connect(wallet)
    }
  } catch (error) {
    console.error('Failed to connect wallet:', error)
    const errorMessage = error instanceof Error ? error.message : 'Failed to connect wallet'
    
    // Provide more helpful error messages
    if (errorMessage.includes('disposed') || errorMessage.includes('Client disposed')) {
      toast.error('Connection was interrupted. Please refresh the page and try again.')
    } else {
      toast.error(errorMessage)
    }
  } finally {
    setIsConnecting(false)
  }
}
```

#### **Issue 2: Provider Not Properly Initialized**
```typescript
// Ensure LaserEyesWrapper is properly set up in app/layout.tsx
// components/LaserEyesWrapper.tsx
export default function LaserEyesWrapper({ children }: { children: ReactNode }) {
  return (
    <DynamicLaserEyesProvider config={{ network: 'mainnet' }}>
      <WalletProvider>{children}</WalletProvider>
    </DynamicLaserEyesProvider>
  )
}

// app/layout.tsx
import LaserEyesWrapper from '@/components/LaserEyesWrapper'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ToastProvider>
          <LaserEyesWrapper>
            {children}
          </LaserEyesWrapper>
        </ToastProvider>
      </body>
    </html>
  )
}
```

#### **Issue 3: Wrong Import Path**
❌ **Wrong** - Using wrong import:
```typescript
// DON'T DO THIS
import { useWallet } from "@/lib/wallet/context" // Legacy/Deprecated - NOT USED
import { useLaserEyes } from "@omnisat/lasereyes-core" // Wrong package
```

✅ **Correct** - Use the right imports:
```typescript
// PRIMARY - Most common usage
import { useLaserEyes } from "@omnisat/lasereyes" // Direct LaserEyes hook

// SECONDARY - When verification needed
import { useWallet } from "@/lib/wallet/compatibility" // Wraps useLaserEyes with verification
```

#### **Issue 4: Missing Provider Wrapper**
❌ **Wrong** - Component not wrapped in provider:
```typescript
// DON'T DO THIS
function App() {
  return (
    <div>
      <WalletConnect /> {/* This will fail - no provider */}
    </div>
  )
}
```

✅ **Correct** - LaserEyesWrapper is in app/layout.tsx (already set up):
```typescript
// app/layout.tsx - Already configured
import LaserEyesWrapper from '@/components/LaserEyesWrapper'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <LaserEyesWrapper>
          {children} {/* All pages automatically have wallet access */}
        </LaserEyesWrapper>
      </body>
    </html>
  )
}
```

### Error: `Cannot read properties of undefined (reading 'push')`

This error occurs when `useLaserEyes()` returns `undefined` or an incomplete object, typically at line 29 in `lib/wallet/compatibility.tsx`.

#### **Root Cause Analysis**
The error happens because:
1. `useLaserEyes()` hook returns `undefined`
2. The LaserEyesProvider isn't properly wrapping the WalletProvider
3. The LaserEyes context isn't initialized

#### **Solution 1: Check Provider Hierarchy**
❌ **Wrong** - Missing LaserEyesProvider:
```typescript
// DON'T DO THIS
function App() {
  return (
    <WalletProvider> {/* This will cause the error - needs LaserEyesProvider */}
      <WalletConnect />
    </WalletProvider>
  )
}
```

✅ **Correct** - Proper provider hierarchy (already in app/layout.tsx):
```typescript
// app/layout.tsx - Already configured correctly
<LaserEyesWrapper> {/* Contains LaserEyesProvider */}
  <WalletProvider> {/* This will work */}
    {children} {/* All components have wallet access */}
  </WalletProvider>
</LaserEyesWrapper>
```

#### **Solution 2: Add Defensive Programming**
```typescript
// lib/wallet/compatibility.tsx
export function WalletProvider({ children }: { children: React.ReactNode }) {
  // Add null check for useLaserEyes
  const laserEyesContext = useLaserEyes()
  
  // Debug logging
  console.log('LaserEyes context:', laserEyesContext)
  
  if (!laserEyesContext) {
    console.error('useLaserEyes returned undefined. Check LaserEyesProvider setup.')
    return (
      <div style={{ padding: '20px', background: '#ffebee', color: '#c62828' }}>
        <h3>Wallet Provider Error</h3>
        <p>LaserEyes context not available. Please check provider setup.</p>
      </div>
    )
  }
  
  const { connected, address, client } = laserEyesContext
  
  // Rest of component logic...
}
```

#### **Solution 3: Verify LaserEyesWrapper Setup**
```typescript
// components/LaserEyesWrapper.tsx - Already configured correctly
import dynamic from 'next/dynamic'

const DynamicLaserEyesProvider = dynamic(
  () => import('@omnisat/lasereyes').then((mod) => mod.LaserEyesProvider),
  { ssr: false, loading: () => null }
)

// This dynamically imports LaserEyesProvider from @omnisat/lasereyes
// NOT from @omnisat/lasereyes-core
```

#### **Solution 4: Check Provider Configuration**
```typescript
// components/LaserEyesWrapper.tsx - ACTUAL IMPLEMENTATION
export default function LaserEyesWrapper({ children }: { children: ReactNode }) {
  return (
    <DynamicLaserEyesProvider config={{ network: 'mainnet' }}>
      <WalletProvider>{children}</WalletProvider>
    </DynamicLaserEyesProvider>
  )
}

// Note: LaserEyesProvider is dynamically imported to avoid SSR issues
// This is the correct pattern for Next.js
```

#### **Solution 5: Add Error Boundaries**
```typescript
// Add error boundary to catch provider errors
class WalletErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('Wallet provider error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '20px', background: '#ffebee', color: '#c62828' }}>
          <h3>Wallet Connection Error</h3>
          <p>Something went wrong with wallet initialization.</p>
          <button onClick={() => window.location.reload()}>
            Reload Page
          </button>
        </div>
      )
    }

    return this.props.children
  }
}

// Use in app
function App() {
  return (
    <WalletErrorBoundary>
      <LaserEyesProvider>
        <WalletProvider>
          <YourApp />
        </WalletProvider>
      </LaserEyesProvider>
    </WalletErrorBoundary>
  )
}
```

#### **Solution 6: Debug Provider State**
```typescript
// Add debugging to WalletProvider
export function WalletProvider({ children }: { children: React.ReactNode }) {
  const laserEyesContext = useLaserEyes()
  
  // Debug logging
  useEffect(() => {
    console.log('WalletProvider mounted')
    console.log('LaserEyes context:', laserEyesContext)
    console.log('Context type:', typeof laserEyesContext)
    console.log('Context keys:', laserEyesContext ? Object.keys(laserEyesContext) : 'undefined')
  }, [laserEyesContext])
  
  // Early return if context is invalid
  if (!laserEyesContext || typeof laserEyesContext !== 'object') {
    console.error('Invalid LaserEyes context:', laserEyesContext)
    return (
      <div style={{ padding: '20px', background: '#fff3e0', color: '#e65100' }}>
        <h3>Wallet Provider Initializing...</h3>
        <p>Please wait while wallet providers are being set up.</p>
      </div>
    )
  }
  
  const { connected, address, client } = laserEyesContext
  
  // Rest of component...
}
```

#### **Solution 7: Check Package Versions**
```json
// package.json - ensure compatible versions
{
  "dependencies": {
    "@omnisat/lasereyes-core": "^latest",
    "@omnisat/lasereyes": "^latest",
    "react": "^18.0.0",
    "react-dom": "^18.0.0"
  }
}
```

#### **Solution 8: Verify Next.js Setup** (ACTUAL)
```typescript
// app/layout.tsx - ACTUAL IMPLEMENTATION
import LaserEyesWrapper from '@/components/LaserEyesWrapper'
import { ToastProvider } from '@/components/Toast'
import { MusicPlayerProvider } from '@/providers/MusicPlayerProvider'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ToastProvider>
          <LaserEyesWrapper>
            <MusicPlayerProvider>
              {children}
            </MusicPlayerProvider>
          </LaserEyesWrapper>
        </ToastProvider>
      </body>
    </html>
  )
}
```

### Debugging Steps for This Error

#### **Step 1: Check Browser Console**
```typescript
// Add this to your WalletProvider
console.log('useLaserEyes result:', useLaserEyes())
console.log('useLaserEyes type:', typeof useLaserEyes())
```

#### **Step 2: Verify Provider Chain**
```typescript
// Add logging to each provider
export function LaserEyesProvider({ children }: { children: React.ReactNode }) {
  console.log('LaserEyesProvider rendering')
  return (
    <LaserEyesProviderOriginal config={{ network: "mainnet" }}>
      <WalletProvider>{children}</WalletProvider>
    </LaserEyesProviderOriginal>
  )
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  console.log('WalletProvider rendering')
  const context = useLaserEyes()
  console.log('useLaserEyes context:', context)
  // ...
}
```

#### **Step 3: Test Minimal Setup**
```typescript
// Create a minimal test component
function TestWallet() {
  const context = useLaserEyes()
  console.log('Test context:', context)
  
  if (!context) {
    return <div>No LaserEyes context</div>
  }
  
  return <div>LaserEyes context available</div>
}

// Use in app
function App() {
  return (
    <LaserEyesProvider>
      <TestWallet />
    </LaserEyesProvider>
  )
}
```

### Common Causes Checklist

- [ ] **Missing LaserEyesProvider**: Component not wrapped in LaserEyesProvider
- [ ] **Wrong Import**: Importing from wrong package (`lasereyes-core` vs `lasereyes`)
- [ ] **Provider Order**: WalletProvider not inside LaserEyesProvider
- [ ] **Package Version**: Incompatible package versions
- [ ] **Next.js Setup**: Provider not in root layout
- [ ] **React Version**: Incompatible React version
- [ ] **Build Issues**: Development vs production build differences
- [ ] **Browser Issues**: Browser compatibility problems

This error is almost always caused by missing or incorrectly configured LaserEyesProvider wrapping the WalletProvider.

### Error: `useWallet must be used within a WalletProvider`

This error occurs when `useWallet()` or `useLaserEyes()` is called outside of the provider hierarchy.

#### **Solution**: Check Provider Hierarchy (ACTUAL)
```typescript
// Already configured in app/layout.tsx
<LaserEyesWrapper> {/* Contains LaserEyesProvider */}
  <WalletProvider>
    <YourComponent /> {/* useLaserEyes() or useWallet() works here */}
  </WalletProvider>
</LaserEyesWrapper>
```

### Error: `Failed to connect wallet: TypeError: Cannot read properties of undefined`

This usually means the wallet extension isn't properly loaded.

#### **Solution**: Add Wallet Detection
```typescript
// Add wallet detection before connection
const detectWallets = () => {
  const wallets = {
    unisat: typeof window !== 'undefined' && window.unisat,
    xverse: typeof window !== 'undefined' && window.xverse,
    okx: typeof window !== 'undefined' && window.okxwallet,
    leather: typeof window !== 'undefined' && window.leather,
  }
  return wallets
}

const handleConnect = async (wallet: any) => {
  const detectedWallets = detectWallets()
  
  // Check specific wallet availability
  if (wallet === UNISAT && !detectedWallets.unisat) {
    throw new Error('UniSat wallet not detected. Please install and refresh the page.')
  }
  if (wallet === XVERSE && !detectedWallets.xverse) {
    throw new Error('Xverse wallet not detected. Please install and refresh the page.')
  }
  
  // Proceed with connection
  await connect(wallet)
}
```

### Error: `Wallet verification cancelled or failed`

This occurs when the user cancels the message signing verification.

#### **Solution**: Handle User Cancellation Gracefully
```typescript
// The compatibility layer already handles this, but you can add custom handling
const { isVerified, isVerifying, userCancelled } = useWallet()

useEffect(() => {
  if (userCancelled) {
    // Show user-friendly message
    console.log('Wallet verification was cancelled by user')
    // Optionally show a toast or notification
  }
}, [userCancelled])
```

### Error: `Network error` or `Connection timeout`

This occurs when the wallet can't connect to the Bitcoin network.

#### **Solution**: Add Network Error Handling
```typescript
const handleConnect = async (wallet: any) => {
  try {
    setIsConnecting(true)
    await connect(wallet)
  } catch (err: any) {
    if (err.message.includes('network') || err.message.includes('timeout')) {
      alert('Network error. Please check your internet connection and try again.')
    } else {
      alert(`Connection failed: ${err.message}`)
    }
  } finally {
    setIsConnecting(false)
  }
}
```

### Debugging Steps

#### **Step 1: Check Browser Console**
```typescript
// Add debug logging
const handleConnect = async (wallet: any) => {
  console.log('Attempting to connect wallet:', wallet)
  console.log('Window object:', typeof window)
  console.log('Wallet extensions:', {
    unisat: !!window.unisat,
    xverse: !!window.xverse,
    okx: !!window.okxwallet,
    leather: !!window.leather,
  })
  
  try {
    await connect(wallet)
    console.log('Wallet connected successfully')
  } catch (err) {
    console.error('Connection failed:', err)
  }
}
```

#### **Step 2: Verify Provider Setup**
```typescript
// Add provider verification
export function WalletProvider({ children }: { children: React.ReactNode }) {
  const { connected, address, client } = useLaserEyes()
  
  // Debug logging
  useEffect(() => {
    console.log('WalletProvider state:', { connected, address, client: !!client })
  }, [connected, address, client])
  
  // Rest of provider logic...
}
```

#### **Step 3: Test Wallet Extensions**
```typescript
// Test wallet availability
const testWalletAvailability = () => {
  const wallets = {
    unisat: {
      available: !!window.unisat,
      version: window.unisat?.version || 'unknown'
    },
    xverse: {
      available: !!window.xverse,
      version: window.xverse?.version || 'unknown'
    },
    okx: {
      available: !!window.okxwallet,
      version: window.okxwallet?.version || 'unknown'
    }
  }
  
  console.log('Wallet availability:', wallets)
  return wallets
}
```

### Common Solutions Checklist

- [ ] **Wallet Extension Installed**: Verify the wallet extension is installed in the browser
- [ ] **Provider Hierarchy**: Ensure LaserEyesProvider wraps WalletProvider wraps components
- [ ] **Correct Imports**: Use `@/lib/wallet/compatibility` not `@/lib/wallet/context`
- [ ] **Network Configuration**: Verify mainnet/testnet configuration matches wallet
- [ ] **Browser Compatibility**: Test in different browsers (Chrome, Firefox, Safari)
- [ ] **Extension Permissions**: Check if wallet extension has proper permissions
- [ ] **Page Refresh**: Try refreshing the page after installing wallet extensions
- [ ] **Console Errors**: Check browser console for additional error details

### Wallet-Specific Issues

#### **UniSat Wallet**
```typescript
// UniSat specific checks
if (wallet === UNISAT) {
  if (!window.unisat) {
    throw new Error('UniSat wallet not installed. Please install from https://unisat.io/')
  }
  
  // Check if UniSat is ready
  if (!window.unisat.isReady) {
    throw new Error('UniSat wallet not ready. Please unlock your wallet.')
  }
}
```

#### **Xverse Wallet**
```typescript
// Xverse specific checks
if (wallet === XVERSE) {
  if (!window.xverse) {
    throw new Error('Xverse wallet not installed. Please install from https://www.xverse.app/')
  }
  
  // Xverse may need additional initialization
  if (typeof window.xverse.requestAccounts !== 'function') {
    throw new Error('Xverse wallet API not available. Please refresh the page.')
  }
}
```

#### **OKX Wallet**
```typescript
// OKX specific checks
if (wallet === OKX) {
  if (!window.okxwallet) {
    throw new Error('OKX wallet not installed. Please install from https://www.okx.com/web3')
  }
  
  // OKX uses different API structure
  if (!window.okxwallet.bitcoin) {
    throw new Error('OKX Bitcoin wallet not available. Please enable Bitcoin in OKX wallet.')
  }
}
```

This troubleshooting section should help resolve the `api.requestAccounts is not a function` error and other common wallet connection issues.
