import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Keepalive target (§2). The GitHub Actions cron hits this every 3 days so the
 * free Supabase project never reaches 7 days of inactivity and pauses.
 */
export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return NextResponse.json({ ok: true, database: 'not-configured', at: new Date().toISOString() });
  }

  try {
    const res = await fetch(`${url}/rest/v1/rpc/fn_ping`, {
      method: 'POST',
      headers: { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: '{}',
      cache: 'no-store',
    });
    return NextResponse.json({ ok: res.ok, database: res.ok ? 'awake' : `error-${res.status}`, at: new Date().toISOString() });
  } catch {
    return NextResponse.json({ ok: false, database: 'unreachable', at: new Date().toISOString() }, { status: 503 });
  }
}
