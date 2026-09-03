'use client';

import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { UserSettings } from '@khata/shared';
import { isDemoMode, loadRepo, type Bootstrap, type BusinessSummary, type LedgerRepo, type Session } from '@/lib/data';
import { flushQueue, onQueueChange } from '@/lib/offline/queue';
import { ToastProvider } from './toast';

const BUSINESS_KEY = 'khata.business';

interface AppContextValue {
  /** null until the data layer's chunk has loaded. */
  repo: LedgerRepo | null;
  session: Session | null | undefined;
  businesses: BusinessSummary[];
  businessId: string | null;
  setBusinessId: (id: string) => void;
  bootstrap: Bootstrap | undefined;
  /** Set when the business could not be loaded, so the shell can say so. */
  bootstrapError: Error | null;
  settings: UserSettings | null | undefined;
  pendingSync: number;
  online: boolean;
  isLoading: boolean;
}

const AppContext = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside Providers');
  return ctx;
}

/** The current business, guaranteed non-null. Use inside the authenticated shell. */
export function useBusiness(): { bootstrap: Bootstrap; businessId: string; repo: LedgerRepo } {
  const { bootstrap, businessId, repo } = useApp();
  if (!bootstrap || !businessId || !repo) throw new Error('No business loaded');
  return { bootstrap, businessId, repo };
}

function AppProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [repo, setRepo] = useState<LedgerRepo | null>(null);
  useEffect(() => {
    let cancelled = false;
    void loadRepo().then((loaded) => {
      if (!cancelled) setRepo(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const [businessId, setBusinessIdState] = useState<string | null>(null);
  const [pendingSync, setPendingSync] = useState(0);
  const [online, setOnline] = useState(true);

  const sessionQuery = useQuery({
    queryKey: ['session'],
    queryFn: () => repo!.getSession(),
    enabled: Boolean(repo),
    staleTime: 30_000,
  });
  const businessesQuery = useQuery({
    queryKey: ['businesses', sessionQuery.data?.userId],
    queryFn: () => repo!.listBusinesses(),
    enabled: Boolean(repo && sessionQuery.data),
  });
  const settingsQuery = useQuery({
    queryKey: ['settings', sessionQuery.data?.userId],
    queryFn: () => repo!.getUserSettings(),
    enabled: Boolean(repo && sessionQuery.data),
  });

  // Pick the business once: stored choice, then the user's default, then the first.
  useEffect(() => {
    const list = businessesQuery.data;
    if (!list || list.length === 0) return;
    const stored = typeof window !== 'undefined' ? window.localStorage.getItem(BUSINESS_KEY) : null;
    const preferred = settingsQuery.data?.default_business_id ?? null;
    const chosen =
      list.find((b) => b.id === stored)?.id ?? list.find((b) => b.id === preferred)?.id ?? list[0]!.id;
    setBusinessIdState((current) => current ?? chosen);
  }, [businessesQuery.data, settingsQuery.data]);

  const bootstrapQuery = useQuery({
    queryKey: ['bootstrap', businessId],
    queryFn: () => repo!.getBootstrap(businessId!),
    enabled: Boolean(repo && businessId),
  });

  // Realtime: a WhatsApp entry has to appear without a reload (§10.4 scenario 7).
  useEffect(() => {
    if (!repo || !businessId) return;
    return repo.subscribeEntries(businessId, () => {
      void queryClient.invalidateQueries({ queryKey: ['entries'] });
      void queryClient.invalidateQueries({ queryKey: ['totals'] });
    });
  }, [repo, businessId, queryClient]);

  // Offline queue: drain on reconnect, and show the pill while anything waits.
  useEffect(() => {
    if (!repo) return;
    const unsubscribe = onQueueChange(setPendingSync);
    const update = () => setOnline(navigator.onLine);
    update();

    const sync = async () => {
      update();
      if (!navigator.onLine) return;
      const result = await flushQueue(repo);
      if (result.synced > 0) {
        await queryClient.invalidateQueries({ queryKey: ['entries'] });
        await queryClient.invalidateQueries({ queryKey: ['totals'] });
      }
    };

    window.addEventListener('online', sync);
    window.addEventListener('offline', update);
    void sync();
    return () => {
      unsubscribe();
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', update);
    };
  }, [repo, queryClient]);

  // Demo mode exposes the inbound-WhatsApp path to the e2e suite. It runs the
  // real parser and the real repository, so scenario 7 exercises the same code
  // the edge function does — only the transport is skipped.
  useEffect(() => {
    if (!repo || !isDemoMode() || !businessId || typeof window === 'undefined') return;
    (window as unknown as Record<string, unknown>).__khataDemo = {
      simulateInbound: async (body: string, phone = '+919999900001') => {
        const id = await repo.simulateInbound?.(businessId, phone, body);
        await queryClient.invalidateQueries({ queryKey: ['entries'] });
        await queryClient.invalidateQueries({ queryKey: ['totals'] });
        return id ?? null;
      },
    };
    return () => {
      delete (window as unknown as Record<string, unknown>).__khataDemo;
    };
  }, [repo, businessId, queryClient]);

  // The service worker caches the shell and the last 30 days for offline viewing.
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    if (process.env.NODE_ENV !== 'production') return;
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // An unavailable service worker degrades offline support, nothing more.
    });
  }, []);

  const value: AppContextValue = {
    repo,
    session: sessionQuery.data,
    businesses: businessesQuery.data ?? [],
    businessId,
    setBusinessId: (id) => {
      window.localStorage.setItem(BUSINESS_KEY, id);
      setBusinessIdState(id);
    },
    bootstrap: bootstrapQuery.data,
    bootstrapError: (bootstrapQuery.error as Error | null) ?? null,
    settings: settingsQuery.data,
    pendingSync,
    online,
    isLoading: !repo || sessionQuery.isLoading || businessesQuery.isLoading,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 15_000,
            retry: isDemoMode() ? 0 : 2,
            refetchOnWindowFocus: false,
            // Reads are answered from the local store or the service-worker
            // cache, so they must not be parked when the browser is offline.
            networkMode: 'always',
          },
          // Writes decide for themselves: the composer queues to IndexedDB when
          // offline rather than leaving a mutation suspended forever.
          mutations: { networkMode: 'always' },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AppProvider>
        <ToastProvider>{children}</ToastProvider>
      </AppProvider>
    </QueryClientProvider>
  );
}
