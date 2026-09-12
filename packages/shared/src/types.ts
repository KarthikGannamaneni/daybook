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
  /** P1 #9: GST fields only appear when the owner turns them on. India only. */
  gst_enabled?: boolean;
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
  /** P1 #9: tax portion *included in* amount_minor, never added on top. */
  tax_amount_minor?: string;
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

export type RecurrenceCadence = 'weekly' | 'monthly';

export interface RecurringEntry {
  id: string;
  business_id: string;
  type: EntryType;
  amount_minor: string;
  account_id: string;
  category_id: string | null;
  party_id: string | null;
  note: string | null;
  cadence: RecurrenceCadence;
  day_of_month: number | null;
  day_of_week: number | null;
  next_due_on: string;
  last_posted_on: string | null;
  is_active: boolean;
  created_by: string | null;
}

/** A recurring entry joined with the names the proposal card renders. */
export interface RecurringEntryView extends RecurringEntry {
  account_name: string;
  category_name: string | null;
  party_name: string | null;
}

export interface BudgetStatus {
  budget_id: string;
  business_id: string;
  category_id: string;
  category_name: string;
  budget_minor: string;
  spent_minor: string;
  remaining_minor: string;
  percent_used: number;
}

export interface MemberView {
  id: string;
  user_id: string;
  role: Role;
  /** Masked, per §6.4 — a member's full number is never shown to other members. */
  label: string;
  is_self: boolean;
}

export interface PasskeyView {
  id: string;
  credential_id: string;
  device_label: string | null;
  created_at: string;
  last_used_at: string | null;
}

export interface GstSummaryRow {
  business_id: string;
  month: string;
  type: EntryType;
  gross_minor: string;
  tax_minor: string;
  net_minor: string;
  entry_count: number;
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
