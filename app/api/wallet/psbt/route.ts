import { NextRequest, NextResponse } from 'next/server'
import * as bitcoin from 'bitcoinjs-lib'
import * as ecc from '@bitcoinerlab/secp256k1'

import { addInputSigningInfo } from '@/app/api/self-inscribe/utils/bitcoin'
import { fetchSandshrewTx } from '@/lib/sandshrew'
import { buildRunestoneScript, parseRuneId, type RuneTransfer, validateOutputIndices } from '@/lib/rune-encoding'

bitcoin.initEccLib(ecc)

interface BuildPsbtInput {
  txid: string
  vout: number
  value: number
}

interface BuildPsbtOutput {
  address?: string | null
  amount: number
  script?: string | null
}

interface BuildPsbtRequestBody {
  inputs: BuildPsbtInput[]
  outputs: BuildPsbtOutput[]
  changeOutput?: BuildPsbtOutput | null
  paymentAddress?: string | null
  paymentPublicKey?: string | null
  taprootPublicKey?: string | null
  fee?: number | null
  vsize?: number | null
  runeTransfers?: Array<{
    runeId: string  // Format: "block:tx"
    amount: string  // BigInt as string
    outputIndex: number
  }>
}

function toHexBuffer(hex: string, field: string): Buffer {
  if (!/^[0-9a-fA-F]+$/.test(hex)) {
    throw new Error(`Invalid hex string for ${field}`)
  }
  return Buffer.from(hex, 'hex')
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as BuildPsbtRequestBody
    
    // Log if rune transfers are being passed
    if (body.runeTransfers && body.runeTransfers.length > 0) {
      console.log(`🔮 [wallet/psbt] Received ${body.runeTransfers.length} rune transfer(s) in request`)
      console.log(`   Transfers:`, body.runeTransfers.map(rt => `${rt.runeId} → ${rt.amount} to output ${rt.outputIndex}`).join(', '))
    } else {
      console.log(`ℹ️ [wallet/psbt] No rune transfers in request`)
    }

    if (!body || !Array.isArray(body.inputs) || body.inputs.length === 0) {
      return NextResponse.json(
        { success: false, error: 'At least one input is required to build a PSBT' },
        { status: 400 },
      )
    }

    if (!Array.isArray(body.outputs) || body.outputs.length === 0) {
      return NextResponse.json(
        { success: false, error: 'At least one destination output is required' },
        { status: 400 },
      )
    }

    const psbt = new bitcoin.Psbt({ network: bitcoin.networks.bitcoin })

    const fetchPromises = body.inputs.map((input) => fetchSandshrewTx(input.txid))
    const transactions = await Promise.all(fetchPromises)

    let totalInputValue = 0

    for (let index = 0; index < body.inputs.length; index++) {
      const input = body.inputs[index]
      const tx = transactions[index]
      const output = tx.vout?.[input.vout]

      if (!output) {
        throw new Error(`Transaction ${input.txid} does not have output index ${input.vout}`)
      }

      if (typeof output.value !== 'number') {
        throw new Error(`Sandshrew transaction output missing value for ${input.txid}:${input.vout}`)
      }

      if (input.value != null && input.value !== output.value) {
        console.warn(
          `[wallet/psbt] Input value mismatch for ${input.txid}:${input.vout} (plan=${input.value} vs tx=${output.value})`,
        )
      }

      if (!output.scriptpubkey) {
        throw new Error(`Sandshrew transaction output missing scriptpubkey for ${input.txid}:${input.vout}`)
      }

      psbt.addInput({
        hash: input.txid,
        index: input.vout,
        witnessUtxo: {
          script: toHexBuffer(output.scriptpubkey, 'scriptpubkey'),
          value: BigInt(output.value),
        },
      })

      const address = output.scriptpubkey_address ?? body.paymentAddress ?? ''
      if (address) {
        addInputSigningInfo(
          psbt,
          index,
          address,
          body.paymentPublicKey ?? undefined,
          body.taprootPublicKey ?? undefined,
          output.value,
        )
      }

      totalInputValue += output.value
    }

    let totalOutputValue = 0
    let opReturnOutputIndex = -1

    // Add OP_RETURN output FIRST if we have rune transfers
    // The edict output indices should reference the destination outputs (which come after OP_RETURN)
    console.log(`🔍 [wallet/psbt] Checking for rune transfers:`, {
      hasRuneTransfers: !!body.runeTransfers,
      isArray: Array.isArray(body.runeTransfers),
      length: body.runeTransfers?.length ?? 0,
      value: body.runeTransfers
    })
    
    if (body.runeTransfers && Array.isArray(body.runeTransfers) && body.runeTransfers.length > 0) {
      console.log(`🔮 [wallet/psbt] Processing ${body.runeTransfers.length} rune transfer(s)`)
      
      // Convert rune transfers to the format expected by buildRunestoneScript
      // Note: output indices in edicts should reference destination outputs (1, 2, etc.)
      // since OP_RETURN will be at index 0
      const transfers: RuneTransfer[] = body.runeTransfers.map((rt) => {
        const runeId = parseRuneId(rt.runeId)
        return {
          runeId,
          amount: BigInt(rt.amount),
          outputIndex: rt.outputIndex,  // This should already account for OP_RETURN being first
        }
      })
      
      // Calculate how many regular outputs we'll have (for validation)
      const regularOutputCount = body.outputs.length + (body.changeOutput && body.changeOutput.amount > 0 ? 1 : 0)
      
      // Validate output indices
      // Edict indices should reference destination outputs (1, 2, etc.) since OP_RETURN is at 0
      // So we validate against the total output count (including OP_RETURN)
      const totalOutputCount = regularOutputCount + 1 // +1 for OP_RETURN
      const validation = validateOutputIndices(transfers, totalOutputCount)
      if (!validation.valid) {
        throw new Error(`Invalid rune transfer output indices: ${validation.errors.join(', ')}`)
      }
      
      console.log(`   Validated ${transfers.length} transfers against ${totalOutputCount} total outputs (${regularOutputCount} regular + 1 OP_RETURN)`)
      
      // Build the Runestone script
      const runestoneScript = buildRunestoneScript(transfers)
      console.log(`📜 [wallet/psbt] Built Runestone script (${runestoneScript.length} bytes)`)
      console.log(`   Script hex: ${runestoneScript.toString('hex').substring(0, 100)}...`)
      
      // Add OP_RETURN output FIRST (output 0)
      psbt.addOutput({
        script: runestoneScript,
        value: BigInt(0),  // OP_RETURN outputs have 0 value
      })
      
      opReturnOutputIndex = 0
      console.log(`✅ [wallet/psbt] Added OP_RETURN output at index ${opReturnOutputIndex} (first output)`)
      console.log(`   Transfers:`, transfers.map(t => `${t.runeId.block}:${t.runeId.tx} → ${t.amount} to output ${t.outputIndex}`).join(', '))
    }

    // Add regular outputs (these are where runes will be sent)
    // These will be at indices 1, 2, etc. if OP_RETURN is at 0
    for (const output of body.outputs) {
      if (typeof output.amount !== 'number' || output.amount < 0) {
        throw new Error('Each output must include a non-negative amount')
      }

      if (output.script && output.script.trim()) {
        const script = toHexBuffer(output.script.trim(), 'script')
        psbt.addOutput({
          script,
          value: BigInt(output.amount),
        })
      } else if (output.address && output.address.trim()) {
        if (output.amount <= 0) {
          throw new Error('Non-script outputs must include a positive amount')
        }
        psbt.addOutput({
          address: output.address.trim(),
          value: BigInt(output.amount),
        })
      } else {
        throw new Error('Each output must include either an address or a script')
      }
      totalOutputValue += output.amount
    }

    if (body.changeOutput && body.changeOutput.amount > 0) {
      if (!body.changeOutput.address) {
        throw new Error('Change output is missing an address')
      }
      psbt.addOutput({
        address: body.changeOutput.address,
        value: BigInt(body.changeOutput.amount),
      })
      totalOutputValue += body.changeOutput.amount
    }


    const impliedFee = totalInputValue - totalOutputValue
    
    // Calculate final output count (includes OP_RETURN if added)
    const finalOutputCount = psbt.txOutputs.length
    const hasOpReturn = opReturnOutputIndex >= 0

    console.log(`📊 [wallet/psbt] Final transaction summary:`)
    console.log(`   Inputs: ${body.inputs.length} (${totalInputValue} sats)`)
    console.log(`   Outputs: ${finalOutputCount} (${hasOpReturn ? `includes OP_RETURN at index ${opReturnOutputIndex}` : 'no OP_RETURN'})`)
    if (hasOpReturn) {
      console.log(`   ✅ OP_RETURN output added at index ${opReturnOutputIndex}`)
    } else {
      console.log(`   ⚠️ No OP_RETURN output added (runeTransfers: ${body.runeTransfers ? `array with ${body.runeTransfers.length} items` : 'undefined/null'})`)
    }
    console.log(`   Fee: ${impliedFee} sats`)

    return NextResponse.json({
      success: true,
      psbt: psbt.toBase64(),
      summary: {
        inputs: {
          count: body.inputs.length,
          value: totalInputValue,
        },
        outputs: {
          count: finalOutputCount,  // Includes OP_RETURN if added
          value: totalOutputValue,   // OP_RETURN has 0 value, so this is correct
        },
        fee: impliedFee,
        planFee: body.fee ?? null,
        planVsize: body.vsize ?? null,
      },
    })
  } catch (error) {
    console.error('[wallet/psbt] Failed to build PSBT', error)
    const message = error instanceof Error ? error.message : 'Unable to build PSBT'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

