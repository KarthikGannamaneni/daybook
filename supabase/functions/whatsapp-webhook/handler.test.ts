import { assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';
import { extractMessages, handleMessage } from './handler.ts';
import { signBody, verifySignature } from '../_shared/signature.ts';
import type { InboundMessage, LinkedIdentity, WebhookDeps } from './types.ts';

const IDENTITY: LinkedIdentity = {
  businessId: 'biz-1',
  userId: 'user-1',
  currency: 'INR',
  locale: 'en-IN',
  timezone: 'Asia/Kolkata',
};

interface Recorder extends WebhookDeps {
  replies: Array<{ to: string; body: string }>;
  entries: unknown[];
  processed: Set<string>;
  inbound: unknown[];
}

function makeDeps(overrides: Partial<WebhookDeps> & { linked?: boolean } = {}): Recorder {
  const replies: Array<{ to: string; body: string }> = [];
  const entries: unknown[] = [];
  const processed = new Set<string>();
  const inbound: unknown[] = [];
  const linked = overrides.linked ?? true;

  const base: WebhookDeps = {
    hasProcessed: (id) => Promise.resolve(processed.has(id)),
    recordInbound: (m, parseResult) => {
      processed.add(m.waMessageId);
      inbound.push(parseResult);
      return Promise.resolve();
    },
    attachEntry: () => Promise.resolve(),
    findLink: () => Promise.resolve(linked ? IDENTITY : null),
    consumeLinkCode: (code) => Promise.resolve(code === 'ABC123' ? IDENTITY : null),
    saveEntry: (draft) => {
      entries.push(draft);
      return Promise.resolve({
        id: `entry-${entries.length}`,
        amountMinor: draft.amountMinor,
        type: draft.type,
        categoryName: draft.categoryName,
        accountName: draft.accountKind === 'bank' ? 'Bank' : 'Cash',
        todayTotalMinor: '123000',
      });
    },
    undoLastEntry: () => Promise.resolve({ amountMinor: '45000' }),
    summary: () =>
      Promise.resolve({ incomeMinor: '500000', expenseMinor: '123000', netMinor: '377000', entryCount: 7 }),
    sendReply: (to, body) => {
      replies.push({ to, body });
      return Promise.resolve();
    },
  };

  const { linked: _ignored, ...rest } = overrides;
  return Object.assign(base, rest, { replies, entries, processed, inbound }) as Recorder;
}

function inbound(text: string, id = 'wamid.1'): InboundMessage {
  return {
    waMessageId: id,
    from: '919999900001',
    type: 'text',
    text,
    mediaId: null,
    timestamp: new Date('2026-09-02T05:00:00Z'),
  };
}

Deno.test('signature: a valid Meta signature passes', async () => {
  const body = '{"object":"whatsapp_business_account"}';
  const header = await signBody(body, 's3cret');
  assertEquals(await verifySignature(body, header, 's3cret'), true);
});

Deno.test('signature: a bad or missing signature is rejected', async () => {
  const body = '{"object":"whatsapp_business_account"}';
  assertEquals(await verifySignature(body, 'sha256=deadbeef', 's3cret'), false);
  assertEquals(await verifySignature(body, null, 's3cret'), false);
  assertEquals(await verifySignature(body, 'md5=abc', 's3cret'), false);
  assertEquals(await verifySignature(body, 'sha256=zzzz', 's3cret'), false);
  assertEquals(await verifySignature(body, await signBody(body, 'other'), 's3cret'), false);
  assertEquals(await verifySignature(body, await signBody(body, 's3cret'), ''), false);
});

Deno.test('a linked sender saving an expense gets exactly one confirmation', async () => {
  const deps = makeDeps();
  const result = await handleMessage(inbound('450 tea shop'), deps);

  assertEquals(result.status, 200);
  assertEquals(deps.entries.length, 1);
  assertEquals(deps.replies.length, 1);
  assertStringIncludes(deps.replies[0].body, 'Saved:');
  assertStringIncludes(deps.replies[0].body, '450');
  assertStringIncludes(deps.replies[0].body, 'Food & Tea');
  assertStringIncludes(deps.replies[0].body, 'undo');
});

Deno.test('the same wa_message_id twice creates one entry and one reply', async () => {
  const deps = makeDeps();
  const message = inbound('450 tea shop', 'wamid.retry');
  await handleMessage(message, deps);
  const second = await handleMessage(message, deps);

  assertEquals(second.duplicate, true);
  assertEquals(second.reply, null);
  assertEquals(deps.entries.length, 1);
  assertEquals(deps.replies.length, 1);
});

Deno.test('an unlinked number gets one "not linked" reply and no entry', async () => {
  const deps = makeDeps({ linked: false });
  await handleMessage(inbound('450 tea shop'), deps);

  assertEquals(deps.entries.length, 0);
  assertEquals(deps.replies.length, 1);
  assertStringIncludes(deps.replies[0].body, 'not linked');
});

Deno.test('link code flow: a valid code links, an expired one does not', async () => {
  const good = makeDeps({ linked: false });
  await handleMessage(inbound('abc123'), good);
  assertEquals(good.replies.length, 1);
  assertStringIncludes(good.replies[0].body, 'Linked');

  const bad = makeDeps({ linked: false });
  await handleMessage(inbound('ZZZ999'), bad);
  assertEquals(bad.replies.length, 1);
  assertStringIncludes(bad.replies[0].body, 'expired');
  assertEquals(bad.entries.length, 0);
});

Deno.test('an unparsable message gets one example, not an entry', async () => {
  const deps = makeDeps();
  await handleMessage(inbound('😀😀'), deps);

  assertEquals(deps.entries.length, 0);
  assertEquals(deps.replies.length, 1);
  assertStringIncludes(deps.replies[0].body, '450 tea shop');
});

Deno.test('undo removes the last WhatsApp entry inside the window', async () => {
  const deps = makeDeps();
  await handleMessage(inbound('undo'), deps);
  assertEquals(deps.replies.length, 1);
  assertStringIncludes(deps.replies[0].body, 'Removed');

  const empty = makeDeps({ undoLastEntry: () => Promise.resolve(null) });
  await handleMessage(inbound('undo', 'wamid.2'), empty);
  assertStringIncludes(empty.replies[0].body, 'Nothing to undo');
});

Deno.test('today and month return a three-line summary', async () => {
  for (const command of ['today', 'month']) {
    const deps = makeDeps();
    await handleMessage(inbound(command, `wamid.${command}`), deps);
    assertEquals(deps.replies.length, 1);
    assertEquals(deps.replies[0].body.split('\n').length, 3);
  }
});

Deno.test('income, account override and date override reach the draft', async () => {
  const deps = makeDeps();
  await handleMessage(inbound('got 5000 from ramesh bank yesterday'), deps);
  const draft = deps.entries[0] as Record<string, unknown>;

  assertEquals(draft.type, 'income');
  assertEquals(draft.amountMinor, '500000');
  assertEquals(draft.partyName, 'Ramesh');
  assertEquals(draft.accountKind, 'bank');
  assertStringIncludes(String(draft.occurredAt), '2026-09-01');
});

Deno.test('a photo caption is parsed and the media id is carried through', async () => {
  const deps = makeDeps();
  await handleMessage(
    { ...inbound('450 tea shop'), type: 'image', mediaId: 'media-99' },
    deps,
  );
  const draft = deps.entries[0] as Record<string, unknown>;
  assertEquals(draft.mediaId, 'media-99');
  assertEquals(deps.replies.length, 1);
});

Deno.test('every inbound message is logged with its parse result', async () => {
  const deps = makeDeps();
  await handleMessage(inbound('450 tea shop'), deps);
  assertEquals((deps.inbound[0] as Record<string, unknown>).kind, 'entry');
});

Deno.test('extractMessages reads text, captions and ignores status callbacks', () => {
  const payload = {
    object: 'whatsapp_business_account',
    entry: [
      {
        changes: [
          {
            value: {
              messages: [
                { id: 'm1', from: '919999900001', type: 'text', timestamp: '1756789200', text: { body: '450 tea' } },
                { id: 'm2', from: '919999900001', type: 'image', image: { id: 'mid', caption: '900 stock' } },
              ],
            },
          },
          { value: { statuses: [{ id: 's1', status: 'delivered' }] } },
        ],
      },
    ],
  };

  const messages = extractMessages(payload);
  assertEquals(messages.length, 2);
  assertEquals(messages[0].text, '450 tea');
  assertEquals(messages[1].text, '900 stock');
  assertEquals(messages[1].mediaId, 'mid');
});

Deno.test('extractMessages tolerates junk payloads', () => {
  assertEquals(extractMessages(null).length, 0);
  assertEquals(extractMessages({}).length, 0);
  assertEquals(extractMessages({ entry: 'nope' }).length, 0);
  assertEquals(extractMessages({ entry: [{}] }).length, 0);
  assertEquals(extractMessages({ entry: [{ changes: [{ value: {} }] }] }).length, 0);
  assertEquals(extractMessages({ entry: [{ changes: [{ value: { messages: [{ id: 1 }] } }] }] }).length, 0);
});
