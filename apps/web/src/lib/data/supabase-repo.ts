import type { SupabaseClient } from '@supabase/supabase-js';
import {
  INVITE_CODE_TTL_MS,
  LINK_CODE_TTL_MS,
  type BudgetStatus,
  type CategoryTotal,
  type EntryView,
  type GstSummaryRow,
  type MemberView,
  type Party,
  type PasskeyView,
  type QuickChip,
  type RecurringEntryView,
  type Role,
  type UserSettings,
} from '@khata/shared';
import { maskPhone } from './phone.ts';
import { getSupabaseBrowserClient } from './supabase-client.ts';
import type {
  Bootstrap,
  BusinessSummary,
  CreateEntryInput,
  CreateRecurringInput,
  SavePasskeyInput,
  DayTotals,
  EntryFilter,
  LedgerRepo,
  LinkCode,
  Session,
  UpdateEntryInput,
  WhatsappLinkView,
} from './types.ts';

const ENTRY_COLUMNS =
  'id, business_id, type, amount_minor, account_id, category_id, party_id, note, occurred_at, ' +
  'attachment_path, source, created_by, client_id, deleted_at, created_at, updated_at, ' +
  'account_name, category_name, party_name';

function unwrap<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  if (result.data === null) throw new Error('No data returned');
  return result.data;
}

/** The production repository. Reads go through views, totals through SQL (§9). */
export class SupabaseRepo implements LedgerRepo {
  readonly mode = 'supabase' as const;

  constructor(private readonly db: SupabaseClient = getSupabaseBrowserClient()) {}

  // --- auth -----------------------------------------------------------------

  async getSession(): Promise<Session | null> {
    const { data } = await this.db.auth.getUser();
    const user = data.user;
    if (!user) return null;
    return {
      userId: user.id,
      phone: user.phone ? `+${user.phone.replace(/^\+/, '')}` : null,
      email: user.email ?? null,
      displayName: (user.user_metadata?.name as string | undefined) ?? null,
    };
  }

  async requestOtp(input: { phone?: string; email?: string }): Promise<void> {
    const { error } = input.phone
      ? await this.db.auth.signInWithOtp({ phone: input.phone })
      : await this.db.auth.signInWithOtp({ email: input.email!, options: { shouldCreateUser: true } });
    if (error) throw new Error(error.message);
  }

  async verifyOtp(input: { phone?: string; email?: string; token: string }): Promise<Session> {
    const { data, error } = input.phone
      ? await this.db.auth.verifyOtp({ phone: input.phone, token: input.token, type: 'sms' })
      : await this.db.auth.verifyOtp({ email: input.email!, token: input.token, type: 'email' });
    if (error) throw new Error(error.message);
    const user = data.user!;
    return {
      userId: user.id,
      phone: user.phone ?? null,
      email: user.email ?? null,
      displayName: (user.user_metadata?.name as string | undefined) ?? null,
    };
  }

  async signOut(): Promise<void> {
    await this.db.auth.signOut();
  }

  // --- businesses -----------------------------------------------------------

  async listBusinesses(): Promise<BusinessSummary[]> {
    const session = await this.getSession();
    if (!session) return [];
    // RLS lets a member read every membership row in their business, so this
    // must be narrowed to the current user or the list comes back with their
    // colleagues' rows too.
    const { data, error } = await this.db
      .from('business_members')
      .select('role, businesses!inner(id, name)')
      .eq('user_id', session.userId)
      .order('created_at');
    if (error) throw new Error(error.message);
    return (data ?? []).map((row: any) => ({
      id: row.businesses.id,
      name: row.businesses.name,
      role: row.role,
    }));
  }

  async createBusiness(input: {
    name: string;
    currency: string;
    locale: string;
    timezone: string;
    startingBalanceMinor: string;
  }): Promise<string> {
    const { data, error } = await this.db.rpc('fn_create_business', {
      p_name: input.name,
      p_currency: input.currency,
      p_locale: input.locale,
      p_timezone: input.timezone,
      p_starting_balance_minor: input.startingBalanceMinor,
    });
    if (error) throw new Error(error.message);
    return data as string;
  }

  async getBootstrap(businessId: string): Promise<Bootstrap> {
    const session = await this.getSession();
    if (!session) throw new Error('Not signed in');

    const [business, membership, accounts, categories, defaultAccount] = await Promise.all([
      this.db.from('businesses').select('*').eq('id', businessId).single(),
      this.db
        .from('business_members')
        .select('role')
        .eq('business_id', businessId)
        .eq('user_id', session.userId)
        .single(),
      this.db.from('accounts').select('*').eq('business_id', businessId).eq('is_archived', false).order('sort_order'),
      this.db.from('categories').select('*').eq('business_id', businessId).eq('is_archived', false).order('sort_order'),
      this.db.rpc('fn_default_account', { p_business_id: businessId }),
    ]);

    const accountRows = unwrap(accounts);
    return {
      business: unwrap(business),
      role: unwrap(membership).role,
      accounts: accountRows,
      categories: unwrap(categories),
      defaultAccountId: (defaultAccount.data as string | null) ?? accountRows[0]?.id ?? '',
    };
  }

  // --- entries --------------------------------------------------------------

  async listEntries(businessId: string, filter: EntryFilter = {}): Promise<EntryView[]> {
    let query = this.db
      .from('v_entries')
      .select(ENTRY_COLUMNS)
      .eq('business_id', businessId)
      .order('occurred_at', { ascending: false });

    if (filter.from) query = query.gte('occurred_at', filter.from);
    if (filter.to) query = query.lte('occurred_at', filter.to);
    if (filter.categoryId) query = query.eq('category_id', filter.categoryId);
    if (filter.partyId) query = query.eq('party_id', filter.partyId);
    if (filter.limit) query = query.limit(filter.limit);

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as EntryView[];
  }

  async getDayTotals(businessId: string, dayIso: string): Promise<DayTotals> {
    const { data, error } = await this.db
      .from('v_daily_totals')
      .select('income_minor, expense_minor, net_minor, entry_count')
      .eq('business_id', businessId)
      .eq('day', dayIso)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return {
      incomeMinor: String(data?.income_minor ?? 0),
      expenseMinor: String(data?.expense_minor ?? 0),
      netMinor: String(data?.net_minor ?? 0),
      entryCount: Number(data?.entry_count ?? 0),
    };
  }

  async getMonthSummary(businessId: string, monthIso: string): Promise<DayTotals> {
    const { data, error } = await this.db.rpc('fn_month_summary', {
      p_business_id: businessId,
      p_month: monthIso,
    });
    if (error) throw new Error(error.message);
    const row = Array.isArray(data) ? data[0] : data;
    return {
      incomeMinor: String(row?.income_minor ?? 0),
      expenseMinor: String(row?.expense_minor ?? 0),
      netMinor: String(row?.net_minor ?? 0),
      entryCount: Number(row?.entry_count ?? 0),
    };
  }

  async getMonthCategoryTotals(businessId: string, monthIso: string): Promise<CategoryTotal[]> {
    const month = monthIso.slice(0, 8) + '01';
    const { data, error } = await this.db
      .from('v_monthly_category_totals')
      .select('category_id, category_name, type, total_minor, entry_count')
      .eq('business_id', businessId)
      .eq('month', month);
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as CategoryTotal[]).sort((a, b) =>
      Number(BigInt(b.total_minor) - BigInt(a.total_minor)),
    );
  }

  async getQuickChips(businessId: string): Promise<QuickChip[]> {
    const { data, error } = await this.db.rpc('fn_quick_chips', { p_business_id: businessId, p_limit: 6 });
    if (error) throw new Error(error.message);
    return (data ?? []) as QuickChip[];
  }

  async predictCategory(businessId: string, note: string, partyId: string | null): Promise<string | null> {
    const { data, error } = await this.db.rpc('fn_predict_category', {
      p_business_id: businessId,
      p_note: note,
      p_party_id: partyId,
    });
    if (error) return null;
    return (data as string | null) ?? null;
  }

  private async resolveParty(businessId: string, name: string | null): Promise<string | null> {
    if (!name?.trim()) return null;
    const { data, error } = await this.db.rpc('fn_upsert_party', { p_business_id: businessId, p_name: name.trim() });
    if (error) throw new Error(error.message);
    return (data as string | null) ?? null;
  }

  async createEntry(input: CreateEntryInput): Promise<EntryView> {
    const partyId = await this.resolveParty(input.businessId, input.partyName);

    let attachmentPath: string | null = null;
    if (input.attachment) {
      attachmentPath = `${input.businessId}/${input.clientId}.jpg`;
      const { error } = await this.db.storage
        .from('attachments')
        .upload(attachmentPath, input.attachment, { contentType: 'image/jpeg', upsert: true });
      if (error) throw new Error(error.message);
    }

    const session = await this.getSession();
    const { data, error } = await this.db
      .from('entries')
      .insert({
        business_id: input.businessId,
        type: input.type,
        amount_minor: input.amountMinor,
        account_id: input.accountId,
        category_id: input.categoryId,
        party_id: partyId,
        note: input.note,
        occurred_at: input.occurredAt,
        attachment_path: attachmentPath,
        source: input.source ?? 'app',
        created_by: session?.userId ?? null,
        client_id: input.clientId,
        tax_amount_minor: input.taxAmountMinor ?? '0',
      })
      .select('id')
      .single();

    // A duplicate client_id means the previous attempt actually landed (§4.7).
    if (error && !error.message.includes('duplicate key')) throw new Error(error.message);

    // Read the row back through the view either way: on a duplicate the insert
    // returned nothing but the original row is already there under client_id.
    const lookup = this.db.from('v_entries').select(ENTRY_COLUMNS);
    const { data: view } = data?.id
      ? await lookup.eq('id', data.id).single()
      : await lookup.eq('client_id', input.clientId).single();
    return view as unknown as EntryView;
  }

  async updateEntry(input: UpdateEntryInput): Promise<EntryView> {
    const patch: Record<string, unknown> = {};
    if (input.amountMinor !== undefined) patch.amount_minor = input.amountMinor;
    if (input.accountId !== undefined) patch.account_id = input.accountId;
    if (input.categoryId !== undefined) patch.category_id = input.categoryId;
    if (input.note !== undefined) patch.note = input.note;
    if (input.occurredAt !== undefined) patch.occurred_at = input.occurredAt;
    if (input.type !== undefined) patch.type = input.type;
    if (input.taxAmountMinor !== undefined) patch.tax_amount_minor = input.taxAmountMinor;

    const { data: existing } = await this.db.from('entries').select('business_id').eq('id', input.id).single();
    if (input.partyName !== undefined && existing) {
      patch.party_id = await this.resolveParty(existing.business_id, input.partyName);
    }

    const { error } = await this.db.from('entries').update(patch).eq('id', input.id);
    if (error) throw new Error(error.message);

    const { data } = await this.db.from('v_entries').select(ENTRY_COLUMNS).eq('id', input.id).single();
    return data as unknown as EntryView;
  }

  async setEntryDeleted(id: string, deleted: boolean): Promise<void> {
    const { error } = await this.db
      .from('entries')
      .update({ deleted_at: deleted ? new Date().toISOString() : null })
      .eq('id', id);
    if (error) throw new Error(error.message);
  }

  async searchEntries(businessId: string, query: string): Promise<EntryView[]> {
    const { data, error } = await this.db.rpc('fn_search_entries', {
      p_business_id: businessId,
      p_query: query,
      p_limit: 100,
    });
    if (error) throw new Error(error.message);
    return (data ?? []) as EntryView[];
  }

  async listParties(businessId: string): Promise<Party[]> {
    const { data, error } = await this.db.from('parties').select('*').eq('business_id', businessId).order('name');
    if (error) throw new Error(error.message);
    return (data ?? []) as Party[];
  }

  // --- categories and accounts (§4.2) ---------------------------------------

  async addCategory(businessId: string, name: string, type: 'expense' | 'income'): Promise<void> {
    const { count } = await this.db
      .from('categories')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', businessId);
    const { error } = await this.db
      .from('categories')
      .insert({ business_id: businessId, name: name.trim(), type, sort_order: count ?? 0 });
    if (error) throw new Error(error.message);
  }

  async renameCategory(id: string, name: string): Promise<void> {
    const { error } = await this.db.from('categories').update({ name: name.trim() }).eq('id', id);
    if (error) throw new Error(error.message);
  }

  async setCategoryArchived(id: string, archived: boolean): Promise<void> {
    const { error } = await this.db.from('categories').update({ is_archived: archived }).eq('id', id);
    if (error) throw new Error(error.message);
  }

  async addAccount(businessId: string, name: string, kind: 'cash' | 'bank' | 'upi' | 'other'): Promise<void> {
    const { count } = await this.db
      .from('accounts')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', businessId);
    const { error } = await this.db
      .from('accounts')
      .insert({ business_id: businessId, name: name.trim(), kind, sort_order: count ?? 0 });
    if (error) throw new Error(error.message);
  }

  async renameAccount(id: string, name: string): Promise<void> {
    const { error } = await this.db.from('accounts').update({ name: name.trim() }).eq('id', id);
    if (error) throw new Error(error.message);
  }

  async setAccountArchived(id: string, archived: boolean): Promise<void> {
    const { data: account } = await this.db.from('accounts').select('business_id').eq('id', id).single();
    if (archived && account) {
      // Never leave a business with nowhere to post an entry.
      const { count } = await this.db
        .from('accounts')
        .select('id', { count: 'exact', head: true })
        .eq('business_id', account.business_id)
        .eq('is_archived', false);
      if ((count ?? 0) <= 1) throw new Error('Keep at least one active account');
    }
    const { error } = await this.db.from('accounts').update({ is_archived: archived }).eq('id', id);
    if (error) throw new Error(error.message);
  }

  // --- settings -------------------------------------------------------------

  async getUserSettings(): Promise<UserSettings | null> {
    const { data } = await this.db.from('user_settings').select('*').maybeSingle();
    return (data as UserSettings | null) ?? null;
  }

  async saveUserSettings(patch: Partial<UserSettings>): Promise<void> {
    const session = await this.getSession();
    if (!session) throw new Error('Not signed in');
    const { error } = await this.db.from('user_settings').upsert(
      { user_id: session.userId, ...patch },
      { onConflict: 'user_id' },
    );
    if (error) throw new Error(error.message);
  }

  // --- whatsapp -------------------------------------------------------------

  /**
   * §4.1: destructive actions re-send an OTP rather than trusting a 30-day
   * session. Uses the identity already on the session, never a typed-in one.
   */
  async requestReauth(): Promise<void> {
    const session = await this.getSession();
    if (!session) throw new Error('Not signed in');
    if (session.phone) await this.requestOtp({ phone: session.phone });
    else if (session.email) await this.requestOtp({ email: session.email });
    else throw new Error('No identity to verify against');
  }

  async reauthenticate(token: string): Promise<void> {
    const session = await this.getSession();
    if (!session) throw new Error('Not signed in');
    await this.verifyOtp(
      session.phone ? { phone: session.phone, token } : { email: session.email!, token },
    );
  }

  async createLinkCode(businessId: string): Promise<LinkCode> {
    const session = await this.getSession();
    if (!session) throw new Error('Not signed in');
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const bytes = new Uint8Array(6);
    crypto.getRandomValues(bytes);
    const code = [...bytes].map((b) => alphabet[b % alphabet.length]).join('');
    const expiresAt = new Date(Date.now() + LINK_CODE_TTL_MS).toISOString();

    const { error } = await this.db.from('whatsapp_link_codes').insert({
      business_id: businessId,
      user_id: session.userId,
      code,
      expires_at: expiresAt,
    });
    if (error) throw new Error(error.message);
    return { code, expiresAt };
  }

  async listLinks(businessId: string): Promise<WhatsappLinkView[]> {
    const { data, error } = await this.db
      .from('whatsapp_links')
      .select('id, phone_e164, linked_at')
      .eq('business_id', businessId);
    if (error) throw new Error(error.message);
    return (data ?? []).map((l: any) => ({
      id: l.id,
      phoneE164: l.phone_e164,
      linkedAt: l.linked_at,
      masked: maskPhone(l.phone_e164),
    }));
  }

  async unlink(id: string): Promise<void> {
    const { error } = await this.db.from('whatsapp_links').delete().eq('id', id);
    if (error) throw new Error(error.message);
  }

  // --- recurring entries (P1 #2) ---------------------------------------------

  private static readonly RECURRING_COLUMNS =
    'id, business_id, type, amount_minor, account_id, category_id, party_id, note, cadence, ' +
    'day_of_month, day_of_week, next_due_on, last_posted_on, is_active, created_by, ' +
    'accounts!inner(name), categories(name), parties(name)';

  private toRecurringView(row: any): RecurringEntryView {
    const { accounts, categories, parties, ...rest } = row;
    return {
      ...rest,
      account_name: accounts?.name ?? '',
      category_name: categories?.name ?? null,
      party_name: parties?.name ?? null,
    };
  }

  async listRecurring(businessId: string): Promise<RecurringEntryView[]> {
    const { data, error } = await this.db
      .from('recurring_entries')
      .select(SupabaseRepo.RECURRING_COLUMNS)
      .eq('business_id', businessId)
      .order('next_due_on');
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => this.toRecurringView(r));
  }

  async listDueRecurring(businessId: string): Promise<RecurringEntryView[]> {
    // fn_due_recurring applies the business timezone, which is what decides
    // whether "today" has arrived for this shop.
    const { data, error } = await this.db.rpc('fn_due_recurring', { p_business_id: businessId });
    if (error) throw new Error(error.message);
    const ids = (data ?? []).map((r: { id: string }) => r.id);
    if (ids.length === 0) return [];

    const { data: full, error: joinError } = await this.db
      .from('recurring_entries')
      .select(SupabaseRepo.RECURRING_COLUMNS)
      .in('id', ids)
      .order('next_due_on');
    if (joinError) throw new Error(joinError.message);
    return (full ?? []).map((r) => this.toRecurringView(r));
  }

  async createRecurring(input: CreateRecurringInput): Promise<void> {
    const session = await this.getSession();
    const partyId = await this.resolveParty(input.businessId, input.partyName);

    // Ask Postgres for the first due date so the schedule maths lives in one
    // place, clamping and all.
    const today = new Date().toISOString().slice(0, 10);
    const { data: nextDue, error: dueError } = await this.db.rpc('fn_next_due', {
      p_cadence: input.cadence,
      p_day_of_month: input.dayOfMonth,
      p_day_of_week: input.dayOfWeek,
      // Look from yesterday so something due today is due today, not next cycle.
      p_after: new Date(Date.now() - 86400000).toISOString().slice(0, 10),
    });
    if (dueError) throw new Error(dueError.message);

    const { error } = await this.db.from('recurring_entries').insert({
      business_id: input.businessId,
      type: input.type,
      amount_minor: input.amountMinor,
      account_id: input.accountId,
      category_id: input.categoryId,
      party_id: partyId,
      note: input.note,
      cadence: input.cadence,
      day_of_month: input.dayOfMonth,
      day_of_week: input.dayOfWeek,
      next_due_on: (nextDue as string | null) ?? today,
      created_by: session?.userId ?? null,
    });
    if (error) throw new Error(error.message);
  }

  async setRecurringActive(id: string, active: boolean): Promise<void> {
    const { error } = await this.db.from('recurring_entries').update({ is_active: active }).eq('id', id);
    if (error) throw new Error(error.message);
  }

  async deleteRecurring(id: string): Promise<void> {
    const { error } = await this.db.from('recurring_entries').delete().eq('id', id);
    if (error) throw new Error(error.message);
  }

  private async advanceRecurring(id: string, posted: boolean): Promise<void> {
    const { data: row } = await this.db
      .from('recurring_entries')
      .select('cadence, day_of_month, day_of_week, next_due_on')
      .eq('id', id)
      .single();
    if (!row) return;

    const { data: nextDue } = await this.db.rpc('fn_next_due', {
      p_cadence: row.cadence,
      p_day_of_month: row.day_of_month,
      p_day_of_week: row.day_of_week,
      p_after: row.next_due_on,
    });

    const patch: Record<string, unknown> = { next_due_on: nextDue };
    if (posted) patch.last_posted_on = new Date().toISOString().slice(0, 10);
    await this.db.from('recurring_entries').update(patch).eq('id', id);
  }

  async confirmRecurring(id: string): Promise<EntryView> {
    const { data: row, error } = await this.db
      .from('recurring_entries')
      .select('*, parties(name)')
      .eq('id', id)
      .single();
    if (error || !row) throw new Error(error?.message ?? 'That schedule no longer exists');

    const view = await this.createEntry({
      clientId: crypto.randomUUID(),
      businessId: row.business_id,
      type: row.type,
      amountMinor: String(row.amount_minor),
      accountId: row.account_id,
      categoryId: row.category_id,
      partyName: (row as any).parties?.name ?? null,
      note: row.note,
      occurredAt: new Date().toISOString(),
    });

    await this.advanceRecurring(id, true);
    return view;
  }

  async skipRecurring(id: string): Promise<void> {
    await this.advanceRecurring(id, false);
  }

  // --- budgets (P1 #8) --------------------------------------------------------

  async listBudgets(businessId: string): Promise<BudgetStatus[]> {
    const { data, error } = await this.db
      .from('v_budget_status')
      .select('*')
      .eq('business_id', businessId)
      .order('percent_used', { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((b: any) => ({
      ...b,
      budget_minor: String(b.budget_minor),
      spent_minor: String(b.spent_minor),
      remaining_minor: String(b.remaining_minor),
    })) as BudgetStatus[];
  }

  async setBudget(businessId: string, categoryId: string, amountMinor: string): Promise<void> {
    const { error } = await this.db.from('budgets').upsert(
      { business_id: businessId, category_id: categoryId, amount_minor: amountMinor, is_active: true },
      { onConflict: 'business_id,category_id' },
    );
    if (error) throw new Error(error.message);
  }

  async removeBudget(id: string): Promise<void> {
    const { error } = await this.db.from('budgets').delete().eq('id', id);
    if (error) throw new Error(error.message);
  }

  // --- members and invites (P1 #6) --------------------------------------------

  async listMembers(businessId: string): Promise<MemberView[]> {
    const session = await this.getSession();
    const { data, error } = await this.db
      .from('business_members')
      .select('id, user_id, role')
      .eq('business_id', businessId);
    if (error) throw new Error(error.message);

    // RLS keeps other users' rows out of auth.users, so members are labelled by
    // role rather than by identity. §6.4: never expose another member's number.
    return (data ?? []).map((m: any) => ({
      id: m.id,
      user_id: m.user_id,
      role: m.role,
      label: m.user_id === session?.userId ? 'You' : roleLabel(m.role),
      is_self: m.user_id === session?.userId,
    }));
  }

  async setMemberRole(memberId: string, role: Role): Promise<void> {
    const { error } = await this.db.from('business_members').update({ role }).eq('id', memberId);
    if (error) throw new Error(error.message);
  }

  async removeMember(memberId: string): Promise<void> {
    const { error } = await this.db.from('business_members').delete().eq('id', memberId);
    if (error) throw new Error(error.message);
  }

  async createInvite(businessId: string, role: Role): Promise<LinkCode> {
    const session = await this.getSession();
    if (!session) throw new Error('Not signed in');
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const bytes = new Uint8Array(6);
    crypto.getRandomValues(bytes);
    const code = [...bytes].map((b) => alphabet[b % alphabet.length]).join('');
    const expiresAt = new Date(Date.now() + INVITE_CODE_TTL_MS).toISOString();

    const { error } = await this.db
      .from('business_invites')
      .insert({ business_id: businessId, role, code, expires_at: expiresAt, created_by: session.userId });
    if (error) throw new Error(error.message);
    return { code, expiresAt };
  }

  async acceptInvite(code: string): Promise<string> {
    const { data, error } = await this.db.rpc('fn_accept_invite', { p_code: code });
    if (error) throw new Error(error.message);
    return data as string;
  }

  // --- passkeys (P1 #1) -------------------------------------------------------

  async listPasskeys(): Promise<PasskeyView[]> {
    const { data, error } = await this.db
      .from('user_passkeys')
      .select('id, credential_id, device_label, created_at, last_used_at')
      .order('created_at');
    if (error) throw new Error(error.message);
    return (data ?? []) as PasskeyView[];
  }

  async savePasskey(input: SavePasskeyInput): Promise<void> {
    const session = await this.getSession();
    if (!session) throw new Error('Not signed in');
    const { error } = await this.db.from('user_passkeys').upsert(
      {
        user_id: session.userId,
        credential_id: input.credentialId,
        public_key: input.publicKey,
        device_label: input.deviceLabel,
        transports: input.transports,
      },
      { onConflict: 'credential_id' },
    );
    if (error) throw new Error(error.message);
  }

  async removePasskey(id: string): Promise<void> {
    const { error } = await this.db.from('user_passkeys').delete().eq('id', id);
    if (error) throw new Error(error.message);
  }

  async touchPasskey(credentialId: string): Promise<void> {
    await this.db
      .from('user_passkeys')
      .update({ last_used_at: new Date().toISOString() })
      .eq('credential_id', credentialId);
  }

  // --- GST (P1 #9) ------------------------------------------------------------

  async setGstEnabled(businessId: string, enabled: boolean): Promise<void> {
    const { error } = await this.db.from('businesses').update({ gst_enabled: enabled }).eq('id', businessId);
    if (error) throw new Error(error.message);
  }

  async setPartyGstin(partyId: string, gstin: string | null): Promise<void> {
    const { error } = await this.db.from('parties').update({ gstin }).eq('id', partyId);
    if (error) throw new Error(error.message);
  }

  async gstSummary(businessId: string, monthIso: string): Promise<GstSummaryRow[]> {
    const month = monthIso.slice(0, 8) + '01';
    const { data, error } = await this.db
      .from('v_gst_summary')
      .select('*')
      .eq('business_id', businessId)
      .eq('month', month);
    if (error) throw new Error(error.message);
    return (data ?? []).map((r: any) => ({
      ...r,
      gross_minor: String(r.gross_minor),
      tax_minor: String(r.tax_minor),
      net_minor: String(r.net_minor),
    })) as GstSummaryRow[];
  }

  // --- realtime -------------------------------------------------------------

  subscribeEntries(businessId: string, onChange: () => void): () => void {
    const channel = this.db
      .channel(`entries:${businessId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'entries', filter: `business_id=eq.${businessId}` },
        onChange,
      )
      .subscribe();
    return () => {
      void this.db.removeChannel(channel);
    };
  }
}

/** Members are labelled by role when their identity is not ours to reveal. */
function roleLabel(role: Role): string {
  return role === 'owner' ? 'Owner' : role === 'staff' ? 'Staff member' : 'Accountant';
}
