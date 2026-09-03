import type { LedgerRepo } from './types.ts';

let repoPromise: Promise<LedgerRepo> | null = null;

export function isDemoMode(): boolean {
  return process.env.NEXT_PUBLIC_DEMO_MODE === '1';
}

/**
 * Resolves the one repository for this browser session.
 *
 * The implementations are loaded on demand so neither the Supabase client nor
 * the demo dataset lands in the home-screen bundle (§10.6): the composer paints
 * from the app shell, and the data layer arrives a tick later.
 */
export function loadRepo(): Promise<LedgerRepo> {
  if (!repoPromise) {
    repoPromise = isDemoMode()
      ? import('./demo-repo.ts').then((m) => new m.DemoRepo())
      : import('./supabase-repo.ts').then((m) => new m.SupabaseRepo());
  }
  return repoPromise;
}

export * from './types.ts';
export { maskPhone } from './phone.ts';
