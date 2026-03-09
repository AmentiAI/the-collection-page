import { NextRequest, NextResponse } from 'next/server'
import * as bitcoin from 'bitcoinjs-lib'
import * as ecc from '@bitcoinerlab/secp256k1'
import { getPool } from '@/lib/db'
import crypto from 'crypto'

bitcoin.initEccLib(ecc)

export const dynamic = 'force-dynamic'

const MEMPOOL_BASE = 'https://mempool.space/api'
const BURN_VALUE   = BigInt(1)  // 1 sat OP_RETURN per tx

// Attempt to broadcast, returning { txid } on success or { error, attempts } on failure.
// OP_RETURN outputs with value > 0 are non-standard; we try multiple endpoints.
async function broadcastTx(txHex: string, taalApiKey?: string, quicknodeUrl?: string): Promise<{ txid?: string; error?: string; attempts: Record<string, string> }> {
  const attempts: Record<string, string> = {}

  // ── Attempt 1: QuickNode submitpackage with maxburnamount ────────────────────
  // submitpackage accepts a maxburnamount param (in BTC) that bypasses the
  // unspendable output check — allowing our 1-sat OP_RETURN burn outputs.
  if (quicknodeUrl) {
    try {
      const res = await fetch(quicknodeUrl, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method:  'submitpackage',
          params:  [
            [txHex],       // package = array of raw txs (single tx is valid)
            0,             // maxfeerate: 0 = no limit
            0.00000002,    // maxburnamount in BTC = 2 sats (covers our 2× 1-sat OP_RETURNs)
          ],
          id: 1,
        }),
        cache: 'no-store',
      })
      const text = await res.text()
      attempts['quicknode_submitpackage'] = `HTTP ${res.status}: ${text.slice(0, 400)}`
      if (res.ok) {
        try {
          const json = JSON.parse(text)
          // submitpackage returns { result: { package_msg, tx-results: { <txid>: {...} } } }
          const txResults = json?.result?.['tx-results']
          if (txResults) {
            const txid = Object.keys(txResults)[0]
            if (txid) return { txid, attempts }
          }
          // Some versions return result.txid directly
          if (json?.result?.txid) return { txid: json.result.txid, attempts }
        } catch { /* not JSON */ }
      }
    } catch (e) {
      attempts['quicknode_submitpackage'] = `Error: ${e}`
    }
  }

  // ── Attempt 2: TAAL ARC (accepts non-standard txs) ──────────────────────────
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (taalApiKey) headers['Authorization'] = `Bearer ${taalApiKey}`
    const res = await fetch('https://arc.taal.com/v1/tx', {
      method: 'POST',
      headers,
      body:   JSON.stringify({ rawTx: txHex }),
      cache:  'no-store',
    })
    const text = await res.text()
    attempts['taal_arc'] = `HTTP ${res.status}: ${text.slice(0, 300)}`
    if (res.ok) {
      try {
        const json = JSON.parse(text)
        const txid = json?.txid ?? json?.txID
        if (txid) return { txid: String(txid).trim(), attempts }
      } catch { /* not JSON */ }
      if (/^[a-f0-9]{64}$/i.test(text.trim())) return { txid: text.trim(), attempts }
    }
  } catch (e) {
    attempts['taal_arc'] = `Error: ${e}`
  }

  // ── Attempt 2: MARA Slipstream (non-standard tx relay service) ─────────────
  // https://slipstream.mara.com — purpose-built for non-standard Bitcoin txs
  try {
    const res = await fetch('https://slipstream.mara.com/tx', {
      method:  'POST',
      headers: { 'Content-Type': 'text/plain' },
      body:    txHex,
      cache:   'no-store',
    })
    const text = await res.text()
    attempts['mara_slipstream'] = `HTTP ${res.status}: ${text.slice(0, 300)}`
    if (res.ok) {
      try {
        const json = JSON.parse(text)
        const txid = json?.txid ?? json?.txID ?? json?.data?.txid
        if (txid) return { txid: String(txid).trim(), attempts }
      } catch { /* not JSON */ }
      if (/^[a-f0-9]{64}$/i.test(text.trim())) return { txid: text.trim(), attempts }
    }
  } catch (e) {
    attempts['mara_slipstream'] = `Error: ${e}`
  }

  // ── Attempt 4: mempool.space standard /api/tx (will fail for non-standard) ──
  try {
    const res = await fetch('https://mempool.space/api/tx', {
      method:  'POST',
      headers: { 'Content-Type': 'text/plain' },
      body:    txHex,
      cache:   'no-store',
    })
    const text = await res.text()
    attempts['mempool_standard'] = `HTTP ${res.status}: ${text.slice(0, 300)}`
    if (res.ok) {
      const txid = text.trim()
      if (/^[a-f0-9]{64}$/i.test(txid)) return { txid, attempts }
    }
  } catch (e) {
    attempts['mempool_standard'] = `Error: ${e}`
  }

  return { error: 'All broadcast attempts failed — see attempts for details', attempts }
}

// TX1: 2 player inputs + OP_RETURN + P2TR output
// TX2: 2 server P2TR inputs + OP_RETURN + P2TR output
// Non-witness: 10 overhead + 2×41 inputs + 17 OP_RETURN + 43 P2TR = 152 bytes
function calcTx1Fee(winnerWitnessLen: number, loserWitnessLen: number, feeRate: number): bigint {
  const nonWitness = 10 + (2 * 41) + 17 + 43
  const witness    = 2 + winnerWitnessLen + loserWitnessLen
  const weight     = nonWitness * 4 + witness
  return BigInt(Math.ceil(weight / 4) * feeRate)
}

function calcTx2Fee(feeRate: number): bigint {
  const nonWitness = 10 + (2 * 41) + 17 + 43
  const witness    = 2 + 66 + 66  // two server taproot sigs
  const weight     = nonWitness * 4 + witness
  return BigInt(Math.ceil(weight / 4) * feeRate)
}

// Determine winner: higher (atk + spd) wins; tiebreak = lower inscription number
function determineWinner(f1: any, f2: any): 1 | 2 {
  const s1 = (f1?.atk ?? 0) + (f1?.spd ?? 0)
  const s2 = (f2?.atk ?? 0) + (f2?.spd ?? 0)
  if (s1 !== s2) return s1 > s2 ? 1 : 2
  const n1 = f1?.inscriptionNumber ?? Infinity
  const n2 = f2?.inscriptionNumber ?? Infinity
  return n1 <= n2 ? 1 : 2
}

// Build a taproot signer using the tweaked private key
function buildTaprootSigner(privKeyHex: string) {
  const privKey = Buffer.from(privKeyHex, 'hex')
  const fullPub = Buffer.from(ecc.pointFromScalar(privKey, true)!)
  const xOnly   = fullPub.slice(1) // 32-byte internal pubkey

  // Negate if odd (required before tweaking per BIP341)
  let sk = privKey
  if (fullPub[0] === 0x03) sk = Buffer.from(ecc.privateNegate(sk))

  // Compute tweaked key: tweakedSk = sk + tagged_hash('TapTweak', xOnly) mod n
  const tweak      = bitcoin.crypto.taggedHash('TapTweak', xOnly)
  const tweakedSk  = Buffer.from(ecc.privateAdd(sk, tweak)!)
  const tweakedPub = Buffer.from(ecc.pointFromScalar(tweakedSk, true)!).slice(1)

  return {
    xOnly,       // set as tapInternalKey in PSBT input
    tweakedPub,  // for verification
    // bitcoinjs-lib PSBT: publicKey.slice(1) must match tweakKey(tapInternalKey).x
    publicKey: Buffer.concat([Buffer.from([0x02]), tweakedPub]),
    sign: (hash: Buffer) =>
      Buffer.from(ecc.signSchnorr(hash, tweakedSk, crypto.randomBytes(32))),
    signSchnorr: (hash: Buffer) =>
      Buffer.from(ecc.signSchnorr(hash, tweakedSk, crypto.randomBytes(32))),
  }
}

async function fetchWalletUtxos(address: string) {
  const res = await fetch(`${MEMPOOL_BASE}/address/${encodeURIComponent(address)}/utxo`, { cache: 'no-store' })
  if (!res.ok) throw new Error(`Cannot fetch UTXOs: ${res.status}`)
  return res.json() as Promise<Array<{ txid: string; vout: number; status: { confirmed: boolean }; value: number }>>
}

async function getOutputScript(txid: string, vout: number): Promise<{ script: Buffer; value: bigint }> {
  const res = await fetch(`${MEMPOOL_BASE}/tx/${txid}/hex`, { cache: 'no-store' })
  if (!res.ok) throw new Error(`Cannot fetch tx ${txid}: ${res.status}`)
  const tx  = bitcoin.Transaction.fromHex(await res.text())
  const out = tx.outs[vout]
  if (!out) throw new Error(`vout ${vout} not found in ${txid}`)
  return { script: Buffer.from(out.script), value: BigInt(out.value) }
}

export async function GET(req: NextRequest) {
  const feeRate     = Math.max(1, parseInt(req.nextUrl.searchParams.get('fee_rate') ?? '1'))
  const doBroadcast = req.nextUrl.searchParams.get('broadcast') === 'true'
  const pool = getPool()

  // ── Load battle wallet credentials from DB ───────────────────────────────────
  const { rows: settingRows } = await pool.query(
    `SELECT setting_key, setting_value FROM global_settings WHERE setting_key IN ('battle_wallet_private_key', 'battle_wallet_address')`
  )
  const settings   = Object.fromEntries(settingRows.map((r: { setting_key: string; setting_value: string }) => [r.setting_key, r.setting_value]))
  const privKeyHex = settings['battle_wallet_private_key']
  const battleAddr = settings['battle_wallet_address']

  if (!privKeyHex || !battleAddr) {
    return NextResponse.json(
      { error: 'Battle wallet not configured — add battle_wallet_private_key and battle_wallet_address to global_settings' },
      { status: 500 }
    )
  }

  // ── Find oldest ready battle ─────────────────────────────────────────────────
  const { rows } = await pool.query(`
    SELECT
      q1.id           AS q1_id,
      q1.player_id    AS p1_id,
      q1.fighter_data AS f1,
      q1.signed_psbt  AS p1_psbt,
      q2.id           AS q2_id,
      q2.player_id    AS p2_id,
      q2.fighter_data AS f2,
      q2.signed_psbt  AS p2_psbt,
      q1.joined_at    AS joined_at
    FROM matchmaking_queue q1
    JOIN matchmaking_queue q2 ON q2.id = q1.opponent_queue_id
    WHERE q1.status = 'matched'
      AND q1.expires_at > NOW()
      AND q1.signed_psbt IS NOT NULL
      AND q2.signed_psbt IS NOT NULL
      AND q1.id::text < q1.opponent_queue_id::text
    ORDER BY q1.joined_at ASC
    LIMIT 1
  `)

  if (!rows.length) {
    return NextResponse.json(
      { error: 'No ready battle found — both players must have signed PSBTs in the queue' },
      { status: 404 }
    )
  }

  const row = rows[0]

  // ── Parse player PSBTs ──────────────────────────────────────────────────────
  let p1Psbt: bitcoin.Psbt, p2Psbt: bitcoin.Psbt
  try {
    p1Psbt = bitcoin.Psbt.fromBase64(row.p1_psbt)
    p2Psbt = bitcoin.Psbt.fromBase64(row.p2_psbt)
  } catch {
    return NextResponse.json({ error: 'Failed to parse one or both player PSBTs' }, { status: 400 })
  }

  const p1In            = p1Psbt.txInputs[0]
  const p2In            = p2Psbt.txInputs[0]
  const p1Witness       = p1Psbt.data.inputs[0].witnessUtxo
  const p2Witness       = p2Psbt.data.inputs[0].witnessUtxo
  const p1FinalWitness  = p1Psbt.data.inputs[0].finalScriptWitness
  const p2FinalWitness  = p2Psbt.data.inputs[0].finalScriptWitness
  const p1TapKey        = p1Psbt.data.inputs[0].tapInternalKey
  const p2TapKey        = p2Psbt.data.inputs[0].tapInternalKey
  const p1TapKeySig     = p1Psbt.data.inputs[0].tapKeySig
  const p2TapKeySig     = p2Psbt.data.inputs[0].tapKeySig

  if (!p1Witness || !p2Witness) {
    return NextResponse.json({ error: 'Player PSBTs missing witnessUtxo' }, { status: 400 })
  }

  const p1TxId  = Buffer.from(p1In.hash).reverse().toString('hex')
  const p2TxId  = Buffer.from(p2In.hash).reverse().toString('hex')
  const ord1Val = BigInt(p1Witness.value)
  const ord2Val = BigInt(p2Witness.value)

  // ── Determine winner ────────────────────────────────────────────────────────
  const winnerNum = determineWinner(row.f1, row.f2)

  // Winner's ordinal is TX1 input 0 (inscription burns in OP_RETURN output 0)
  // Loser's ordinal is TX1 input 1 (inscription flows to winner with the sats)
  const winnerAddr   = winnerNum === 1 ? row.p1_id : row.p2_id
  const winnerTxId   = winnerNum === 1 ? p1TxId    : p2TxId
  const winnerIn     = winnerNum === 1 ? p1In       : p2In
  const winnerOrdWU  = winnerNum === 1 ? p1Witness  : p2Witness
  const winnerOrdVal = winnerNum === 1 ? ord1Val    : ord2Val
  const winnerFW     = winnerNum === 1 ? p1FinalWitness : p2FinalWitness
  const winnerTapKey = winnerNum === 1 ? p1TapKey   : p2TapKey
  const winnerTapSig = winnerNum === 1 ? p1TapKeySig : p2TapKeySig

  const loserTxId   = winnerNum === 1 ? p2TxId    : p1TxId
  const loserIn     = winnerNum === 1 ? p2In       : p1In
  const loserOrdWU  = winnerNum === 1 ? p2Witness  : p1Witness
  const loserOrdVal = winnerNum === 1 ? ord2Val    : ord1Val
  const loserFW     = winnerNum === 1 ? p2FinalWitness : p1FinalWitness
  const loserTapKey = winnerNum === 1 ? p2TapKey   : p1TapKey
  const loserTapSig = winnerNum === 1 ? p2TapKeySig : p1TapKeySig

  // ── Witness lengths for fee calculation ─────────────────────────────────────
  const winnerWitnessLen = winnerFW?.length ?? 67
  const loserWitnessLen  = loserFW?.length  ?? 67
  const fee1 = calcTx1Fee(winnerWitnessLen, loserWitnessLen, feeRate)
  const fee2 = calcTx2Fee(feeRate)

  // ── Fetch server padding UTXOs ──────────────────────────────────────────────
  let walletUtxos: Array<{ txid: string; vout: number; status: { confirmed: boolean }; value: number }>
  try {
    walletUtxos = await fetchWalletUtxos(battleAddr)
  } catch (e) {
    return NextResponse.json({ error: `Failed to fetch battle wallet UTXOs: ${e}` }, { status: 500 })
  }

  const candidates = walletUtxos
    .filter(u => u.status?.confirmed && u.value >= 1000)
    .sort((a, b) => a.value - b.value)

  if (candidates.length < 2) {
    return NextResponse.json({
      error: `Battle wallet needs ≥2 confirmed UTXOs of at least 1000 sats each`,
      battle_wallet: battleAddr,
      utxos_found: walletUtxos,
    }, { status: 400 })
  }

  const [pad1, pad2] = candidates

  let pad1Out: { script: Buffer; value: bigint }
  let pad2Out: { script: Buffer; value: bigint }
  try {
    ;[pad1Out, pad2Out] = await Promise.all([
      getOutputScript(pad1.txid, pad1.vout),
      getOutputScript(pad2.txid, pad2.vout),
    ])
  } catch (e) {
    return NextResponse.json({ error: `Failed to fetch padding UTXO scripts: ${e}` }, { status: 500 })
  }

  const pad1Val = pad1Out.value
  const pad2Val = pad2Out.value

  // ── Output values ───────────────────────────────────────────────────────────
  // TX1: winner's ordinal + pad1 → OP_RETURN burn + winner payout
  const tx1WinnerOut = (winnerOrdVal - BURN_VALUE) + pad1Val - fee1
  // TX2: loser's ordinal + pad2 → OP_RETURN burn + server collects
  const tx2ServerOut = (loserOrdVal - BURN_VALUE) + pad2Val - fee2

  if (tx1WinnerOut <= BigInt(0)) {
    return NextResponse.json({ error: `TX1 output negative — pad1 too small to cover fee (${fee1} sats)` }, { status: 400 })
  }

  const winnerScript = bitcoin.address.toOutputScript(winnerAddr, bitcoin.networks.bitcoin)
  const ourScript    = bitcoin.address.toOutputScript(battleAddr, bitcoin.networks.bitcoin)
  const burnScript   = bitcoin.script.compile([bitcoin.opcodes.OP_RETURN, Buffer.from('BATTLE')])
  const signer       = buildTaprootSigner(privKeyHex)

  // ── Build TX1: winner's ordinal (input 0) + server pad1 (input 1) ───────────
  // Output 0: OP_RETURN burns winner's inscription (first sat of input 0)
  // Output 1: (winnerOrdVal - 1) + pad1Val - fee → winner address
  const tx1 = new bitcoin.Psbt({ network: bitcoin.networks.bitcoin })
  tx1.addInput({ hash: winnerTxId, index: winnerIn.index, sequence: 0xfffffffd, witnessUtxo: { script: Buffer.from(winnerOrdWU.script), value: winnerOrdVal } })
  tx1.addInput({ hash: pad1.txid,  index: pad1.vout,      sequence: 0xfffffffd, witnessUtxo: { script: pad1Out.script, value: pad1Val } })
  tx1.addOutput({ script: burnScript,   value: BURN_VALUE    }) // 0: OP_RETURN burns winner inscription
  tx1.addOutput({ script: winnerScript, value: tx1WinnerOut  }) // 1: winner payout

  // Inject winner signature (input 0)
  let tx1WinnerErr: string | null = null
  if (winnerFW) {
    tx1.data.inputs[0].finalScriptWitness = winnerFW
  } else if (winnerTapSig) {
    try {
      if (winnerTapKey) tx1.updateInput(0, { tapInternalKey: winnerTapKey })
      tx1.updateInput(0, { tapKeySig: winnerTapSig })
      tx1.finalizeInput(0)
    } catch (e) { tx1WinnerErr = String(e) }
  } else {
    tx1WinnerErr = 'No signature found in winner PSBT'
  }

  // Server signs pad1 (input 1)
  tx1.updateInput(1, { tapInternalKey: signer.xOnly })
  let tx1PadErr: string | null = null
  try {
    tx1.signInput(1, signer)
    tx1.finalizeInput(1)
  } catch (e) { tx1PadErr = String(e) }

  // ── Build TX2: loser's ordinal (input 0) + server pad2 (input 1) ────────────
  // Output 0: OP_RETURN burns loser's inscription (first sat of input 0)
  // Output 1: (loserOrdVal - 1) + pad2Val - fee → server battle wallet
  const tx2 = new bitcoin.Psbt({ network: bitcoin.networks.bitcoin })
  tx2.addInput({ hash: loserTxId, index: loserIn.index, sequence: 0xfffffffd, witnessUtxo: { script: Buffer.from(loserOrdWU.script), value: loserOrdVal } })
  tx2.addInput({ hash: pad2.txid, index: pad2.vout,     sequence: 0xfffffffd, witnessUtxo: { script: pad2Out.script, value: pad2Val } })
  tx2.addOutput({ script: burnScript, value: BURN_VALUE    }) // 0: OP_RETURN burns loser inscription
  tx2.addOutput({ script: ourScript,  value: tx2ServerOut  }) // 1: server collects

  // Inject loser signature (input 0)
  let tx2LoserErr: string | null = null
  if (loserFW) {
    tx2.data.inputs[0].finalScriptWitness = loserFW
  } else if (loserTapSig) {
    try {
      if (loserTapKey) tx2.updateInput(0, { tapInternalKey: loserTapKey })
      tx2.updateInput(0, { tapKeySig: loserTapSig })
      tx2.finalizeInput(0)
    } catch (e) { tx2LoserErr = String(e) }
  } else {
    tx2LoserErr = 'No signature found in loser PSBT'
  }

  // Server signs pad2 (input 1)
  tx2.updateInput(1, { tapInternalKey: signer.xOnly })
  let tx2PadErr: string | null = null
  try {
    tx2.signInput(1, signer)
    tx2.finalizeInput(1)
  } catch (e) { tx2PadErr = String(e) }

  // ── Extract hex ─────────────────────────────────────────────────────────────
  const tx1Ready = !tx1WinnerErr && !tx1PadErr
  const tx2Ready = !tx2LoserErr && !tx2PadErr
  let tx1Hex: string | null = null
  let tx2Hex: string | null = null
  if (tx1Ready) { try { tx1Hex = tx1.extractTransaction().toHex() } catch { } }
  if (tx2Ready) { try { tx2Hex = tx2.extractTransaction().toHex() } catch { } }

  // ── Broadcast if requested ──────────────────────────────────────────────────
  const quicknodeUrl = process.env.QUICKNODE_BTC_URL ?? 'https://special-bitter-dew.btc.quiknode.pro/82a382c9fef56c7a31e6e14a65bd512a8fde7130/'
  const taalKey      = process.env.TAAL_API_KEY ?? undefined

  let tx1BroadcastTxid: string | null = null
  let tx1BroadcastError: string | null = null
  let tx1BroadcastAttempts: Record<string, string> | null = null
  let tx2BroadcastTxid: string | null = null
  let tx2BroadcastError: string | null = null
  let tx2BroadcastAttempts: Record<string, string> | null = null

  if (doBroadcast && tx1Hex && tx2Hex) {
    const [r1, r2] = await Promise.all([
      broadcastTx(tx1Hex, taalKey, quicknodeUrl),
      broadcastTx(tx2Hex, taalKey, quicknodeUrl),
    ])
    tx1BroadcastTxid     = r1.txid ?? null
    tx1BroadcastError    = r1.error ?? null
    tx1BroadcastAttempts = r1.attempts
    tx2BroadcastTxid     = r2.txid ?? null
    tx2BroadcastError    = r2.error ?? null
    tx2BroadcastAttempts = r2.attempts
  }

  return NextResponse.json({
    battle: {
      queue_id:       row.q1_id,
      joined_at:      row.joined_at,
      winner:         winnerNum,
      winner_address: winnerAddr,
      player1: { wallet: row.p1_id, fighter: row.f1 },
      player2: { wallet: row.p2_id, fighter: row.f2 },
    },
    tx1: {
      desc: 'Winner payout — winner inscription burned, winner receives both ordinal values',
      inputs: {
        0: { desc: 'winner ordinal (inscription burns)', txid: winnerTxId, vout: winnerIn.index, value_sats: Number(winnerOrdVal) },
        1: { desc: 'server pad1',                        txid: pad1.txid,  vout: pad1.vout,      value_sats: Number(pad1Val) },
      },
      outputs: {
        0: { desc: 'OP_RETURN burn (winner inscription)', value_sats: Number(BURN_VALUE) },
        1: { desc: `winner payout → ${winnerAddr}`,      value_sats: Number(tx1WinnerOut) },
      },
      fee_sats:  Number(fee1),
      est_vsize: Math.ceil(((10 + 2*41 + 17 + 43) * 4 + 2 + winnerWitnessLen + loserWitnessLen) / 4),
      signing: {
        input_0_winner: tx1WinnerErr ?? (winnerFW ? 'FINALIZED (witness copied)' : 'SIGNED + FINALIZED'),
        input_1_server_pad: tx1PadErr ?? 'SIGNED + FINALIZED',
      },
      ready: tx1Ready,
      broadcast_txid:     tx1BroadcastTxid,
      broadcast_error:    tx1BroadcastError,
      broadcast_attempts: tx1BroadcastAttempts,
      tx_hex: tx1Hex,
    },
    tx2: {
      desc: 'Server collection — BATTLE marker + server pads recovered',
      inputs: {
        0: { desc: 'server pad1', txid: pad1.txid, vout: pad1.vout, value_sats: Number(pad1Val) },
        1: { desc: 'server pad2', txid: pad2.txid, vout: pad2.vout, value_sats: Number(pad2Val) },
      },
      outputs: {
        0: { desc: 'OP_RETURN BATTLE marker', value_sats: Number(BURN_VALUE) },
        1: { desc: 'server collection',       value_sats: Number(tx2ServerOut), to: battleAddr },
      },
      fee_sats:  Number(fee2),
      est_vsize: Math.ceil(((10 + 2*41 + 17 + 43) * 4 + 2 + 66 + 66) / 4),
      signing: {
        input_0_loser:      tx2LoserErr ?? (loserFW ? 'FINALIZED (witness copied)' : 'SIGNED + FINALIZED'),
        input_1_server_pad: tx2PadErr   ?? 'SIGNED + FINALIZED',
      },
      ready: tx2Ready,
      broadcast_txid:     tx2BroadcastTxid,
      broadcast_error:    tx2BroadcastError,
      broadcast_attempts: tx2BroadcastAttempts,
      tx_hex: tx2Hex,
    },
  })
}
