import { Address, Script, Tap } from '@cmdcode/tapscript'
import * as bitcoin from 'bitcoinjs-lib'
import { getBitcoinNetwork } from './bitcoin'
import * as ecc from '@bitcoinerlab/secp256k1'

// Initialize ECC library for bitcoinjs-lib (required for taproot addresses)
bitcoin.initEccLib(ecc)

export interface InscriptionData {
  content: string
  contentType: string
  delegateAddress?: string
  parentInscriptionId?: string
}

export function createContentChunks(contentBase64: string, mimeType: string) {
  let contentBuffer: Buffer
  
  if (mimeType === 'text/plain') {
    const decodedText = Buffer.from(contentBase64, 'base64').toString('utf-8')
    contentBuffer = Buffer.from(decodedText, 'utf-8')
  } else {
    contentBuffer = Buffer.from(contentBase64, 'base64')
  }

  const contentChunks = []
  for (let i = 0; i < contentBuffer.length; i += 520) {
    contentChunks.push(contentBuffer.slice(i, i + 520))
  }
  return contentChunks
}

export function createInscriptionScript(pubKey: string, inscriptions: Array<{content: string, mimeType: string, delegateAddress?: string}>): any[] {
  const ec = new TextEncoder()
  const marker = ec.encode('ord')
  const INSCRIPTION_SIZE = 330

  const script: any[] = [pubKey, 'OP_CHECKSIG']
  
  inscriptions.forEach((inscription, index) => {
    const { content, mimeType, delegateAddress } = inscription
    
    script.push('OP_0', 'OP_IF', marker)
    
    if (delegateAddress) {
      // Delegate inscription: use field 11 (0x0b) and put the inscription ID in content
      script.push('0b') // Field 11 for delegate
      
      // For delegates, the content should be the inscription ID converted to binary
      let delegateContent: Buffer
      
      if (delegateAddress.includes('i0')) {
        // This is an inscription ID - we need to convert it to binary format
        // Format: txid + 'i' + output_index
        // Example: "481f3c241b663de99967332a5ec24e24cdb7f5ca4642d5cbfa5246ed6737627ci0"
        const parts = delegateAddress.split('i')
        if (parts.length === 2) {
          const txid = parts[0]
          const outputIndex = parseInt(parts[1])
          
          // Convert txid from hex string to bytes (reverse byte order for Bitcoin)
          const txidBytes = Buffer.from(txid, 'hex').reverse()
          
          // Convert output index to 4-byte little-endian
          const outputIndexBytes = Buffer.alloc(4)
          outputIndexBytes.writeUInt32LE(outputIndex, 0)
          
          // Combine: txid (32 bytes) + output index (4 bytes) = 36 bytes total
          delegateContent = Buffer.concat([txidBytes, outputIndexBytes])
          
          console.log(`📝 Converted inscription ID to binary:`)
          console.log(`   Original: ${delegateAddress}`)
          console.log(`   TXID: ${txid} -> ${txidBytes.toString('hex')}`)
          console.log(`   Output: ${outputIndex} -> ${outputIndexBytes.toString('hex')}`)
          console.log(`   Combined: ${delegateContent.toString('hex')} (${delegateContent.length} bytes)`)
        } else {
          console.error(`❌ Invalid inscription ID format: ${delegateAddress}`)
          delegateContent = Buffer.from(delegateAddress, 'utf8')
        }
      } else {
        // This looks like an address, we should convert it to inscription ID
        console.warn(`⚠️ Delegate address provided instead of inscription ID: ${delegateAddress}`)
        console.warn(`⚠️ This may not work correctly. Please provide an inscription ID ending with 'i0'`)
        delegateContent = Buffer.from(delegateAddress, 'utf8')
      }
      
      script.push(delegateContent)
    } else {
      // Regular inscription: use field 1 for content type, field 0 for content
      script.push('01', ec.encode(mimeType), 'OP_0')
      
      if (index > 0) {
        const pointer = INSCRIPTION_SIZE * (index + 1)
        const pointerBuffer = Buffer.from([pointer])
        script.push(Buffer.from([0x02]))
        script.push(pointerBuffer)
      }
      
      const contentChunks = createContentChunks(content, mimeType)
      script.push(...contentChunks.map((chunk) => chunk))
    }
    
    script.push('OP_ENDIF')
  })

  return script
}

export function createInscriptionRevealAddressAndKeys(pubKey: string, inscriptions: Array<{content: string, mimeType: string, delegateAddress?: string}>) {
  const script = createInscriptionScript(pubKey, inscriptions)
  const tapleaf = Tap.encodeScript(script)
  const [tpubkey] = Tap.getPubKey(pubKey, { target: tapleaf })
  const inscriberAddress = bitcoin.address.fromOutputScript(
    bitcoin.script.compile([bitcoin.opcodes.OP_1, Buffer.from(tpubkey, 'hex')]),
    getBitcoinNetwork()
  )

  return {
    inscriberAddress,
    tpubkey,
    tapleaf,
  }
}

export function createInscriptionAddresses(pubKey: string, inscriptionData: Array<{content: string, mimeType: string, delegateAddress?: string}>) {
  return inscriptionData.map((ins, index) => {
    const { inscriberAddress, tpubkey, tapleaf } = createInscriptionRevealAddressAndKeys(pubKey, [ins])
    const script = createInscriptionScript(pubKey, [ins])
    const [tapkey, cblock] = Tap.getPubKey(pubKey, { target: tapleaf })
    
    return {
      address: inscriberAddress,
      tpubkey,
      tapleaf,
      script,
      tapkey,
      cblock,
      inscription: ins
    }
  })
}
