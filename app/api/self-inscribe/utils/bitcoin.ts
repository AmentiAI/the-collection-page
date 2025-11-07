import * as bitcoin from 'bitcoinjs-lib'

export type AddressType = 'p2tr' | 'p2wpkh' | 'p2sh' | 'p2pkh' | 'unknown'

export function getAddressType(address: string): AddressType {
  if (!address) {
    return 'unknown'
  }

  const normalized = address.toLowerCase()

  if (normalized.startsWith('bc1p')) {
    return 'p2tr'
  }
  if (normalized.startsWith('bc1q')) {
    return 'p2wpkh'
  }
  if (normalized.startsWith('3')) {
    return 'p2sh'
  }
  if (normalized.startsWith('1')) {
    return 'p2pkh'
  }

  try {
    bitcoin.address.fromBase58Check(address)
    return 'p2pkh'
  } catch (base58Err) {
    try {
      const { version } = bitcoin.address.fromBech32(address)
      if (version === 1) {
        return 'p2tr'
      }
      if (version === 0) {
        return 'p2wpkh'
      }
    } catch (bech32Err) {
      // fall through to unknown
    }
  }

  return 'unknown'
}

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
    if (!taprootPublicKey) {
      return
    }

    let keyBuffer = Buffer.from(taprootPublicKey, 'hex')
    if (keyBuffer.length === 33 && (keyBuffer[0] === 0x02 || keyBuffer[0] === 0x03)) {
      keyBuffer = keyBuffer.subarray(1)
    }

    if (keyBuffer.length !== 32) {
      console.warn('Unexpected taproot key length for address', address)
      return
    }

    const internalKey = keyBuffer
    if (!psbt.data.inputs[inputIndex].tapInternalKey) {
      psbt.updateInput(inputIndex, {
        tapInternalKey: internalKey
      })
    }
    return
  }

  if (type === 'p2sh') {
    if (!paymentPublicKey || typeof valueSats !== 'number') {
      return
    }

    const pubkeyBuffer = Buffer.from(paymentPublicKey, 'hex')
    const network = bitcoin.networks.bitcoin

    const nested = bitcoin.payments.p2sh({
      redeem: bitcoin.payments.p2wpkh({ pubkey: pubkeyBuffer, network }),
      network
    })

    const update: Record<string, unknown> = {}

    if (nested.redeem?.output && !psbt.data.inputs[inputIndex].redeemScript) {
      update.redeemScript = nested.redeem.output
    }

    if (nested.output && !psbt.data.inputs[inputIndex].witnessUtxo) {
      update.witnessUtxo = {
        script: nested.output,
        value: BigInt(valueSats)
      }
    }

    if (Object.keys(update).length > 0) {
      psbt.updateInput(inputIndex, update)
    }

    return
  }

  if (!paymentPublicKey) {
    return
  }

  const pubkeyBuffer = Buffer.from(paymentPublicKey, 'hex')

  if (!psbt.data.inputs[inputIndex].bip32Derivation) {
    psbt.updateInput(inputIndex, {
      bip32Derivation: [
        {
          masterFingerprint: Buffer.alloc(4),
          pubkey: pubkeyBuffer,
          path: ''
        }
      ]
    })
  }
}

