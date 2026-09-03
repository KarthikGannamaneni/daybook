import { createClient } from '@supabase/supabase-js';

/**
 * Outbound-only helper, used by P1 reminders and by operators re-sending a
 * confirmation. Every send is logged to whatsapp_messages first, so the cost
 * ceiling from §13 stays auditable: one outbound per inbound entry.
 *
 * With MOCK_WHATSAPP=1 nothing leaves the machine; the row is still written.
 */
const GRAPH_VERSION = 'v21.0';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });

  const secret = req.headers.get('x-khata-secret');
  if (!secret || secret !== Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')) {
    return new Response('forbidden', { status: 403 });
  }

  let body: { to?: string; message?: string; business_id?: string | null };
  try {
    body = await req.json();
  } catch {
    return new Response('bad json', { status: 400 });
  }

  const to = body.to?.trim();
  const message = body.message?.trim();
  if (!to || !/^\+[1-9]\d{7,14}$/.test(to) || !message) {
    return new Response(JSON.stringify({ error: 'to (E.164) and message are required' }), {
      status: 422,
      headers: { 'content-type': 'application/json' },
    });
  }

  const db = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
    auth: { persistSession: false },
  });
  await db.from('whatsapp_messages').insert({
    business_id: body.business_id ?? null,
    phone_e164: to,
    direction: 'out',
    body: message,
  });

  if (Deno.env.get('MOCK_WHATSAPP') === '1') {
    return new Response(JSON.stringify({ mocked: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }

  const res = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/${Deno.env.get('WHATSAPP_PHONE_NUMBER_ID')}/messages`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${Deno.env.get('WHATSAPP_ACCESS_TOKEN')}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body: message } }),
    },
  );

  return new Response(await res.text(), {
    status: res.ok ? 200 : 502,
    headers: { 'content-type': 'application/json' },
  });
});
