import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Development helper: builds a Meta-shaped inbound payload, signs it the way
 * Meta would, and posts it to the local webhook. This is what the WhatsApp
 * round-trip e2e scenario drives when the Supabase stack is running.
 *
 * Refuses to run unless MOCK_WHATSAPP=1, so it can never exist in production.
 */
export async function POST(request: Request) {
  if (process.env.MOCK_WHATSAPP !== '1') {
    return NextResponse.json({ error: 'Disabled outside local development' }, { status: 404 });
  }

  const { from, body, messageId } = (await request.json()) as {
    from?: string;
    body?: string;
    messageId?: string;
  };
  if (!from || !body) return NextResponse.json({ error: 'from and body are required' }, { status: 422 });

  const payload = JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'local',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: { phone_number_id: process.env.WHATSAPP_PHONE_NUMBER_ID ?? 'local' },
              messages: [
                {
                  id: messageId ?? `wamid.local.${Date.now()}`,
                  from: from.replace(/^\+/, ''),
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  type: 'text',
                  text: { body },
                },
              ],
            },
          },
        ],
      },
    ],
  });

  const secret = process.env.WHATSAPP_APP_SECRET ?? 'local-dev-secret';
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload)));
  const signature = 'sha256=' + [...mac].map((b) => b.toString(16).padStart(2, '0')).join('');

  const webhookUrl =
    process.env.WHATSAPP_WEBHOOK_URL ?? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/whatsapp-webhook`;

  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-hub-signature-256': signature },
    body: payload,
  });

  return NextResponse.json({ status: res.status, body: await res.text() }, { status: res.ok ? 200 : 502 });
}
