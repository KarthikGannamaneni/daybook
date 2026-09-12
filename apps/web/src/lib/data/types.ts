import type {
  Account,
  Business,
  BudgetStatus,
  Category,
  CategoryTotal,
  EntryView,
  GstSummaryRow,
  MemberView,
  Party,
  PasskeyView,
  QuickChip,
  RecurringEntryView,
  Role,
  UserSettings,
} from '@khata/shared';

/**
 * The seam between the UI and its storage.
 *
 * Two implementations exist: `supabase-repo` (the product) and `demo-repo`
 * (a browser-local dataset). Nothing above this interface knows which one is
 * in play, which is what lets the app and the whole Playwright suite run with
 * no Docker and no cloud project. See docs/DECISIONS.md.
 */

export interface Session {
  userId: string;
  phone: string | null;
  email: string | null;
  displayName: string | null;
}

export interface BusinessSummary {
  id: string;
  name: string;
  role: Role;
}

export interface Bootstrap {
  business: Business;
  role: Role;
  accounts: Account[];
  categories: Category[];
  defaultAccountId: string;
}

export interface EntryFilter {
  from?: string;
  to?: string;
  limit?: number;
  categoryId?: string;
  partyId?: string;
  query?: string;
}

export interface DayTotals {
  incomeMinor: string;
  expenseMinor: string;
  netMinor: string;
  entryCount: number;
}

export interface CreateEntryInput {
  clientId: string;
  businessId: string;
  type: 'expense' | 'income';
  amountMinor: string;
  accountId: string;
  categoryId: string | null;
  partyName: string | null;
  note: string | null;
  occurredAt: string;
  attachment?: Blob | null;
  source?: 'app' | 'whatsapp';
  /** P1 #9: tax portion included in amountMinor. */
  taxAmountMinor?: string;
}

export interface UpdateEntryInput {
  id: string;
  amountMinor?: string;
  accountId?: string;
  categoryId?: string | null;
  partyName?: string | null;
  note?: string | null;
  occurredAt?: string;
  type?: 'expense' | 'income';
  taxAmountMinor?: string;
}

export interface LinkCode {
  code: string;
  expiresAt: string;
}

export interface WhatsappLinkView {
  id: string;
  phoneE164: string;
  linkedAt: string;
  /** Masked for display: +91 98xxx xx210 (§6.4). */
  masked: string;
}

export interface CreateRecurringInput {
  businessId: string;
  type: 'expense' | 'income';
  amountMinor: string;
  accountId: string;
  categoryId: string | null;
  partyName: string | null;
  note: string | null;
  cadence: 'weekly' | 'monthly';
  dayOfMonth: number | null;
  dayOfWeek: number | null;
}

export interface SavePasskeyInput {
  credentialId: string;
  publicKey: string;
  deviceLabel: string | null;
  transports: string[];
}

export interface LedgerRepo {
  readonly mode: 'supabase' | 'demo';

  // --- auth ---------------------------------------------------------------
  getSession(): Promise<Session | null>;
  requestOtp(input: { phone?: string; email?: string }): Promise<void>;
  verifyOtp(input: { phone?: string; email?: string; token: string }): Promise<Session>;
  signOut(): Promise<void>;

  // --- businesses ---------------------------------------------------------
  listBusinesses(): Promise<BusinessSummary[]>;
  createBusiness(input: {
    name: string;
    currency: string;
    locale: string;
    timezone: string;
    startingBalanceMinor: string;
  }): Promise<string>;
  getBootstrap(businessId: string): Promise<Bootstrap>;

  // --- entries ------------------------------------------------------------
  listEntries(businessId: string, filter?: EntryFilter): Promise<EntryView[]>;
  getDayTotals(businessId: string, dayIso: string): Promise<DayTotals>;
  getMonthSummary(businessId: string, monthIso: string): Promise<DayTotals>;
  getMonthCategoryTotals(businessId: string, monthIso: string): Promise<CategoryTotal[]>;
  getQuickChips(businessId: string): Promise<QuickChip[]>;
  predictCategory(businessId: string, note: string, partyId: string | null): Promise<string | null>;
  createEntry(input: CreateEntryInput): Promise<EntryView>;
  updateEntry(input: UpdateEntryInput): Promise<EntryView>;
  setEntryDeleted(id: string, deleted: boolean): Promise<void>;
  searchEntries(businessId: string, query: string): Promise<EntryView[]>;

  // --- parties ------------------------------------------------------------
  listParties(businessId: string): Promise<Party[]>;

  // --- categories and accounts (§4.2) --------------------------------------
  addCategory(businessId: string, name: string, type: 'expense' | 'income'): Promise<void>;
  renameCategory(id: string, name: string): Promise<void>;
  setCategoryArchived(id: string, archived: boolean): Promise<void>;
  addAccount(businessId: string, name: string, kind: 'cash' | 'bank' | 'upi' | 'other'): Promise<void>;
  renameAccount(id: string, name: string): Promise<void>;
  setAccountArchived(id: string, archived: boolean): Promise<void>;

  // --- settings -----------------------------------------------------------
  getUserSettings(): Promise<UserSettings | null>;
  saveUserSettings(patch: Partial<Pick<UserSettings, 'pin_hash' | 'app_lock_enabled' | 'default_business_id'>>): Promise<void>;

  // --- whatsapp -----------------------------------------------------------
  createLinkCode(businessId: string): Promise<LinkCode>;
  /** Re-authentication for destructive actions (§4.1). Throws when it fails. */
  reauthenticate(token: string): Promise<void>;
  /** Sends the re-auth code to the signed-in identity. */
  requestReauth(): Promise<void>;
  listLinks(businessId: string): Promise<WhatsappLinkView[]>;
  unlink(id: string): Promise<void>;
  /** Local-only: feeds a message through the real parser, as the webhook would. */
  simulateInbound?(businessId: string, phoneE164: string, body: string): Promise<string | null>;

  // --- recurring entries (P1 #2) -------------------------------------------
  listRecurring(businessId: string): Promise<RecurringEntryView[]>;
  /** Only what is due today or overdue — what the home screen proposes. */
  listDueRecurring(businessId: string): Promise<RecurringEntryView[]>;
  createRecurring(input: CreateRecurringInput): Promise<void>;
  setRecurringActive(id: string, active: boolean): Promise<void>;
  deleteRecurring(id: string): Promise<void>;
  /** Posts the proposed entry and advances the schedule. Never called automatically. */
  confirmRecurring(id: string): Promise<EntryView>;
  /** Advances the schedule without posting anything. */
  skipRecurring(id: string): Promise<void>;

  // --- budgets (P1 #8) ------------------------------------------------------
  listBudgets(businessId: string): Promise<BudgetStatus[]>;
  setBudget(businessId: string, categoryId: string, amountMinor: string): Promise<void>;
  removeBudget(id: string): Promise<void>;

  // --- members and invites (P1 #6) ------------------------------------------
  listMembers(businessId: string): Promise<MemberView[]>;
  setMemberRole(memberId: string, role: Role): Promise<void>;
  removeMember(memberId: string): Promise<void>;
  createInvite(businessId: string, role: Role): Promise<LinkCode>;
  /** Redeems a code and returns the business joined. */
  acceptInvite(code: string): Promise<string>;

  // --- passkeys (P1 #1) -----------------------------------------------------
  listPasskeys(): Promise<PasskeyView[]>;
  savePasskey(input: SavePasskeyInput): Promise<void>;
  removePasskey(id: string): Promise<void>;
  touchPasskey(credentialId: string): Promise<void>;

  // --- GST (P1 #9) ----------------------------------------------------------
  setGstEnabled(businessId: string, enabled: boolean): Promise<void>;
  setPartyGstin(partyId: string, gstin: string | null): Promise<void>;
  gstSummary(businessId: string, monthIso: string): Promise<GstSummaryRow[]>;

  // --- realtime -----------------------------------------------------------
  subscribeEntries(businessId: string, onChange: () => void): () => void;
}
