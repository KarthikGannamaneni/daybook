import { parseMessage } from '@khata/parser';
import {
  LINK_CODE_TTL_MS,
  WHATSAPP_UNDO_WINDOW_MS,
  normaliseTokens,
  predictCategory,
  type CategoryTotal,
  type Entry,
  type EntryView,
  type Party,
  type PredictionRow,
  type QuickChip,
  type Role,
  type UserSettings,
} from '@khata/shared';
import { maskPhone } from './phone.ts';
import {
  DEMO_STORAGE_KEY,
  loadState,
  newId,
  saveState,
  seedDefaults,
  type DemoState,
} from './demo-store.ts';
import type {
  Bootstrap,
  BusinessSummary,
  CreateEntryInput,
  DayTotals,
  EntryFilter,
  LedgerRepo,
  LinkCode,
  Session,
  UpdateEntryInput,
  WhatsappLinkView,
} from './types.ts';

/**
 * Demo-mode repository: the whole product against a browser-local dataset.
 *
 * Every rule the database enforces in production is re-implemented here
 * (role checks, the staff 7-day window, soft deletes, client_id idempotency),
 * so what you exercise locally is the same behaviour, not a thinner one.
 */

const listeners = new Set<() => void>();

function notify(): void {
  for (const l of listeners) l();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('khata:demo-change'));
  }
}

function dayKey(isoString: string, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(isoString));
}

export class DemoRepo implements LedgerRepo {
  readonly mode = 'demo' as const;

  private read(): DemoState {
    return loadState();
  }

  private write(state: DemoState): void {
    saveState(state);
    notify();
  }

  private requireUser(state: DemoState): string {
    if (!state.currentUserId) throw new Error('Not signed in');
    return state.currentUserId;
  }

  private roleFor(state: DemoState, businessId: string, userId: string): Role | null {
    return state.members.find((m) => m.business_id === businessId && m.user_id === userId)?.role ?? null;
  }

  private toView(state: DemoState, entry: Entry): EntryView {
    return {
      ...entry,
      account_name: state.accounts.find((a) => a.id === entry.account_id)?.name ?? '',
      category_name: state.categories.find((c) => c.id === entry.category_id)?.name ?? null,
      party_name: state.parties.find((p) => p.id === entry.party_id)?.name ?? null,
    };
  }

  // --- auth -----------------------------------------------------------------

  async getSession(): Promise<Session | null> {
    const state = this.read();
    const user = state.users.find((u) => u.id === state.currentUserId);
    if (!user) return null;
    return { userId: user.id, phone: user.phone, email: user.email, displayName: user.name };
  }

  async requestOtp(): Promise<void> {
    // Demo mode always accepts 123456, mirroring the Supabase local test OTP.
  }

  async verifyOtp(input: { phone?: string; email?: string; token: string }): Promise<Session> {
    if (input.token !== '123456') throw new Error('That code is not right. Use 123456 in demo mode.');
    const state = this.read();
    const phone = input.phone ?? null;
    const email = input.email ?? null;

    let user = state.users.find((u) => (phone && u.phone === phone) || (email && u.email === email));
    if (!user) {
      user = { id: newId(), phone, email, name: null };
      state.users.push(user);
    }
    state.currentUserId = user.id;
    this.write(state);
    return { userId: user.id, phone: user.phone, email: user.email, displayName: user.name };
  }

  async signOut(): Promise<void> {
    const state = this.read();
    state.currentUserId = null;
    this.write(state);
  }

  // --- businesses -----------------------------------------------------------

  async listBusinesses(): Promise<BusinessSummary[]> {
    const state = this.read();
    const userId = state.currentUserId;
    if (!userId) return [];
    return state.members
      .filter((m) => m.user_id === userId)
      .map((m) => ({
        id: m.business_id,
        name: state.businesses.find((b) => b.id === m.business_id)?.name ?? '',
        role: m.role,
      }));
  }

  async createBusiness(input: {
    name: string;
    currency: string;
    locale: string;
    timezone: string;
    startingBalanceMinor: string;
  }): Promise<string> {
    const state = this.read();
    const userId = this.requireUser(state);
    const id = newId();
    state.businesses.push({
      id,
      name: input.name,
      currency: input.currency,
      locale: input.locale,
      timezone: input.timezone,
      starting_balance_minor: input.startingBalanceMinor,
      owner_id: userId,
      created_at: new Date().toISOString(),
    });
    state.members.push({
      id: newId(),
      business_id: id,
      user_id: userId,
      role: 'owner',
      created_at: new Date().toISOString(),
    });
    seedDefaults(state, id);
    const settings = state.settings.find((s) => s.user_id === userId);
    if (settings) settings.default_business_id = settings.default_business_id ?? id;
    else state.settings.push({ user_id: userId, pin_hash: null, app_lock_enabled: false, default_business_id: id });
    this.write(state);
    return id;
  }

  async getBootstrap(businessId: string): Promise<Bootstrap> {
    const state = this.read();
    const userId = this.requireUser(state);
    const business = state.businesses.find((b) => b.id === businessId);
    const role = this.roleFor(state, businessId, userId);
    if (!business || !role) throw new Error('Business not found');

    const accounts = state.accounts
      .filter((a) => a.business_id === businessId && !a.is_archived)
      .sort((a, b) => a.sort_order - b.sort_order);
    const categories = state.categories
      .filter((c) => c.business_id === businessId && !c.is_archived)
      .sort((a, b) => a.sort_order - b.sort_order);

    // Most-used account over 14 days, else the first one (§4.3).
    const since = Date.now() - 14 * 86400000;
    const counts = new Map<string, number>();
    for (const e of state.entries) {
      if (e.business_id !== businessId || e.deleted_at) continue;
      if (new Date(e.occurred_at).getTime() < since) continue;
      counts.set(e.account_id, (counts.get(e.account_id) ?? 0) + 1);
    }
    const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];

    return {
      business,
      role,
      accounts,
      categories,
      defaultAccountId: ranked ?? accounts[0]?.id ?? '',
    };
  }

  // --- entries --------------------------------------------------------------

  async listEntries(businessId: string, filter: EntryFilter = {}): Promise<EntryView[]> {
    const state = this.read();
    const rows = state.entries
      .filter((e) => e.business_id === businessId && !e.deleted_at)
      .filter((e) => (filter.from ? e.occurred_at >= filter.from : true))
      .filter((e) => (filter.to ? e.occurred_at <= filter.to : true))
      .filter((e) => (filter.categoryId ? e.category_id === filter.categoryId : true))
      .filter((e) => (filter.partyId ? e.party_id === filter.partyId : true))
      .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
    const limited = filter.limit ? rows.slice(0, filter.limit) : rows;
    return limited.map((e) => this.toView(state, e));
  }

  private totalsFor(entries: Entry[]): DayTotals {
    let income = 0n;
    let expense = 0n;
    for (const e of entries) {
      if (e.type === 'income') income += BigInt(e.amount_minor);
      else expense += BigInt(e.amount_minor);
    }
    return {
      incomeMinor: income.toString(),
      expenseMinor: expense.toString(),
      netMinor: (income - expense).toString(),
      entryCount: entries.length,
    };
  }

  async getDayTotals(businessId: string, dayIso: string): Promise<DayTotals> {
    const state = this.read();
    const tz = state.businesses.find((b) => b.id === businessId)?.timezone ?? 'Asia/Kolkata';
    const rows = state.entries.filter(
      (e) => e.business_id === businessId && !e.deleted_at && dayKey(e.occurred_at, tz) === dayIso,
    );
    return this.totalsFor(rows);
  }

  private monthRows(state: DemoState, businessId: string, monthIso: string): Entry[] {
    const tz = state.businesses.find((b) => b.id === businessId)?.timezone ?? 'Asia/Kolkata';
    const prefix = monthIso.slice(0, 7);
    return state.entries.filter(
      (e) => e.business_id === businessId && !e.deleted_at && dayKey(e.occurred_at, tz).startsWith(prefix),
    );
  }

  async getMonthSummary(businessId: string, monthIso: string): Promise<DayTotals> {
    return this.totalsFor(this.monthRows(this.read(), businessId, monthIso));
  }

  async getMonthCategoryTotals(businessId: string, monthIso: string): Promise<CategoryTotal[]> {
    const state = this.read();
    const rows = this.monthRows(state, businessId, monthIso);
    const map = new Map<string, CategoryTotal>();
    for (const e of rows) {
      const key = `${e.category_id ?? 'none'}:${e.type}`;
      const existing = map.get(key);
      if (existing) {
        existing.total_minor = (BigInt(existing.total_minor) + BigInt(e.amount_minor)).toString();
        existing.entry_count += 1;
      } else {
        map.set(key, {
          category_id: e.category_id,
          category_name: state.categories.find((c) => c.id === e.category_id)?.name ?? 'Uncategorised',
          type: e.type,
          total_minor: e.amount_minor,
          entry_count: 1,
        });
      }
    }
    return [...map.values()].sort((a, b) => Number(BigInt(b.total_minor) - BigInt(a.total_minor)));
  }

  async getQuickChips(businessId: string): Promise<QuickChip[]> {
    const state = this.read();
    const since = Date.now() - 30 * 86400000;
    const map = new Map<string, QuickChip>();
    for (const e of state.entries) {
      if (e.business_id !== businessId || e.deleted_at || e.type !== 'expense') continue;
      if (new Date(e.occurred_at).getTime() < since) continue;
      const key = `${e.category_id}:${e.party_id}:${e.amount_minor}`;
      const existing = map.get(key);
      if (existing) existing.uses += 1;
      else
        map.set(key, {
          category_id: e.category_id,
          category_name: state.categories.find((c) => c.id === e.category_id)?.name ?? null,
          party_id: e.party_id,
          party_name: state.parties.find((p) => p.id === e.party_id)?.name ?? null,
          amount_minor: e.amount_minor,
          account_id: e.account_id,
          note: e.note,
          uses: 1,
        });
    }
    return [...map.values()].filter((c) => c.uses >= 2).sort((a, b) => b.uses - a.uses).slice(0, 6);
  }

  async predictCategory(businessId: string, note: string, partyId: string | null): Promise<string | null> {
    const state = this.read();
    const since = Date.now() - 90 * 86400000;
    const rows: PredictionRow[] = [];
    for (const e of state.entries) {
      if (e.business_id !== businessId || e.deleted_at || !e.category_id) continue;
      if (new Date(e.occurred_at).getTime() < since) continue;
      for (const token of normaliseTokens(e.note)) {
        rows.push({ categoryId: e.category_id, noteToken: token, partyId: null, hits: 1 });
      }
      if (e.party_id) rows.push({ categoryId: e.category_id, noteToken: null, partyId: e.party_id, hits: 1 });
    }
    return predictCategory(rows, { note, partyId });
  }

  private upsertParty(state: DemoState, businessId: string, name: string | null): string | null {
    if (!name || !name.trim()) return null;
    const normalised = name.trim().toLowerCase();
    const existing = state.parties.find((p) => p.business_id === businessId && p.normalised_name === normalised);
    if (existing) return existing.id;
    const party: Party = {
      id: newId(),
      business_id: businessId,
      name: name.trim(),
      normalised_name: normalised,
      gstin: null,
    };
    state.parties.push(party);
    return party.id;
  }

  async createEntry(input: CreateEntryInput): Promise<EntryView> {
    const state = this.read();
    const userId = this.requireUser(state);
    const role = this.roleFor(state, input.businessId, userId);
    if (role !== 'owner' && role !== 'staff') throw new Error('Not allowed to add entries');

    // client_id is the idempotency key: a retried offline create is a no-op.
    const existing = state.entries.find((e) => e.client_id === input.clientId);
    if (existing) return this.toView(state, existing);

    let attachmentPath: string | null = null;
    if (input.attachment) {
      attachmentPath = `${input.businessId}/${input.clientId}.jpg`;
      state.attachments[attachmentPath] = String(input.attachment.size);
    }

    const entry: Entry = {
      id: newId(),
      business_id: input.businessId,
      type: input.type,
      amount_minor: input.amountMinor,
      account_id: input.accountId,
      category_id: input.categoryId,
      party_id: this.upsertParty(state, input.businessId, input.partyName),
      note: input.note,
      occurred_at: input.occurredAt,
      attachment_path: attachmentPath,
      source: input.source ?? 'app',
      created_by: userId,
      client_id: input.clientId,
      deleted_at: null,
      created_at: new Date().toISOString(),
      updated_at: null,
    };
    state.entries.push(entry);
    this.write(state);
    return this.toView(state, entry);
  }

  private assertCanMutate(state: DemoState, entry: Entry, userId: string): void {
    const role = this.roleFor(state, entry.business_id, userId);
    if (role === 'owner') return;
    if (role !== 'staff') throw new Error('Not allowed');
    if (entry.created_by !== userId) throw new Error('Staff can only change their own entries');
    if (new Date(entry.occurred_at).getTime() < Date.now() - 7 * 86400000) {
      throw new Error('Staff can only change entries from the last 7 days');
    }
  }

  async updateEntry(input: UpdateEntryInput): Promise<EntryView> {
    const state = this.read();
    const userId = this.requireUser(state);
    const entry = state.entries.find((e) => e.id === input.id);
    if (!entry) throw new Error('Entry not found');
    this.assertCanMutate(state, entry, userId);

    if (input.amountMinor !== undefined) entry.amount_minor = input.amountMinor;
    if (input.accountId !== undefined) entry.account_id = input.accountId;
    if (input.categoryId !== undefined) entry.category_id = input.categoryId;
    if (input.note !== undefined) entry.note = input.note;
    if (input.occurredAt !== undefined) entry.occurred_at = input.occurredAt;
    if (input.type !== undefined) entry.type = input.type;
    if (input.partyName !== undefined) entry.party_id = this.upsertParty(state, entry.business_id, input.partyName);
    entry.updated_at = new Date().toISOString();

    this.write(state);
    return this.toView(state, entry);
  }

  async setEntryDeleted(id: string, deleted: boolean): Promise<void> {
    const state = this.read();
    const userId = this.requireUser(state);
    const entry = state.entries.find((e) => e.id === id);
    if (!entry) return;
    this.assertCanMutate(state, entry, userId);
    entry.deleted_at = deleted ? new Date().toISOString() : null;
    this.write(state);
  }

  async searchEntries(businessId: string, query: string): Promise<EntryView[]> {
    const state = this.read();
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const numeric = q.replace(/[,₹\s]/g, '');
    const amountMatch = /^\d+(\.\d+)?$/.test(numeric)
      ? BigInt(Math.round(Number(numeric) * 100)).toString()
      : null;

    return state.entries
      .filter((e) => e.business_id === businessId && !e.deleted_at)
      .filter((e) => {
        const party = state.parties.find((p) => p.id === e.party_id)?.name.toLowerCase() ?? '';
        const category = state.categories.find((c) => c.id === e.category_id)?.name.toLowerCase() ?? '';
        return (
          (e.note ?? '').toLowerCase().includes(q) ||
          party.includes(q) ||
          category.includes(q) ||
          (amountMatch !== null && e.amount_minor === amountMatch)
        );
      })
      .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))
      .map((e) => this.toView(state, e));
  }

  async listParties(businessId: string): Promise<Party[]> {
    return this.read().parties.filter((p) => p.business_id === businessId);
  }

  // --- categories and accounts ----------------------------------------------

  private assertOwnerOrStaff(state: DemoState, businessId: string): void {
    const role = this.roleFor(state, businessId, this.requireUser(state));
    if (role !== 'owner' && role !== 'staff') throw new Error('Not allowed');
  }

  async addCategory(businessId: string, name: string, type: 'expense' | 'income'): Promise<void> {
    const state = this.read();
    this.assertOwnerOrStaff(state, businessId);
    const trimmed = name.trim();
    if (!trimmed) throw new Error('Name is required');
    if (state.categories.some((c) => c.business_id === businessId && c.type === type && c.name.toLowerCase() === trimmed.toLowerCase())) {
      throw new Error('That category already exists');
    }
    state.categories.push({
      id: newId(),
      business_id: businessId,
      name: trimmed,
      type,
      keywords: [],
      is_archived: false,
      sort_order: state.categories.filter((c) => c.business_id === businessId).length,
    });
    this.write(state);
  }

  async renameCategory(id: string, name: string): Promise<void> {
    const state = this.read();
    const category = state.categories.find((c) => c.id === id);
    if (!category) throw new Error('Category not found');
    this.assertOwnerOrStaff(state, category.business_id);
    if (!name.trim()) throw new Error('Name is required');
    category.name = name.trim();
    this.write(state);
  }

  async setCategoryArchived(id: string, archived: boolean): Promise<void> {
    const state = this.read();
    const category = state.categories.find((c) => c.id === id);
    if (!category) return;
    this.assertOwnerOrStaff(state, category.business_id);
    category.is_archived = archived;
    this.write(state);
  }

  async addAccount(businessId: string, name: string, kind: 'cash' | 'bank' | 'upi' | 'other'): Promise<void> {
    const state = this.read();
    this.assertOwnerOrStaff(state, businessId);
    const trimmed = name.trim();
    if (!trimmed) throw new Error('Name is required');
    if (state.accounts.some((a) => a.business_id === businessId && a.name.toLowerCase() === trimmed.toLowerCase())) {
      throw new Error('That account already exists');
    }
    state.accounts.push({
      id: newId(),
      business_id: businessId,
      name: trimmed,
      kind,
      is_archived: false,
      sort_order: state.accounts.filter((a) => a.business_id === businessId).length,
    });
    this.write(state);
  }

  async renameAccount(id: string, name: string): Promise<void> {
    const state = this.read();
    const account = state.accounts.find((a) => a.id === id);
    if (!account) throw new Error('Account not found');
    this.assertOwnerOrStaff(state, account.business_id);
    if (!name.trim()) throw new Error('Name is required');
    account.name = name.trim();
    this.write(state);
  }

  async setAccountArchived(id: string, archived: boolean): Promise<void> {
    const state = this.read();
    const account = state.accounts.find((a) => a.id === id);
    if (!account) return;
    this.assertOwnerOrStaff(state, account.business_id);
    // An archived account must not strand entries that still point at it.
    if (archived && state.accounts.filter((a) => a.business_id === account.business_id && !a.is_archived).length <= 1) {
      throw new Error('Keep at least one active account');
    }
    account.is_archived = archived;
    this.write(state);
  }

  // --- settings -------------------------------------------------------------

  async getUserSettings(): Promise<UserSettings | null> {
    const state = this.read();
    if (!state.currentUserId) return null;
    return state.settings.find((s) => s.user_id === state.currentUserId) ?? null;
  }

  async saveUserSettings(patch: Partial<UserSettings>): Promise<void> {
    const state = this.read();
    const userId = this.requireUser(state);
    const existing = state.settings.find((s) => s.user_id === userId);
    if (existing) Object.assign(existing, patch);
    else
      state.settings.push({
        user_id: userId,
        pin_hash: null,
        app_lock_enabled: false,
        default_business_id: null,
        ...patch,
      });
    this.write(state);
  }

  // --- whatsapp -------------------------------------------------------------

  async requestReauth(): Promise<void> {
    // Demo mode has no SMS; the code is the same local test OTP.
  }

  async reauthenticate(token: string): Promise<void> {
    if (token !== '123456') throw new Error('That code is not right.');
  }

  async createLinkCode(businessId: string): Promise<LinkCode> {
    const state = this.read();
    const userId = this.requireUser(state);
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const bytes = new Uint8Array(6);
    crypto.getRandomValues(bytes);
    const code = [...bytes].map((b) => alphabet[b % alphabet.length]).join('');
    const expiresAt = new Date(Date.now() + LINK_CODE_TTL_MS).toISOString();
    state.codes.push({ code, business_id: businessId, user_id: userId, expires_at: expiresAt, consumed_at: null });
    this.write(state);
    return { code, expiresAt };
  }

  async listLinks(businessId: string): Promise<WhatsappLinkView[]> {
    return this.read()
      .links.filter((l) => l.business_id === businessId)
      .map((l) => ({ id: l.id, phoneE164: l.phone_e164, linkedAt: l.linked_at, masked: maskPhone(l.phone_e164) }));
  }

  async unlink(id: string): Promise<void> {
    const state = this.read();
    state.links = state.links.filter((l) => l.id !== id);
    this.write(state);
  }

  /**
   * Runs a message through the real parser and applies the same rules as the
   * edge function, so the WhatsApp round trip is exercisable with no Meta app.
   */
  async simulateInbound(businessId: string, phoneE164: string, body: string): Promise<string | null> {
    const state = this.read();
    const link = state.links.find((l) => l.phone_e164 === phoneE164 && l.business_id === businessId);
    if (!link) return null;

    const parsed = parseMessage(body);
    if (parsed.kind === 'command') {
      if (parsed.command !== 'undo') return null;
      const cutoff = Date.now() - WHATSAPP_UNDO_WINDOW_MS;
      const latest = state.entries
        .filter(
          (e) =>
            e.business_id === businessId &&
            e.source === 'whatsapp' &&
            !e.deleted_at &&
            new Date(e.created_at).getTime() > cutoff,
        )
        .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
      if (!latest) return null;
      latest.deleted_at = new Date().toISOString();
      this.write(state);
      return null;
    }
    if (parsed.kind !== 'entry') return null;

    const accounts = state.accounts.filter((a) => a.business_id === businessId);
    const account = parsed.account ? accounts.find((a) => a.kind === parsed.account) : undefined;
    const category = parsed.category
      ? state.categories.find(
          (c) => c.business_id === businessId && c.type === parsed.type && c.name === parsed.category,
        )
      : undefined;

    const view = await this.createEntry({
      clientId: newId(),
      businessId,
      type: parsed.type,
      amountMinor: parsed.amountMinor,
      accountId: (account ?? accounts[0])!.id,
      categoryId: category?.id ?? (await this.predictCategory(businessId, parsed.note, null)),
      partyName: parsed.party,
      note: parsed.note || null,
      occurredAt: parsed.date
        ? new Date(parsed.date.year, parsed.date.month - 1, parsed.date.day, 12).toISOString()
        : new Date().toISOString(),
      source: 'whatsapp',
    });
    return view.id;
  }

  // --- realtime -------------------------------------------------------------

  subscribeEntries(_businessId: string, onChange: () => void): () => void {
    listeners.add(onChange);
    const onStorage = (e: StorageEvent) => {
      if (e.key === DEMO_STORAGE_KEY) onChange();
    };
    if (typeof window !== 'undefined') window.addEventListener('storage', onStorage);
    return () => {
      listeners.delete(onChange);
      if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage);
    };
  }
}
