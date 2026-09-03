import type { AccountKind } from '@khata/parser';
import type { Role } from './constants.ts';

export type EntryType = 'expense' | 'income';
export type EntrySource = 'app' | 'whatsapp';

export interface Business {
  id: string;
  name: string;
  currency: string;
  locale: string;
  timezone: string;
  starting_balance_minor: string;
  owner_id: string;
  created_at: string;
}

export interface BusinessMember {
  id: string;
  business_id: string;
  user_id: string;
  role: Role;
  created_at: string;
}

export interface Account {
  id: string;
  business_id: string;
  name: string;
  kind: AccountKind;
  is_archived: boolean;
  sort_order: number;
}

export interface Category {
  id: string;
  business_id: string;
  name: string;
  type: EntryType;
  keywords: string[];
  is_archived: boolean;
  sort_order: number;
}

export interface Party {
  id: string;
  business_id: string;
  name: string;
  normalised_name: string;
  gstin: string | null;
}

export interface Entry {
  id: string;
  business_id: string;
  type: EntryType;
  /** bigint minor units; Postgres returns bigint as a string over PostgREST. */
  amount_minor: string;
  account_id: string;
  category_id: string | null;
  party_id: string | null;
  note: string | null;
  occurred_at: string;
  attachment_path: string | null;
  source: EntrySource;
  created_by: string | null;
  client_id: string;
  deleted_at: string | null;
  created_at: string;
  updated_at: string | null;
}

/** An entry joined with the names the UI actually renders. */
export interface EntryView extends Entry {
  account_name: string;
  category_name: string | null;
  party_name: string | null;
}

export interface DailyTotals {
  business_id: string;
  day: string;
  income_minor: string;
  expense_minor: string;
  net_minor: string;
  entry_count: number;
}

export interface CategoryTotal {
  category_id: string | null;
  category_name: string;
  type: EntryType;
  total_minor: string;
  entry_count: number;
}

export interface QuickChip {
  category_id: string | null;
  category_name: string | null;
  party_id: string | null;
  party_name: string | null;
  amount_minor: string;
  account_id: string;
  note: string | null;
  uses: number;
}

export interface UserSettings {
  user_id: string;
  pin_hash: string | null;
  app_lock_enabled: boolean;
  default_business_id: string | null;
}

export interface WhatsappLink {
  id: string;
  business_id: string;
  user_id: string;
  phone_e164: string;
  linked_at: string;
}
