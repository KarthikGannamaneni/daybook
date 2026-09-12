import {
  DEFAULT_ACCOUNTS,
  type Account,
  type Business,
  type BusinessMember,
  type Category,
  type Entry,
  type Party,
  type UserSettings,
} from '@khata/shared';

/**
 * The browser-local dataset behind demo mode.
 *
 * It is seeded deterministically (a fixed-seed LCG, never Math.random) so the
 * month totals asserted by the Playwright suite are stable between runs.
 */

export interface DemoUser {
  id: string;
  phone: string | null;
  email: string | null;
  name: string | null;
}

export interface DemoLink {
  id: string;
  business_id: string;
  user_id: string;
  phone_e164: string;
  linked_at: string;
}

export interface DemoLinkCode {
  code: string;
  business_id: string;
  user_id: string;
  expires_at: string;
  consumed_at: string | null;
}

export interface DemoRecurring {
  id: string;
  business_id: string;
  type: 'expense' | 'income';
  amount_minor: string;
  account_id: string;
  category_id: string | null;
  party_id: string | null;
  note: string | null;
  cadence: 'weekly' | 'monthly';
  day_of_month: number | null;
  day_of_week: number | null;
  next_due_on: string;
  last_posted_on: string | null;
  is_active: boolean;
  created_by: string | null;
}

export interface DemoBudget {
  id: string;
  business_id: string;
  category_id: string;
  amount_minor: string;
  is_active: boolean;
}

export interface DemoPasskey {
  id: string;
  user_id: string;
  credential_id: string;
  public_key: string;
  device_label: string | null;
  transports: string[];
  created_at: string;
  last_used_at: string | null;
}

export interface DemoInvite {
  id: string;
  business_id: string;
  role: 'owner' | 'staff' | 'accountant';
  code: string;
  expires_at: string;
  consumed_at: string | null;
}

export interface DemoState {
  version: number;
  currentUserId: string | null;
  users: DemoUser[];
  businesses: Business[];
  members: BusinessMember[];
  accounts: Account[];
  categories: Category[];
  parties: Party[];
  entries: Entry[];
  settings: UserSettings[];
  links: DemoLink[];
  codes: DemoLinkCode[];
  attachments: Record<string, string>;
  recurring: DemoRecurring[];
  budgets: DemoBudget[];
  passkeys: DemoPasskey[];
  invites: DemoInvite[];
}

export const DEMO_STORAGE_KEY = 'khata.demo.v1';
const VERSION = 2;

const EXPENSE_CATEGORIES: Array<[string, string[]]> = [
  ['Rent', ['rent', 'lease']],
  ['Salaries', ['salary', 'wages', 'staff']],
  ['Utilities', ['electricity', 'water', 'internet', 'wifi', 'recharge', 'bill']],
  ['Raw Material', ['material', 'stock', 'goods', 'paper', 'ink']],
  ['Transport', ['petrol', 'diesel', 'auto', 'cab', 'courier', 'delivery']],
  ['Food & Tea', ['tea', 'chai', 'coffee', 'snacks', 'tiffin', 'lunch', 'food']],
  ['Marketing', ['ads', 'pamphlet', 'banner']],
  ['Maintenance', ['repair', 'maintenance', 'cleaning']],
  ['Bank Charges', ['bank charges', 'charges']],
  ['Taxes', ['gst', 'tds', 'tax']],
  ['Other', []],
];
const INCOME_CATEGORIES: Array<[string, string[]]> = [
  ['Sales', ['sale', 'sales', 'sold', 'order']],
  ['Services', ['service', 'job work', 'consulting']],
  ['Other', []],
];

/** Deterministic pseudo-random source. */
function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function iso(d: Date): string {
  return d.toISOString();
}

export function seedDefaults(state: DemoState, businessId: string): void {
  DEFAULT_ACCOUNTS.forEach((a, i) => {
    state.accounts.push({
      id: newId(),
      business_id: businessId,
      name: a.name,
      kind: a.kind,
      is_archived: false,
      sort_order: i,
    });
  });
  EXPENSE_CATEGORIES.forEach(([name, keywords], i) => {
    state.categories.push({
      id: newId(),
      business_id: businessId,
      name,
      type: 'expense',
      keywords,
      is_archived: false,
      sort_order: i,
    });
  });
  INCOME_CATEGORIES.forEach(([name, keywords], i) => {
    state.categories.push({
      id: newId(),
      business_id: businessId,
      name,
      type: 'income',
      keywords,
      is_archived: false,
      sort_order: i,
    });
  });
}

function addParty(state: DemoState, businessId: string, name: string): Party {
  const party: Party = {
    id: newId(),
    business_id: businessId,
    name,
    normalised_name: name.toLowerCase(),
    gstin: null,
  };
  state.parties.push(party);
  return party;
}

interface Recipe {
  note: string;
  amountMinor: number;
  category: string;
  accountKind: 'cash' | 'bank' | 'upi';
}

const EXPENSE_RECIPES: Recipe[] = [
  { note: 'tea shop', amountMinor: 4000, category: 'Food & Tea', accountKind: 'cash' },
  { note: 'auto fare', amountMinor: 6000, category: 'Transport', accountKind: 'cash' },
  { note: 'raw material', amountMinor: 125000, category: 'Raw Material', accountKind: 'bank' },
  { note: 'electricity bill', amountMinor: 240000, category: 'Utilities', accountKind: 'bank' },
  { note: 'snacks for staff', amountMinor: 9000, category: 'Food & Tea', accountKind: 'cash' },
  { note: 'courier', amountMinor: 15000, category: 'Transport', accountKind: 'upi' },
  { note: 'shop cleaning', amountMinor: 20000, category: 'Maintenance', accountKind: 'cash' },
];

/** Two demo businesses and 60 days of entries, matching supabase/seed.sql in spirit. */
export function buildSeedState(now = new Date()): DemoState {
  const state: DemoState = {
    version: VERSION,
    currentUserId: null,
    users: [],
    businesses: [],
    members: [],
    accounts: [],
    categories: [],
    parties: [],
    entries: [],
    settings: [],
    links: [],
    codes: [],
    attachments: {},
    recurring: [],
    budgets: [],
    passkeys: [],
    invites: [],
  };

  const anil: DemoUser = { id: 'user-anil', phone: '+919999900001', email: 'anil@example.com', name: 'Anil Sharma' };
  const priya: DemoUser = { id: 'user-priya', phone: '+919999900002', email: 'priya@example.com', name: 'Priya Nair' };
  const ravi: DemoUser = { id: 'user-ravi', phone: '+919999900003', email: 'ravi@example.com', name: 'Ravi Kumar' };
  state.users.push(anil, priya, ravi);

  const printLab: Business = {
    id: 'biz-print-lab',
    name: 'Sharma Print Lab',
    currency: 'INR',
    locale: 'en-IN',
    timezone: 'Asia/Kolkata',
    starting_balance_minor: '1500000',
    owner_id: anil.id,
    created_at: iso(new Date(now.getTime() - 90 * 86400000)),
  };
  const teaStall: Business = {
    id: 'biz-tea-stall',
    name: 'Green Leaf Tea Stall',
    currency: 'INR',
    locale: 'en-IN',
    timezone: 'Asia/Kolkata',
    starting_balance_minor: '300000',
    owner_id: priya.id,
    created_at: iso(new Date(now.getTime() - 90 * 86400000)),
  };
  state.businesses.push(printLab, teaStall);

  state.members.push(
    { id: newId(), business_id: printLab.id, user_id: anil.id, role: 'owner', created_at: printLab.created_at },
    { id: newId(), business_id: printLab.id, user_id: ravi.id, role: 'staff', created_at: printLab.created_at },
    { id: newId(), business_id: teaStall.id, user_id: priya.id, role: 'owner', created_at: teaStall.created_at },
    { id: newId(), business_id: teaStall.id, user_id: anil.id, role: 'staff', created_at: teaStall.created_at },
  );

  seedDefaults(state, printLab.id);
  seedDefaults(state, teaStall.id);

  state.settings.push(
    { user_id: anil.id, pin_hash: null, app_lock_enabled: false, default_business_id: printLab.id },
    { user_id: priya.id, pin_hash: null, app_lock_enabled: false, default_business_id: teaStall.id },
    { user_id: ravi.id, pin_hash: null, app_lock_enabled: false, default_business_id: printLab.id },
  );

  state.links.push({
    id: newId(),
    business_id: printLab.id,
    user_id: anil.id,
    phone_e164: '+919999900001',
    linked_at: iso(now),
  });

  for (const business of [printLab, teaStall]) {
    const rand = lcg(business.id === printLab.id ? 20260901 : 20260902);
    const accounts = state.accounts.filter((a) => a.business_id === business.id);
    const account = (kind: string) => accounts.find((a) => a.kind === kind)!.id;
    const category = (name: string, type: 'expense' | 'income') =>
      state.categories.find((c) => c.business_id === business.id && c.name === name && c.type === type)!.id;

    const customers =
      business.id === printLab.id
        ? [addParty(state, business.id, 'Ramesh Traders'), addParty(state, business.id, 'City College')]
        : [addParty(state, business.id, 'Milk Dairy'), addParty(state, business.id, 'Sugar Mart')];
    const landlord = addParty(state, business.id, 'Landlord');

    const staff = state.members.find((m) => m.business_id === business.id && m.role === 'staff')?.user_id;
    const owner = business.owner_id;

    for (let day = 0; day < 60; day++) {
      const base = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day);
      const perDay = 3 + (day % 3);

      for (let i = 0; i <= perDay; i++) {
        // Always in the past, so an entry saved right now sorts to the top and
        // the seed never contains something that has not happened yet.
        const occurred = new Date(
          now.getTime() - day * 86400000 - (i * 2 + 1) * 3600000 - ((day * 7 + i * 13) % 60) * 60000,
        );
        const isIncome = (day + i) % 4 === 0;
        const createdBy = i % 3 === 0 ? (staff ?? owner) : owner;

        if (isIncome) {
          const services = (day + i) % 8 === 0;
          state.entries.push({
            id: newId(),
            business_id: business.id,
            type: 'income',
            amount_minor: String(200000 + Math.floor(rand() * 60) * 10000),
            account_id: account((day + i) % 3 === 0 ? 'upi' : 'cash'),
            category_id: category(services ? 'Services' : 'Sales', 'income'),
            party_id: customers[(day + i) % customers.length]!.id,
            note: services ? 'job work' : 'counter sale',
            occurred_at: iso(occurred),
            attachment_path: null,
            source: (day + i) % 11 === 0 ? 'whatsapp' : 'app',
            created_by: createdBy,
            client_id: newId(),
            deleted_at: null,
            created_at: iso(occurred),
            updated_at: null,
          });
        } else {
          const recipe = EXPENSE_RECIPES[(day * 3 + i) % EXPENSE_RECIPES.length]!;
          state.entries.push({
            id: newId(),
            business_id: business.id,
            type: 'expense',
            amount_minor: String(recipe.amountMinor + (day % 5) * 1000),
            account_id: account(recipe.accountKind),
            category_id: category(recipe.category, 'expense'),
            party_id: null,
            note: recipe.note,
            occurred_at: iso(occurred),
            attachment_path: null,
            source: (day + i) % 11 === 0 ? 'whatsapp' : 'app',
            created_by: createdBy,
            client_id: newId(),
            deleted_at: null,
            created_at: iso(occurred),
            updated_at: null,
          });
        }
      }

      if (base.getDate() === 1) {
        state.entries.push({
          id: newId(),
          business_id: business.id,
          type: 'expense',
          amount_minor: '1200000',
          account_id: account('bank'),
          category_id: category('Rent', 'expense'),
          party_id: landlord.id,
          note: 'monthly rent',
          occurred_at: iso(new Date(now.getTime() - day * 86400000 - 13 * 3600000)),
          attachment_path: null,
          source: 'app',
          created_by: owner,
          client_id: newId(),
          deleted_at: null,
          created_at: iso(base),
          updated_at: null,
        });
      }
      if (base.getDate() === 5) {
        state.entries.push({
          id: newId(),
          business_id: business.id,
          type: 'expense',
          amount_minor: '1800000',
          account_id: account('bank'),
          category_id: category('Salaries', 'expense'),
          party_id: null,
          note: 'staff salary',
          occurred_at: iso(new Date(now.getTime() - day * 86400000 - 14 * 3600000)),
          attachment_path: null,
          source: 'app',
          created_by: owner,
          client_id: newId(),
          deleted_at: null,
          created_at: iso(base),
          updated_at: null,
        });
      }
    }
  }

  // P1: seed one recurring entry due today and two budgets per business, so the
  // proposal card and the budget bars are visible without any setup first.
  for (const business of state.businesses) {
    const account = state.accounts.find((a) => a.business_id === business.id && a.kind === 'bank')!;
    const rent = state.categories.find(
      (c) => c.business_id === business.id && c.name === 'Rent' && c.type === 'expense',
    )!;
    const salaries = state.categories.find(
      (c) => c.business_id === business.id && c.name === 'Salaries' && c.type === 'expense',
    )!;
    const food = state.categories.find(
      (c) => c.business_id === business.id && c.name === 'Food & Tea' && c.type === 'expense',
    )!;
    const today = localDay(now);

    state.recurring.push({
      id: newId(),
      business_id: business.id,
      type: 'expense',
      amount_minor: '1200000',
      account_id: account.id,
      category_id: rent.id,
      party_id: state.parties.find((p) => p.business_id === business.id && p.name === 'Landlord')?.id ?? null,
      note: 'monthly rent',
      cadence: 'monthly',
      day_of_month: Number(today.slice(8, 10)),
      day_of_week: null,
      next_due_on: today,
      last_posted_on: null,
      is_active: true,
      created_by: business.owner_id,
    });

    state.recurring.push({
      id: newId(),
      business_id: business.id,
      type: 'expense',
      amount_minor: '1800000',
      account_id: account.id,
      category_id: salaries.id,
      party_id: null,
      note: 'staff salary',
      cadence: 'monthly',
      day_of_month: 5,
      day_of_week: null,
      next_due_on: nextMonthlyDue(now, 5),
      last_posted_on: null,
      is_active: true,
      created_by: business.owner_id,
    });

    state.budgets.push(
      { id: newId(), business_id: business.id, category_id: food.id, amount_minor: '300000', is_active: true },
      { id: newId(), business_id: business.id, category_id: rent.id, amount_minor: '1500000', is_active: true },
    );
  }

  return state;
}

/** Local calendar day as YYYY-MM-DD. */
export function localDay(at: Date): string {
  return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`;
}

/**
 * Next occurrence of a day-of-month strictly after `after`, clamped to the end
 * of short months. Mirrors fn_next_due in the migration.
 */
export function nextMonthlyDue(after: Date, dayOfMonth: number): string {
  let year = after.getFullYear();
  let month = after.getMonth();
  for (let i = 0; i < 24; i++) {
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const candidate = new Date(year, month, Math.min(dayOfMonth, daysInMonth));
    if (candidate.getTime() > new Date(after.getFullYear(), after.getMonth(), after.getDate()).getTime()) {
      return localDay(candidate);
    }
    month += 1;
    if (month > 11) {
      month = 0;
      year += 1;
    }
  }
  return localDay(after);
}

/** Next occurrence of a weekday (0 = Sunday) strictly after `after`. */
export function nextWeeklyDue(after: Date, dayOfWeek: number): string {
  const delta = ((dayOfWeek - after.getDay() + 7 - 1) % 7) + 1;
  return localDay(new Date(after.getFullYear(), after.getMonth(), after.getDate() + delta));
}

export function loadState(): DemoState {
  if (typeof window === 'undefined') return buildSeedState();
  const raw = window.localStorage.getItem(DEMO_STORAGE_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as DemoState;
      if (parsed.version === VERSION) return parsed;
    } catch {
      // Corrupt payload: fall through and reseed rather than trapping the user.
    }
  }
  const seeded = buildSeedState();
  saveState(seeded);
  return seeded;
}

export function saveState(state: DemoState): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(state));
}

export function resetState(): DemoState {
  const seeded = buildSeedState();
  saveState(seeded);
  return seeded;
}
