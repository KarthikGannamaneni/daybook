import type { SupabaseClient } from '@supabase/supabase-js';
import {
  LINK_CODE_TTL_MS,
  type CategoryTotal,
  type EntryView,
  type Party,
  type QuickChip,
  type UserSettings,
} from '@khata/shared';
import { maskPhone } from './phone.ts';
import { getSupabaseBrowserClient } from './supabase-client.ts';
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
