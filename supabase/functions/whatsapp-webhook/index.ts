import { verifySignature } from '../_shared/signature.ts';
import { createDeps, serviceClient } from './deps.ts';
import { extractMessages, handleMessage } from './handler.ts';

/**
 * Meta WhatsApp Cloud API webhook.
 *
 * GET  — the one-time verification handshake.
 * POST — signed message deliveries. Must answer 200 inside 2 seconds and be
 *        idempotent on wa_message_id, because Meta retries (§4.5).
 */
Deno.serve(async (req) => {
  const url = new URL(req.url);

  if (req.method === 'GET') {
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge') ?? '';
    if (mode === 'subscribe' && token && token === Deno.env.get('WHATSAPP_VERIFY_TOKEN')) {
      return new Response(challenge, { status: 200 });
    }
    return new Response('forbidden', { status: 403 });
  }

  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });

  const raw = await req.text();
  const ok = await verifySignature(
    raw,
    req.headers.get('x-hub-signature-256'),
    Deno.env.get('WHATSAPP_APP_SECRET') ?? '',
  );
  if (!ok) return new Response('invalid signature', { status: 403 });

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new Response('bad json', { status: 400 });
  }

  const messages = extractMessages(payload);
  if (messages.length === 0) return new Response('ok', { status: 200 });

  const deps = createDeps(serviceClient());
  for (const message of messages) {
    try {
      await handleMessage(message, deps);
    } catch (err) {
      // Never 500 back to Meta: that triggers a retry storm. Log and move on.
      console.error('handleMessage failed', message.waMessageId, err);
    }
  }

  return new Response('ok', { status: 200 });
});
