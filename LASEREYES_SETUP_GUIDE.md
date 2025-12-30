# LaserEyes Setup Guide

A comprehensive guide for installing and setting up LaserEyes wallet integration in any React/Next.js project.

## Overview

LaserEyes (`@omnisat/lasereyes`) is a unified wallet integration framework for Bitcoin wallets, providing a React-specific interface for connecting to various Bitcoin wallets and handling transaction signing.

## Installation

### Required Packages

```bash
npm install @omnisat/lasereyes @omnisat/lasereyes-core
```

### Optional Packages (for transaction handling)

```bash
npm install bitcoinjs-lib ecpair @bitcoinerlab/secp256k1
```

### Package.json Dependencies

```json
{
  "dependencies": {
    "@omnisat/lasereyes": "^0.0.161",
    "@omnisat/lasereyes-core": "^0.0.83",
    "bitcoinjs-lib": "^6.1.5",
    "ecpair": "^2.0.1",
    "@bitcoinerlab/secp256k1": "^1.1.3"
  }
}
```

## Core Concepts

### Package Structure

- **`@omnisat/lasereyes`**: React-specific components and hooks (PRIMARY - use this for React apps)
- **`@omnisat/lasereyes-core`**: Core wallet integration framework (used internally, rarely needed directly)
- **`@omnisat/lasereyes-react`**: Additional React utilities (optional)

### Key Imports

#### Primary React Imports (Most Common)
```typescript
import { 
  LaserEyesProvider,
  useLaserEyes,
  UNISAT,
  XVERSE,
  PHANTOM,
  MAGIC_EDEN,
  LEATHER,
  OYL
} from '@omnisat/lasereyes'
```

#### Core Imports (Advanced Use Only)
```typescript
import { 
  LaserEyesClient, 
  createStores, 
  createConfig, 
  type ProviderType 
} from '@omnisat/lasereyes-core'
```

#### Bitcoin.js Integration (For Transaction Handling)
```typescript
import * as bitcoin from 'bitcoinjs-lib'
import { ECPairFactory } from 'ecpair'
import * as ecc from '@bitcoinerlab/secp256k1'

// Initialize ECC library
bitcoin.initEccLib(ecc)
const ECPair = ECPairFactory(ecc)
```

## Basic Setup

### Step 1: Create Provider Component

Create a provider wrapper component:

```typescript
// components/LaserEyesProvider.tsx
'use client'

import { ReactNode } from 'react'
import { LaserEyesProvider as LaserEyesProviderOriginal } from '@omnisat/lasereyes'

export function LaserEyesProvider({ children }: { children: ReactNode }) {
  return (
    <LaserEyesProviderOriginal config={{ network: 'mainnet' }}>
      {children}
    </LaserEyesProviderOriginal>
  )
}
```

### Step 2: Add to Root Layout

```typescript
// app/layout.tsx (Next.js App Router)
import { LaserEyesProvider } from '@/components/LaserEyesProvider'

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

Or for Pages Router:

```typescript
// pages/_app.tsx (Next.js Pages Router)
import { LaserEyesProvider } from '@/components/LaserEyesProvider'

export default function App({ Component, pageProps }) {
  return (
    <LaserEyesProvider>
      <Component {...pageProps} />
    </LaserEyesProvider>
  )
}
```

### Step 3: Use in Components

```typescript
// components/WalletConnect.tsx
'use client'

import { useLaserEyes, UNISAT, XVERSE, PHANTOM, MAGIC_EDEN } from '@omnisat/lasereyes'

export default function WalletConnect() {
  const { connect, disconnect, connected, address, balance, client } = useLaserEyes()
  
  const handleConnect = async (wallet: any) => {
    try {
      await connect(wallet)
      console.log('Connected to:', address)
    } catch (error) {
      console.error('Connection failed:', error)
    }
  }
  
  return (
    <div>
      {!connected ? (
        <div>
          <button onClick={() => handleConnect(UNISAT)}>Connect UniSat</button>
          <button onClick={() => handleConnect(XVERSE)}>Connect Xverse</button>
          <button onClick={() => handleConnect(PHANTOM)}>Connect Phantom</button>
          <button onClick={() => handleConnect(MAGIC_EDEN)}>Connect Magic Eden</button>
        </div>
      ) : (
        <div>
          <p>Connected: {address}</p>
          <p>Balance: {balance ? (balance / 100000000).toFixed(8) : '0'} BTC</p>
          <button onClick={disconnect}>Disconnect</button>
        </div>
      )}
    </div>
  )
}
```

## Supported Wallets

### Available Wallet Providers

- **UNISAT** - Popular Bitcoin wallet with Ordinals support
- **XVERSE** - Multi-chain wallet with Bitcoin focus
- **PHANTOM** - Multi-chain wallet
- **MAGIC_EDEN** - NFT marketplace wallet
- **LEATHER** - Bitcoin wallet (formerly Hiro)
- **OYL** - Custom wallet integration

### Usage Example

```typescript
import { UNISAT, XVERSE, PHANTOM, MAGIC_EDEN } from '@omnisat/lasereyes'

const WALLET_OPTIONS = [
  { name: 'UniSat', provider: UNISAT },
  { name: 'Xverse', provider: XVERSE },
  { name: 'Phantom', provider: PHANTOM },
  { name: 'Magic Eden', provider: MAGIC_EDEN },
]

// Connect to wallet
await connect(UNISAT)
```

## Network Configuration

### Supported Networks

```typescript
type NetworkType = 'mainnet' | 'testnet3' | 'testnet4' | 'signet' | 'fractal' | 'fractal testnet'
```

### Configuration

```typescript
<LaserEyesProvider config={{ network: 'mainnet' }}>
  {children}
</LaserEyesProvider>
```

## useLaserEyes Hook

### Interface

```typescript
interface LaserEyesContext {
  connected: boolean
  address: string | null
  balance: number | null  // Balance in satoshis
  client: LaserEyesClient | null
  connect: (provider: any) => Promise<void>
  disconnect: () => void
}
```

### Usage

```typescript
const { 
  connected,      // boolean - wallet connection status
  address,        // string | null - wallet address
  balance,        // number | null - balance in satoshis
  client,         // LaserEyesClient | null - client for signing
  connect,        // function - connect to wallet
  disconnect      // function - disconnect wallet
} = useLaserEyes()
```

### Example

```typescript
function MyComponent() {
  const { connected, address, balance, connect, disconnect } = useLaserEyes()
  
  if (!connected) {
    return <button onClick={() => connect(UNISAT)}>Connect Wallet</button>
  }
  
  return (
    <div>
      <p>Address: {address}</p>
      <p>Balance: {balance ? (balance / 100000000).toFixed(8) : '0'} BTC</p>
      <button onClick={disconnect}>Disconnect</button>
    </div>
  )
}
```

## Transaction Signing

### PSBT Signing

```typescript
import { useLaserEyes } from '@omnisat/lasereyes'

function SignTransaction() {
  const { client, connected } = useLaserEyes()
  
  const signPSBT = async (psbtBase64: string) => {
    if (!client || !connected) {
      throw new Error('Wallet not connected')
    }
    
    // Sign PSBT (autoFinalize: false, autoBroadcast: false)
    const signedResult = await client.signPsbt(psbtBase64, false, false)
    
    if (signedResult.txId) {
      // Wallet auto-broadcasted
      console.log('Transaction ID:', signedResult.txId)
    } else if (signedResult.signedPsbtHex) {
      // Manual broadcast needed
      const psbt = bitcoin.Psbt.fromHex(signedResult.signedPsbtHex)
      const tx = psbt.finalizeAllInputs().extractTransaction()
      const txHex = tx.toHex()
      
      // Broadcast via mempool.space or other service
      await broadcastTransaction(txHex)
    }
  }
  
  return <button onClick={() => signPSBT(psbtBase64)}>Sign Transaction</button>
}
```

### Message Signing

```typescript
const signMessage = async (message: string) => {
  if (!client || !connected) {
    throw new Error('Wallet not connected')
  }
  
  try {
    const signature = await client.signMessage(message)
    console.log('Signature:', signature)
    return signature
  } catch (error) {
    console.error('Signing failed:', error)
    throw error
  }
}
```

## Common Patterns

### Wallet Connection with Error Handling

```typescript
const [isConnecting, setIsConnecting] = useState(false)
const [error, setError] = useState<string | null>(null)

const handleConnect = async (wallet: any) => {
  setIsConnecting(true)
  setError(null)
  
  try {
    // Check if wallet extension is available
    if (typeof window === 'undefined') {
      throw new Error('Wallet connection only available in browser')
    }
    
    await connect(wallet)
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Connection failed'
    setError(errorMessage)
    console.error('Wallet connection error:', err)
  } finally {
    setIsConnecting(false)
  }
}
```

### Balance Formatting

```typescript
const formatBalance = (balance: number | null): string => {
  if (balance === null || balance === undefined) return '0.00000000'
  // Convert satoshis to BTC (1 BTC = 100,000,000 satoshis)
  return (balance / 100000000).toFixed(8)
}

// Usage
const { balance } = useLaserEyes()
const formattedBalance = formatBalance(balance)
```

### Address Validation

```typescript
const isValidBitcoinAddress = (address: string): boolean => {
  // Basic validation - check for common Bitcoin address formats
  const patterns = [
    /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/,  // Legacy (P2PKH)
    /^bc1[a-z0-9]{39,59}$/,                // Bech32 (P2WPKH, P2WSH)
    /^bc1p[a-z0-9]{58}$/,                  // Bech32m (P2TR)
  ]
  
  return patterns.some(pattern => pattern.test(address))
}
```

## Dynamic Import (Next.js SSR)

For Next.js projects, use dynamic imports to avoid SSR issues:

```typescript
// components/LaserEyesProvider.tsx
'use client'

import { ReactNode } from 'react'
import dynamic from 'next/dynamic'

const DynamicLaserEyesProvider = dynamic(
  () => import('@omnisat/lasereyes').then((mod) => mod.LaserEyesProvider),
  { ssr: false, loading: () => null }
)

export function LaserEyesProvider({ children }: { children: ReactNode }) {
  return (
    <DynamicLaserEyesProvider config={{ network: 'mainnet' }}>
      {children}
    </DynamicLaserEyesProvider>
  )
}
```

## TypeScript Configuration

### tsconfig.json

```json
{
  "compilerOptions": {
    "moduleResolution": "node",
    "allowSyntheticDefaultImports": true,
    "esModuleInterop": true,
    "types": ["node"]
  }
}
```

### Type Definitions

```typescript
// types/lasereyes.d.ts
import type { LaserEyesClient } from '@omnisat/lasereyes-core'

declare module '@omnisat/lasereyes' {
  export interface LaserEyesContext {
    connected: boolean
    address: string | null
    balance: number | null
    client: LaserEyesClient | null
    connect: (provider: any) => Promise<void>
    disconnect: () => void
  }
}
```

## Troubleshooting

### Error: `useLaserEyes must be used within LaserEyesProvider`

**Solution**: Ensure your component is wrapped in `LaserEyesProvider`

```typescript
// ❌ Wrong
function App() {
  const { connected } = useLaserEyes() // Error!
  return <div>...</div>
}

// ✅ Correct
function App() {
  return (
    <LaserEyesProvider>
      <MyComponent /> {/* useLaserEyes() works here */}
    </LaserEyesProvider>
  )
}
```

### Error: `api.requestAccounts is not a function`

**Cause**: Wallet extension not installed or not available

**Solution**: Check wallet availability before connecting

```typescript
const handleConnect = async (wallet: any) => {
  // Check if wallet is available
  if (wallet === UNISAT && typeof window !== 'undefined' && !window.unisat) {
    throw new Error('UniSat wallet not installed')
  }
  
  if (wallet === XVERSE && typeof window !== 'undefined' && !window.xverse) {
    throw new Error('Xverse wallet not installed')
  }
  
  await connect(wallet)
}
```

### Error: `Cannot read properties of undefined`

**Cause**: `useLaserEyes()` returns undefined - provider not properly set up

**Solution**: Verify provider hierarchy

```typescript
// Check provider setup
<LaserEyesProvider config={{ network: 'mainnet' }}>
  <YourComponent />
</LaserEyesProvider>
```

### Wallet Not Connecting

**Checklist**:
1. ✅ Wallet extension installed in browser
2. ✅ Wallet extension unlocked
3. ✅ Provider properly configured in root layout
4. ✅ Network configuration matches wallet network
5. ✅ Browser console for additional errors

### Balance Not Updating

**Solution**: Balance updates automatically, but you can force refresh:

```typescript
const { client, address } = useLaserEyes()

const refreshBalance = async () => {
  if (client && address) {
    // Balance is automatically managed by LaserEyes
    // If needed, reconnect to refresh
    await disconnect()
    await connect(UNISAT) // or your wallet provider
  }
}
```

## Advanced Usage

### Custom Wallet Provider

```typescript
import { LaserEyesClient, createConfig } from '@omnisat/lasereyes-core'

// Create custom configuration
const config = createConfig({
  network: 'mainnet',
  // Additional config options
})

// Use custom client
const client = new LaserEyesClient(config)
```

### Multiple Network Support

```typescript
const [network, setNetwork] = useState<'mainnet' | 'testnet3'>('mainnet')

<LaserEyesProvider config={{ network }}>
  <NetworkSelector 
    network={network} 
    onChange={setNetwork} 
  />
  <YourApp />
</LaserEyesProvider>
```

### Wallet Detection

```typescript
const detectWallets = () => {
  if (typeof window === 'undefined') return {}
  
  return {
    unisat: !!window.unisat,
    xverse: !!window.xverse,
    phantom: !!window.phantom,
    okx: !!window.okxwallet,
    leather: !!window.leather,
  }
}

// Usage
const availableWallets = detectWallets()
const canConnectUniSat = availableWallets.unisat
```

## Best Practices

### 1. Always Check Connection State

```typescript
const { connected, address, client } = useLaserEyes()

if (!connected || !address || !client) {
  return <div>Please connect your wallet</div>
}

// Safe to use client here
await client.signMessage(message)
```

### 2. Handle Errors Gracefully

```typescript
try {
  await connect(UNISAT)
} catch (error) {
  if (error.message.includes('User rejected')) {
    // User cancelled - don't show error
    return
  }
  // Show error to user
  console.error('Connection failed:', error)
}
```

### 3. Use Loading States

```typescript
const [isConnecting, setIsConnecting] = useState(false)

const handleConnect = async () => {
  setIsConnecting(true)
  try {
    await connect(UNISAT)
  } finally {
    setIsConnecting(false)
  }
}

return (
  <button disabled={isConnecting} onClick={handleConnect}>
    {isConnecting ? 'Connecting...' : 'Connect Wallet'}
  </button>
)
```

### 4. Clean Up on Unmount

```typescript
useEffect(() => {
  return () => {
    // Cleanup if needed
    disconnect()
  }
}, [])
```

## Security Considerations

### Never Store Private Keys

- LaserEyes never exposes private keys
- All signing happens in the wallet extension
- Your app only receives signatures, never keys

### Verify Wallet Ownership

```typescript
const verifyOwnership = async (message: string) => {
  const signature = await client.signMessage(message)
  // Verify signature matches address
  // This proves the user controls the wallet
}
```

### Validate Addresses

```typescript
const isValidAddress = (address: string): boolean => {
  // Validate address format before using
  return /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$|^bc1[a-z0-9]{39,59}$|^bc1p[a-z0-9]{58}$/.test(address)
}
```

## Common Import Mistakes

### ❌ Wrong - Mixing Packages

```typescript
// DON'T DO THIS
import { useLaserEyes } from '@omnisat/lasereyes-core' // Wrong package
import { LaserEyesProvider } from '@omnisat/lasereyes' // Correct package
```

### ✅ Correct - Use React Package

```typescript
// DO THIS
import { 
  useLaserEyes, 
  LaserEyesProvider 
} from '@omnisat/lasereyes' // React package
```

### ❌ Wrong - Importing Types from Wrong Package

```typescript
// DON'T DO THIS
import { ProviderType } from '@omnisat/lasereyes' // Types not in React package
```

### ✅ Correct - Import Types from Core

```typescript
// DO THIS
import { type ProviderType } from '@omnisat/lasereyes-core' // Types in core package
```

## Quick Start Checklist

- [ ] Install packages: `npm install @omnisat/lasereyes @omnisat/lasereyes-core`
- [ ] Create `LaserEyesProvider` component
- [ ] Add provider to root layout/app
- [ ] Use `useLaserEyes()` hook in components
- [ ] Test wallet connection
- [ ] Handle connection errors
- [ ] Test transaction signing (if needed)

## Additional Resources

- **LaserEyes Documentation**: Check official LaserEyes documentation
- **Bitcoin.js Documentation**: For transaction handling
- **Wallet Extensions**: Install from official wallet websites
  - UniSat: https://unisat.io/
  - Xverse: https://www.xverse.app/
  - Phantom: https://phantom.app/
  - Magic Eden: https://magiceden.io/

## Summary

1. **Install**: `npm install @omnisat/lasereyes @omnisat/lasereyes-core`
2. **Provider**: Wrap app with `LaserEyesProvider`
3. **Hook**: Use `useLaserEyes()` in components
4. **Connect**: Call `connect(UNISAT)` or other wallet provider
5. **Use**: Access `address`, `balance`, `client` from hook
6. **Sign**: Use `client.signPsbt()` or `client.signMessage()` for transactions

This guide provides a foundation for integrating LaserEyes into any React/Next.js project.

