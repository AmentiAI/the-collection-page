import { NextRequest, NextResponse } from 'next/server'
import * as bitcoin from 'bitcoinjs-lib'
import * as ecc from '@bitcoinerlab/secp256k1'
import { getPool } from '@/lib/db'
import crypto from 'crypto'

bitcoin.initEccLib(ecc)

export const dynamic = 'force-dynamic'

const MEMPOOL_BASE  = 'https://mempool.space/api'
const WINNER_PAYOUT = BigInt(625)  // sats to winner
const BURN_VALUE    = BigInt(1)    // 1 sat per OP_RETURN burn — first sat of each ordinal input burns

// Attempt to broadcast, returning { txid } on success or { error, attempts } on failure.
// OP_RETURN outputs with value > 0 are non-standard; we try multiple endpoints.
async function broadcastTx(txHex: string, taalApiKey?: string): Promise<{ txid?: string; error?: string; attempts: Record<string, string> }> {
  const attempts: Record<string, string> = {}

  // ── Attempt 1: TAAL ARC (accepts non-standard txs) ──────────────────────────
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
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ rawTx: txHex }),
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

// Calculate tx fee from actual witness sizes.
// weight = non_witness_bytes × 4 + witness_bytes × 1
// vsize  = ceil(weight / 4)
//
// Non-witness per input: 32 (txid) + 4 (vout) + 1 (scriptLen=0) + 4 (seq) = 41 bytes
// Server taproot witness per input: 1 (stack count) + 1 (sig len) + 64 (schnorr) = 66 bytes
// Outputs (all non-witness):
//   P2TR:      8 (value) + 1 (len) + 34 (script) = 43 bytes
//   OP_RETURN: 8 (value) + 1 (len) + 8  (script) = 17 bytes (OP_RETURN + push + "BATTLE")
// Overhead: 4 (version) + 4 (locktime) + 1 (vin count) + 1 (vout count) = 10 non-witness
//           + 2 (segwit marker+flag) witness
function calcFee(p1WitnessLen: number, p2WitnessLen: number, feeRate: number): bigint {
  const nonWitness = 10 + (4 * 41) + (3 * 43) + (2 * 17) // overhead + 4 inputs base + outputs
  const witness    = 2 + p1WitnessLen + 66 + p2WitnessLen + 66 // segwit flag + all input witnesses
  const weight     = nonWitness * 4 + witness
  const vsize      = Math.ceil(weight / 4)
  return BigInt(vsize * feeRate)
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
  const feeRate    = Math.max(1, parseInt(req.nextUrl.searchParams.get('fee_rate') ?? '1'))
  const doBroadcast = req.nextUrl.searchParams.get('broadcast') === 'true'
  const pool = getPool()

  // Load battle wallet credentials from DB
  const { rows: settingRows } = await pool.query(
    `SELECT setting_key, setting_value FROM global_settings WHERE setting_key IN ('battle_wallet_private_key', 'battle_wallet_address')`
  )
  const settings = Object.fromEntries(settingRows.map((r: { setting_key: string; setting_value: string }) => [r.setting_key, r.setting_value]))
  const privKeyHex = settings['battle_wallet_private_key']
  const battleAddr = settings['battle_wallet_address']

  if (!privKeyHex || !battleAddr) {
    return NextResponse.json(
      { error: 'Battle wallet not configured — add battle_wallet_private_key and battle_wallet_address to global_settings' },
      { status: 500 }
    )
  }

  // Find the oldest active matched battle where BOTH players have a signed PSBT.
  // q1.id < q1.opponent_queue_id deduplicates the pair (each pair appears once).
  const { rows } = await pool.query(`
    SELECT
      q1.id          AS q1_id,
      q1.player_id   AS p1_id,
      q1.fighter_data AS f1,
      q1.signed_psbt AS p1_psbt,
      q2.id          AS q2_id,
      q2.player_id   AS p2_id,
      q2.fighter_data AS f2,
      q2.signed_psbt AS p2_psbt,
      q1.joined_at   AS joined_at
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

  const p1In       = p1Psbt.txInputs[0]
  const p2In       = p2Psbt.txInputs[0]
  const p1Witness  = p1Psbt.data.inputs[0].witnessUtxo
  const p2Witness  = p2Psbt.data.inputs[0].witnessUtxo
  const p1TapKey        = p1Psbt.data.inputs[0].tapInternalKey
  const p2TapKey        = p2Psbt.data.inputs[0].tapInternalKey
  const p1FinalWitness  = p1Psbt.data.inputs[0].finalScriptWitness
  const p2FinalWitness  = p2Psbt.data.inputs[0].finalScriptWitness
  // Fallback: taproot with 65-byte sig (sighash byte) = 1+1+65 = 67 witness bytes
  const p1WitnessLen    = p1FinalWitness?.length ?? 67
  const p2WitnessLen    = p2FinalWitness?.length ?? 67
  const MINER_FEE       = calcFee(p1WitnessLen, p2WitnessLen, feeRate)

  if (!p1Witness || !p2Witness) {
    return NextResponse.json({ error: 'Player PSBTs missing witnessUtxo' }, { status: 400 })
  }

  const p1TxId  = Buffer.from(p1In.hash).reverse().toString('hex')
  const p2TxId  = Buffer.from(p2In.hash).reverse().toString('hex')
  const ord1Val = BigInt(p1Witness.value)
  const ord2Val = BigInt(p2Witness.value)

  // ── Determine winner ────────────────────────────────────────────────────────
  const winnerNum  = determineWinner(row.f1, row.f2)
  const winnerAddr = winnerNum === 1 ? row.p1_id : row.p2_id
  const winnerScript = bitcoin.address.toOutputScript(winnerAddr, bitcoin.networks.bitcoin)

  // ── Fetch our battle wallet UTXOs ───────────────────────────────────────────
  let walletUtxos: Array<{ txid: string; vout: number; status: { confirmed: boolean }; value: number }>
  try {
    walletUtxos = await fetchWalletUtxos(battleAddr)
  } catch (e) {
    return NextResponse.json({ error: `Failed to fetch battle wallet UTXOs: ${e}` }, { status: 500 })
  }

  const candidates = walletUtxos
    .filter(u => u.status?.confirmed && BigInt(u.value) >= BigInt(1000))
    .sort((a, b) => a.value - b.value)

  if (candidates.length < 2) {
    return NextResponse.json({
      error: `Battle wallet needs ≥2 confirmed UTXOs of at least 1000 sats each`,
      battle_wallet: battleAddr,
      utxos_found: walletUtxos,
    }, { status: 400 })
  }

  const [pad1, pad2] = candidates

  // ── Fetch padding UTXO scripts from mempool ─────────────────────────────────
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

  const MIN_PAD = WINNER_PAYOUT + MINER_FEE + BigInt(546)
  if (pad1Val < MIN_PAD) {
    return NextResponse.json({
      error: `Padding UTXO 1 is ${pad1Val} sats — need ≥ ${MIN_PAD} to cover winner payout + fee`,
    }, { status: 400 })
  }

  // ── Calculate output values ─────────────────────────────────────────────────
  // output 2 = pad1 contribution after paying winner payout + full miner fee
  const out2Val = pad1Val - WINNER_PAYOUT - MINER_FEE
  // output 4 = remaining ordinal sats (minus 1 sat burned each) + pad2
  const out4Val = (ord1Val - BURN_VALUE) + (ord2Val - BURN_VALUE) + pad2Val

  const ourScript = bitcoin.address.toOutputScript(battleAddr, bitcoin.networks.bitcoin)

  // ── Build combined PSBT ─────────────────────────────────────────────────────
  const psbt = new bitcoin.Psbt({ network: bitcoin.networks.bitcoin })

  // ── Inputs ──────────────────────────────────────────────────────────────────
  // Input 0: player 1 ordinal
  psbt.addInput({
    hash:        p1TxId,
    index:       p1In.index,
    sequence:    0xfffffffd,
    witnessUtxo: { script: Buffer.from(p1Witness.script), value: ord1Val },
  })

  // Input 1: our padding UTXO 1
  psbt.addInput({
    hash:        pad1.txid,
    index:       pad1.vout,
    sequence:    0xfffffffd,
    witnessUtxo: { script: pad1Out.script, value: pad1Val },
  })

  // Input 2: player 2 ordinal
  psbt.addInput({
    hash:        p2TxId,
    index:       p2In.index,
    sequence:    0xfffffffd,
    witnessUtxo: { script: Buffer.from(p2Witness.script), value: ord2Val },
  })

  // Input 3: our padding UTXO 2
  psbt.addInput({
    hash:        pad2.txid,
    index:       pad2.vout,
    sequence:    0xfffffffd,
    witnessUtxo: { script: pad2Out.script, value: pad2Val },
  })

  // ── Outputs ─────────────────────────────────────────────────────────────────
  // Burn script: OP_RETURN with "BATTLE" marker
  const burnScript = bitcoin.script.compile([
    bitcoin.opcodes.OP_RETURN,
    Buffer.from('BATTLE'),
  ])

  psbt.addOutput({ script: burnScript,   value: BURN_VALUE })    // 0: burn ordinal 1
  psbt.addOutput({ script: winnerScript, value: WINNER_PAYOUT }) // 1: winner payout
  psbt.addOutput({ script: ourScript,    value: out2Val })        // 2: our change from pad1
  psbt.addOutput({ script: burnScript,   value: BURN_VALUE })    // 3: burn ordinal 2
  psbt.addOutput({ script: ourScript,    value: out4Val })        // 4: remaining to our wallet

  // ── Player signatures (SIGHASH_NONE | ANYONECANPAY) ─────────────────────────
  // Wallets typically finalize the PSBT input after signing, storing the witness
  // in finalScriptWitness rather than tapKeySig. Since players signed with 0x82
  // (SIGHASH_NONE|ANYONECANPAY), which commits only to their specific input prevout,
  // the witness is valid in any transaction spending that UTXO. Copy it directly.
  // (p1FinalWitness / p2FinalWitness already extracted above for fee calculation)
  const p1TapKeySig = p1Psbt.data.inputs[0].tapKeySig
  const p2TapKeySig = p2Psbt.data.inputs[0].tapKeySig

  // ── Set tapInternalKey for our padding inputs only ──────────────────────────
  const signer = buildTaprootSigner(privKeyHex)
  psbt.updateInput(1, { tapInternalKey: signer.xOnly })
  psbt.updateInput(3, { tapInternalKey: signer.xOnly })

  // ── Inject player witnesses / tapKeySig and finalize ────────────────────────
  let p1FinalizeError: string | null = null
  let p2FinalizeError: string | null = null

  // Player 1 (input 0)
  if (p1FinalWitness) {
    // Wallet finalized the input — copy the witness directly
    psbt.data.inputs[0].finalScriptWitness = p1FinalWitness
  } else if (p1TapKeySig) {
    try {
      if (p1TapKey) psbt.updateInput(0, { tapInternalKey: p1TapKey })
      psbt.updateInput(0, { tapKeySig: p1TapKeySig })
      psbt.finalizeInput(0)
    } catch (e) { p1FinalizeError = String(e) }
  } else {
    p1FinalizeError = 'No signature found in player 1 PSBT'
  }

  // Player 2 (input 2)
  if (p2FinalWitness) {
    psbt.data.inputs[2].finalScriptWitness = p2FinalWitness
  } else if (p2TapKeySig) {
    try {
      if (p2TapKey) psbt.updateInput(2, { tapInternalKey: p2TapKey })
      psbt.updateInput(2, { tapKeySig: p2TapKeySig })
      psbt.finalizeInput(2)
    } catch (e) { p2FinalizeError = String(e) }
  } else {
    p2FinalizeError = 'No signature found in player 2 PSBT'
  }

  // ── Sign our padding inputs (1 and 3) ───────────────────────────────────────
  let serverSignError: string | null = null
  try {
    psbt.signInput(1, signer)
    psbt.signInput(3, signer)
    psbt.finalizeInput(1)
    psbt.finalizeInput(3)
  } catch (e) {
    serverSignError = String(e)
  }

  // ── Verification totals ─────────────────────────────────────────────────────
  const totalIn    = ord1Val + pad1Val + ord2Val + pad2Val
  const totalOut   = BURN_VALUE + WINNER_PAYOUT + out2Val + BURN_VALUE + out4Val
  const impliedFee = totalIn - totalOut

  const allSigned = !p1FinalizeError && !p2FinalizeError && !serverSignError

  // Extract final tx hex if fully signed
  let tx_hex: string | null = null
  if (allSigned) {
    try {
      tx_hex = psbt.extractTransaction().toHex()
    } catch {
      // Not all inputs finalized yet
    }
  }

  // ── Broadcast if requested ───────────────────────────────────────────────────
  let broadcast_txid: string | null = null
  let broadcast_error: string | null = null
  let broadcast_attempts: Record<string, string> | null = null
  if (doBroadcast && tx_hex) {
    const taalKey = process.env.TAAL_API_KEY ?? undefined
    const result = await broadcastTx(tx_hex, taalKey)
    broadcast_txid    = result.txid ?? null
    broadcast_error   = result.error ?? null
    broadcast_attempts = result.attempts
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
    inputs: {
      0: { desc: 'player1 ordinal',   txid: p1TxId,    vout: p1In.index,  value_sats: Number(ord1Val) },
      1: { desc: 'our padding utxo1', txid: pad1.txid, vout: pad1.vout,   value_sats: Number(pad1Val) },
      2: { desc: 'player2 ordinal',   txid: p2TxId,    vout: p2In.index,  value_sats: Number(ord2Val) },
      3: { desc: 'our padding utxo2', txid: pad2.txid, vout: pad2.vout,   value_sats: Number(pad2Val) },
    },
    outputs: {
      0: { desc: 'OP_RETURN burn (ordinal 1)',       value_sats: Number(BURN_VALUE) },
      1: { desc: `winner payout → ${winnerAddr}`,   value_sats: Number(WINNER_PAYOUT) },
      2: { desc: 'our change (pad1 - payout - fee)', value_sats: Number(out2Val), to: battleAddr },
      3: { desc: 'OP_RETURN burn (ordinal 2)',       value_sats: Number(BURN_VALUE) },
      4: { desc: 'our remaining (ord sats + pad2)',  value_sats: Number(out4Val), to: battleAddr },
    },
    totals: {
      total_in_sats:  Number(totalIn),
      total_out_sats: Number(totalOut),
      miner_fee_sats:  Number(impliedFee),
      fee_rate_per_vb: feeRate,
      est_vsize:       Math.ceil((((10 + (4 * 41) + (3 * 43) + (2 * 17)) * 4) + (2 + p1WitnessLen + 66 + p2WitnessLen + 66)) / 4),
    },
    signing: {
      input_0_player1: p1FinalizeError ?? (p1FinalWitness ? 'FINALIZED (witness copied)' : 'SIGNED + FINALIZED'),
      input_1_server:  serverSignError  ?? 'SIGNED + FINALIZED',
      input_2_player2: p2FinalizeError ?? (p2FinalWitness ? 'FINALIZED (witness copied)' : 'SIGNED + FINALIZED'),
      input_3_server:  serverSignError  ?? 'SIGNED + FINALIZED',
    },
    ready_to_broadcast: allSigned,
    broadcast_txid,
    broadcast_error,
    broadcast_attempts,
    tx_hex,
    psbt_base64: psbt.toBase64(),
  })
}
