import { parseMessage } from '@khata/parser';
import { businessNow, formatMinor, plainDateToInstant } from '../_shared/format.ts';
import type { InboundMessage, LinkedIdentity, WebhookDeps } from './types.ts';

/** §4.5: the `undo` command reaches back ten minutes. */
export const UNDO_WINDOW_MS = 10 * 60_000;

const UNPARSED_HELP =
  'Could not read that. Send like: 450 tea shop  (or: got 5000 from ramesh)';
const NOT_LINKED =
  'This number is not linked to a business. Open Khata > Settings > WhatsApp and send the 6-character code shown there.';

export interface HandleResult {
  status: number;
  /** The single outbound message, or null when the message needed no reply. */
  reply: string | null;
  entryId?: string;
  /** True when the request was a Meta retry of an already-handled message. */
  duplicate?: boolean;
}

function normalisePhone(from: string): string {
  return from.startsWith('+') ? from : `+${from}`;
}

/**
 * Handles one inbound WhatsApp message.
 *
 * Contract, from §4.5 and §13: **exactly one** outbound message per inbound
 * message — no greeting, no menu, no second confirmation — and nothing at all
 * for a duplicate delivery.
 */
export async function handleMessage(message: InboundMessage, deps: WebhookDeps): Promise<HandleResult> {
  const phone = normalisePhone(message.from);

  if (await deps.hasProcessed(message.waMessageId)) {
    return { status: 200, reply: null, duplicate: true };
  }

  let identity: LinkedIdentity | null = await deps.findLink(phone);
  const body = message.text.trim();

  // --- linking ---------------------------------------------------------------
  if (!identity) {
    const code = body.toUpperCase();
    if (/^[A-Z0-9]{6}$/.test(code)) {
      const linked = await deps.consumeLinkCode(code, phone);
      await deps.recordInbound(message, { kind: 'link', code, ok: Boolean(linked) }, linked?.businessId ?? null);
      const reply = linked
        ? 'Linked. Send an entry like: 450 tea shop'
        : 'That code is not valid or has expired. Open Settings > WhatsApp for a new one.';
      await deps.sendReply(phone, reply, linked?.businessId ?? null);
      return { status: 200, reply };
    }
    await deps.recordInbound(message, { kind: 'unlinked' }, null);
    await deps.sendReply(phone, NOT_LINKED, null);
    return { status: 200, reply: NOT_LINKED };
  }

  // Relative dates ('yesterday') must resolve in the shop's timezone, not the runtime's.
  const parsed = parseMessage(body, { now: businessNow(message.timestamp, identity.timezone) });
  await deps.recordInbound(message, parsed, identity.businessId);

  // --- commands --------------------------------------------------------------
  if (parsed.kind === 'command') {
    if (parsed.command === 'undo') {
      const undone = await deps.undoLastEntry(identity, UNDO_WINDOW_MS);
      const reply = undone
        ? `Removed ${formatMinor(undone.amountMinor, identity.currency, identity.locale)}.`
        : 'Nothing to undo from the last 10 minutes.';
      await deps.sendReply(phone, reply, identity.businessId);
      return { status: 200, reply };
    }

    const period = parsed.command;
    const s = await deps.summary(identity, period);
    const label = period === 'today' ? 'Today' : 'This month';
    const reply = [
      `${label}: ${s.entryCount} entries`,
      `In ${formatMinor(s.incomeMinor, identity.currency, identity.locale)} / Out ${formatMinor(s.expenseMinor, identity.currency, identity.locale)}`,
      `Net ${formatMinor(s.netMinor, identity.currency, identity.locale)}`,
    ].join('\n');
    await deps.sendReply(phone, reply, identity.businessId);
    return { status: 200, reply };
  }

  // --- unparsed --------------------------------------------------------------
  if (parsed.kind === 'unparsed') {
    // A photo with no usable caption is still worth one reply, not two.
    await deps.sendReply(phone, UNPARSED_HELP, identity.businessId);
    return { status: 200, reply: UNPARSED_HELP };
  }

  // --- entry -----------------------------------------------------------------
  const saved = await deps.saveEntry({
    businessId: identity.businessId,
    userId: identity.userId,
    type: parsed.type,
    amountMinor: parsed.amountMinor,
    note: parsed.note,
    partyName: parsed.party,
    accountKind: parsed.account,
    categoryName: parsed.category,
    occurredAt: parsed.date ? plainDateToInstant(parsed.date, identity.timezone) : null,
    mediaId: message.mediaId,
  });
  await deps.attachEntry(message.waMessageId, saved.id);

  const amount = formatMinor(saved.amountMinor, identity.currency, identity.locale);
  const total = formatMinor(saved.todayTotalMinor, identity.currency, identity.locale);
  const parts = [saved.type, saved.categoryName, saved.accountName].filter(Boolean).join(', ');
  const reply = `Saved: ${amount} ${parts}. Today's total ${total}. Reply "undo" within 10 minutes to remove.`;

  await deps.sendReply(phone, reply, identity.businessId);
  return { status: 200, reply, entryId: saved.id };
}

/** Extracts the messages we act on; statuses and reactions are ignored. */
export function extractMessages(payload: unknown): InboundMessage[] {
  const out: InboundMessage[] = [];
  const entries = (payload as { entry?: unknown[] } | null)?.entry;
  if (!Array.isArray(entries)) return out;

  for (const entry of entries) {
    const changes = (entry as { changes?: unknown[] }).changes;
    if (!Array.isArray(changes)) continue;
    for (const change of changes) {
      const value = (change as { value?: Record<string, unknown> }).value;
      const messages = value?.messages;
      if (!Array.isArray(messages)) continue;
      for (const m of messages as Array<Record<string, any>>) {
        if (typeof m?.id !== 'string' || typeof m?.from !== 'string') continue;
        const text =
          typeof m.text?.body === 'string'
            ? m.text.body
            : typeof m.image?.caption === 'string'
              ? m.image.caption
              : '';
        const seconds = Number(m.timestamp);
        out.push({
          waMessageId: m.id,
          from: m.from,
          type: typeof m.type === 'string' ? m.type : 'unknown',
          text,
          mediaId: typeof m.image?.id === 'string' ? m.image.id : null,
          timestamp: Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000) : new Date(),
        });
      }
    }
  }
  return out;
}
