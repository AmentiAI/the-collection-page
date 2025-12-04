import { NextRequest, NextResponse } from "next/server";

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const { txBase64 }: { txBase64: string } = await request.json();

    if (!txBase64) {
      return NextResponse.json({ error: "No transaction provided" }, { status: 400 });
    }

    const SANDSHREW_API_URL = process.env.SANDSHREW_URL || 'https://mainnet.sandshrew.io/v2'
    const SANDSHREW_DEVELOPER_KEY = process.env.SANDSHREW_DEVELOPER_KEY

    if (!SANDSHREW_DEVELOPER_KEY) {
      throw new Error('SANDSHREW_DEVELOPER_KEY not configured')
    }

    const endpoint = `${SANDSHREW_API_URL.replace(/\/+$/, '')}/${SANDSHREW_DEVELOPER_KEY.trim()}`

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: `finalize-${Date.now()}`,
        method: 'finalizepsbt',
        params: [txBase64],
      }),
      cache: 'no-store',
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(text || `Sandshrew finalize failed (${response.status})`)
    }

    const payload = await response.json().catch(() => ({}))
    const finalized = payload?.result

    if (!finalized?.complete) {
      return NextResponse.json({ error: "Transaction is not finalized" }, { status: 400 });
    }

    return NextResponse.json(finalized);
  } catch (e) {
    console.error('[finalize] Error:', e);
    if (e instanceof Error) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Error occurred" }, { status: 500 });
  }
}