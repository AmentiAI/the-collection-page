declare module '@omnisat/lasereyes' {
  export const UNISAT: any
  export const XVERSE: any
  export const PHANTOM: any
  export const MAGIC_EDEN: any
  export const LEATHER: any
  export const OYL: any
  
  export function useLaserEyes(): {
    connected: boolean
    address: string | null
    client: any
    connect: (provider: any) => Promise<void>
    disconnect: () => void
    balance: any
  }
  
  export function LaserEyesProvider(props: { 
    children: React.ReactNode
    config: { network: string }
  }): JSX.Element
}

