# Wallet Connect & LaserEyes Integration Documentation

This document outlines the wallet connection system and LaserEyes integration used by the Ordzaar platform for Bitcoin wallet connectivity and transaction signing.

## Overview

The platform uses LaserEyes Core (`@omnisat/lasereyes-core`) as the primary wallet integration framework, providing a unified interface for connecting to various Bitcoin wallets and handling transaction signing.

## Architecture Components

### Core Libraries
- `@omnisat/lasereyes-core`: Main wallet integration framework
- `@omnisat/lasereyes`: React-specific LaserEyes components
- `bitcoinjs-lib`: Bitcoin transaction handling
- `@bitcoinerlab/secp256k1`: Cryptographic operations

### Critical Import Patterns

#### LaserEyes Core Imports (Framework Agnostic)
```typescript
// Core LaserEyes functionality
import { 
  LaserEyesClient, 
  createStores, 
  createConfig, 
  type ProviderType 
} from '@omnisat/lasereyes-core'

// Wallet providers
import { 
  UNISAT, 
  XVERSE, 
  OYL, 
  MAGIC_EDEN, 
  LEATHER 
} from '@omnisat/lasereyes'
```

#### LaserEyes React Imports (React Components)
```typescript
// React-specific LaserEyes components
import { 
  LaserEyesProvider as LaserEyesProviderOriginal,
  useLaserEyes 
} from '@omnisat/lasereyes'
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
    "@omnisat/lasereyes-core": "^latest",
    "@omnisat/lasereyes": "^latest",
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
- `components/WalletConnect.tsx`: Main wallet connection UI component
- `providers/LaserEyesProvider.tsx`: LaserEyes provider wrapper
- `lib/wallet/compatibility.tsx`: Wallet compatibility layer
- `lib/wallet/context.tsx`: Legacy wallet context (deprecated)
- `laser-eyes-docs.md`: LaserEyes Core documentation

## Supported Wallets

LaserEyes Core supports the following Bitcoin wallets:

### Primary Supported Wallets
- **UniSat** - Popular Bitcoin wallet with Ordinals support
- **Xverse** - Multi-chain wallet with Bitcoin focus
- **Oyl** - Bitcoin wallet with advanced features
- **Magic Eden** - NFT marketplace wallet
- **Leather** - Bitcoin-native wallet

### Additional Supported Wallets
- **OKX** - Multi-chain exchange wallet
- **OP_NET** - Specialized Bitcoin wallet
- **Orange** - Bitcoin wallet solution
- **Phantom** - Multi-chain wallet
- **Sparrow** - Desktop Bitcoin wallet
- **Wizz** - Bitcoin wallet

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
App Root
├── LaserEyesProvider (from @omnisat/lasereyes)
│   └── WalletProvider (lib/wallet/compatibility.tsx)
│       └── All Components
│           ├── WalletConnect.tsx
│           ├── WalletDisplay.tsx
│           ├── InscribeInterface.tsx
│           ├── SpecialMintPanel.tsx
│           └── Other Components
```

### useWallet Hook Locations

#### 1. **Primary Hook Definition**
**File**: `lib/wallet/compatibility.tsx`
```typescript
export function useWallet() {
  const context = useContext(WalletContext)
  if (context === undefined) {
    throw new Error("useWallet must be used within a WalletProvider")
  }
  return context
}
```

#### 2. **Legacy Hook Definition** (Deprecated)
**File**: `lib/wallet/context.tsx`
```typescript
export const useWallet = () => {
  const context = useContext(WalletContext)
  if (!context) {
    throw new Error("useWallet must be used within a WalletProvider")
  }
  return context
}
```

### Provider Setup Chain

#### 1. **LaserEyesProvider** (`providers/LaserEyesProvider.tsx`)
```typescript
export function LaserEyesProvider({ children }: { children: React.ReactNode }) {
  return (
    <LaserEyesProviderOriginal config={{ network: "mainnet" }}>
      <WalletProvider>{children}</WalletProvider>
    </LaserEyesProviderOriginal>
  )
}
```

#### 2. **WalletProvider** (`lib/wallet/compatibility.tsx`)
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

#### 1. **WalletConnect Component**
```typescript
// components/WalletConnect.tsx
import { useWallet } from "@/lib/wallet/compatibility"

export default function WalletConnect() {
  const { isConnected, currentAddress, client, isVerified, isVerifying, connect } = useWallet()
  
  // Component logic...
}
```

#### 2. **InscribeInterface Component**
```typescript
// components/tools/inscribe-interface.tsx
import { useWallet } from "@/lib/wallet/compatibility"

export default function InscribeInterface() {
  const { isConnected, currentAddress, client } = useWallet()
  
  // Inscription logic...
}
```

#### 3. **Mint Process Hook**
```typescript
// hooks/useMintProcess.ts
import { useWallet } from "@/lib/wallet/compatibility"

export function useMintProcess() {
  const { isConnected, currentAddress, client } = useWallet()
  
  // Mint process logic...
}
```

### Hook Interface

#### **Current useWallet Interface** (compatibility.tsx)
```typescript
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

#### **Legacy useWallet Interface** (context.tsx - deprecated)
```typescript
interface WalletContextType {
  profile: Profile | null
  client: LaserEyesClient | null
  isConnected: boolean
  currentAddress: string | null
  paymentAddress: string | null
  taprootAddress: string | null
  balance: number | null
  loading: boolean
  error: string | null
  walletProvider: ProviderType | null
  updateProfileAddresses: (profileId: string, addresses: { address: string; network: string }[]) => Promise<void>
  connect: (provider: ProviderType) => Promise<void>
  disconnect: () => void
  handleMint: (ordinalId: string) => Promise<string | null>
  handlePurchase: (ordinalId: string, price: number) => Promise<string | null>
}
```

### Migration Notes

#### **Current Implementation** (Recommended)
- **File**: `lib/wallet/compatibility.tsx`
- **Uses**: `useLaserEyes()` hook from `@omnisat/lasereyes`
- **Features**: Simplified interface, automatic verification, session management
- **Import**: `import { useWallet } from "@/lib/wallet/compatibility"`

#### **Legacy Implementation** (Deprecated)
- **File**: `lib/wallet/context.tsx`
- **Uses**: Direct `LaserEyesClient` instantiation
- **Features**: Full client management, profile integration, complex state
- **Import**: `import { useWallet } from "@/lib/wallet/context"`

### Provider Placement in App Structure

#### **Root Layout** (`app/layout.tsx`)
```typescript
import { LaserEyesProvider } from "@/providers/LaserEyesProvider"

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <LaserEyesProvider>
          {children}
        </LaserEyesProvider>
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

### 1. Provider Initialization
```typescript
// LaserEyesProvider.tsx
export function LaserEyesProvider({ children }: { children: React.ReactNode }) {
  return (
    <LaserEyesProviderOriginal config={{ network: "mainnet" }}>
      <WalletProvider>{children}</WalletProvider>
    </LaserEyesProviderOriginal>
  )
}
```

### 2. Wallet Context Setup
```typescript
// lib/wallet/compatibility.tsx
export function WalletProvider({ children }: { children: React.ReactNode }) {
  const { connected, address, client } = useLaserEyes()
  
  const [isVerified, setIsVerified] = useState(false)
  const [isVerifying, setIsVerifying] = useState(false)
  const [userCancelled, setUserCancelled] = useState(false)
  
  // Wallet verification and connection logic
}
```

### 3. Connection Process
```typescript
const connect = async (provider: ProviderType) => {
  if (!client) return
  
  try {
    setIsLoading(true)
    setError(null)
    
    await client.connect(provider)
    const accounts = await client.requestAccounts()
    
    if (accounts && accounts.length > 0) {
      setIsConnected(true)
      setCurrentAddress(accounts[0])
      setWalletProvider(provider)
      
      // Get additional addresses
      const paymentAddr = await client.getPaymentAddress()
      setPaymentAddress(paymentAddr)
      
      // Get balance
      const balanceResult = await client.getBalance()
      // Handle different balance return types
    }
  } catch (err) {
    console.error("Error connecting wallet:", err)
    setError(err.message || "Failed to connect wallet")
  } finally {
    setIsLoading(false)
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

### WalletConnect Component Features
```typescript
// components/WalletConnect.tsx
export default function WalletConnect() {
  const { isConnected, currentAddress, client, isVerified, isVerifying, connect } = useWallet()
  
  // State management
  const [isOpen, setIsOpen] = useState(false)
  const [balance, setBalance] = useState<number | null>(null)
  const [points, setPoints] = useState<number>(0)
  
  // Wallet connection handlers
  const handleConnect = async (wallet: any) => {
    try {
      setIsConnecting(true)
      await connect(wallet)
      setIsOpen(false)
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

### Balance Fetching
```typescript
const fetchBalance = useCallback(async () => {
  if (!isConnected || !currentAddress || !client) {
    setBalance(null)
    return
  }

  try {
    setIsLoadingBalance(true)
    const balanceResult = await client.getBalance()
    
    // Handle different balance result types
    if (balanceResult) {
      if (typeof balanceResult.toNumber === "function") {
        setBalance(balanceResult.toNumber())
      } else if (typeof balanceResult === "number") {
        setBalance(balanceResult)
      } else if (typeof balanceResult === "string") {
        setBalance(Number.parseFloat(balanceResult))
      } else {
        setBalance(Number(balanceResult.toString()))
      }
    } else {
      setBalance(0)
    }
  } catch (err) {
    console.error("Error fetching balance:", err)
    setBalance(null)
  } finally {
    setIsLoadingBalance(false)
  }
}, [isConnected, currentAddress, client])
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
// Check if wallet is available before connecting
const handleConnect = async (wallet: any) => {
  try {
    // Check if wallet extension is available
    if (!window.unisat && wallet === UNISAT) {
      throw new Error('UniSat wallet not installed. Please install the UniSat extension.')
    }
    if (!window.xverse && wallet === XVERSE) {
      throw new Error('Xverse wallet not installed. Please install the Xverse extension.')
    }
    if (!window.okxwallet && wallet === OKX) {
      throw new Error('OKX wallet not installed. Please install the OKX extension.')
    }
    
    setIsConnecting(true)
    await connect(wallet)
    setIsOpen(false)
  } catch (err) {
    console.error("Failed to connect wallet:", err)
    // Show user-friendly error message
    alert(err.message || "Failed to connect wallet")
  } finally {
    setIsConnecting(false)
  }
}
```

#### **Issue 2: Provider Not Properly Initialized**
```typescript
// Ensure LaserEyes provider is properly set up
export function LaserEyesProvider({ children }: { children: React.ReactNode }) {
  return (
    <LaserEyesProviderOriginal 
      config={{ 
        network: "mainnet",
        // Add any additional config if needed
      }}
    >
      <WalletProvider>{children}</WalletProvider>
    </LaserEyesProviderOriginal>
  )
}
```

#### **Issue 3: Wrong Import Path**
❌ **Wrong** - Using wrong import:
```typescript
// DON'T DO THIS
import { useWallet } from "@/lib/wallet/context" // Legacy/Deprecated
```

✅ **Correct** - Use the right import:
```typescript
// DO THIS
import { useWallet } from "@/lib/wallet/compatibility" // Current
```

#### **Issue 4: Missing Provider Wrapper**
❌ **Wrong** - Component not wrapped in provider:
```typescript
// DON'T DO THIS
function App() {
  return (
    <div>
      <WalletConnect /> {/* This will fail */}
    </div>
  )
}
```

✅ **Correct** - Wrap in LaserEyesProvider:
```typescript
// DO THIS
function App() {
  return (
    <LaserEyesProvider>
      <div>
        <WalletConnect /> {/* This will work */}
      </div>
    </LaserEyesProvider>
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
    <WalletProvider> {/* This will cause the error */}
      <WalletConnect />
    </WalletProvider>
  )
}
```

✅ **Correct** - Proper provider hierarchy:
```typescript
// DO THIS
function App() {
  return (
    <LaserEyesProvider>
      <WalletProvider> {/* This will work */}
        <WalletConnect />
      </WalletProvider>
    </LaserEyesProvider>
  )
}
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

#### **Solution 3: Verify LaserEyesProvider Import**
```typescript
// Ensure correct import
import { LaserEyesProvider as LaserEyesProviderOriginal } from "@omnisat/lasereyes"

// NOT this (wrong package):
// import { LaserEyesProvider } from "@omnisat/lasereyes-core"
```

#### **Solution 4: Check Provider Configuration**
```typescript
// providers/LaserEyesProvider.tsx
export function LaserEyesProvider({ children }: { children: React.ReactNode }) {
  return (
    <LaserEyesProviderOriginal 
      config={{ 
        network: "mainnet",
        // Add any required configuration
      }}
    >
      <WalletProvider>{children}</WalletProvider>
    </LaserEyesProviderOriginal>
  )
}
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

#### **Solution 8: Verify Next.js Setup**
```typescript
// app/layout.tsx or pages/_app.tsx
import { LaserEyesProvider } from "@/providers/LaserEyesProvider"

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <LaserEyesProvider>
          {children}
        </LaserEyesProvider>
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

This error occurs when `useWallet` is called outside of the provider hierarchy.

#### **Solution**: Check Provider Hierarchy
```typescript
// Ensure this hierarchy in your app
<LaserEyesProvider>
  <WalletProvider>
    <YourComponent /> {/* useWallet works here */}
  </WalletProvider>
</LaserEyesProvider>
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
