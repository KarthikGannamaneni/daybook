import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

/** Anon key only. Every read and write is gated by RLS, never by this file (§6.4). */
export function getSupabaseBrowserClient(): SupabaseClient {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required. ' +
        'Set NEXT_PUBLIC_DEMO_MODE=1 to run without Supabase.',
    );
  }
  client = createBrowserClient(url, anonKey);
  return client;
}
