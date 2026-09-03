/**
 * Ports the webhook handler depends on. The handler itself is pure logic over
 * these, which is what makes §10.3 testable without a database or Meta.
 */

export interface InboundMessage {
  waMessageId: string;
  from: string;
  type: string;
  text: string;
  mediaId: string | null;
  timestamp: Date;
}

export interface LinkedIdentity {
  businessId: string;
  userId: string;
  currency: string;
  locale: string;
  timezone: string;
}

export interface SavedEntry {
  id: string;
  amountMinor: string;
  type: 'expense' | 'income';
  categoryName: string | null;
  accountName: string;
  todayTotalMinor: string;
}

export interface EntryDraft {
  businessId: string;
  userId: string;
  type: 'expense' | 'income';
  amountMinor: string;
  note: string;
  partyName: string | null;
  accountKind: 'cash' | 'bank' | 'upi' | 'other' | null;
  categoryName: string | null;
  occurredAt: string | null;
  mediaId: string | null;
}

export interface PeriodSummary {
  incomeMinor: string;
  expenseMinor: string;
  netMinor: string;
  entryCount: number;
}

export interface WebhookDeps {
  /** True when this wa_message_id has already been handled (Meta retries). */
  hasProcessed(waMessageId: string): Promise<boolean>;
  /** Records the inbound message and its parse result for later parser work. */
  recordInbound(message: InboundMessage, parseResult: unknown, businessId: string | null): Promise<void>;
  /** Attaches the created entry to the logged inbound message. */
  attachEntry(waMessageId: string, entryId: string): Promise<void>;
  findLink(phoneE164: string): Promise<LinkedIdentity | null>;
  /** Consumes a 6-character link code; null when unknown, expired or used. */
  consumeLinkCode(code: string, phoneE164: string): Promise<LinkedIdentity | null>;
  saveEntry(draft: EntryDraft): Promise<SavedEntry>;
  /** Soft-deletes the sender's most recent WhatsApp entry inside the window. */
  undoLastEntry(identity: LinkedIdentity, withinMs: number): Promise<{ amountMinor: string } | null>;
  summary(identity: LinkedIdentity, period: 'today' | 'month'): Promise<PeriodSummary>;
  /** Exactly one call per inbound message, ever. */
  sendReply(toPhoneE164: string, body: string, businessId: string | null): Promise<void>;
}
