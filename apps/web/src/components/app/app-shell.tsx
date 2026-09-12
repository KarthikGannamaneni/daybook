'use client';

import { Lock, Search, Wallet, CalendarDays, CloudOff } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { useApp } from '@/components/providers';
import { cn } from '@/lib/utils';
import { AppLockGate } from './app-lock';
import { BusinessSwitcher } from './business-switcher';
import { ComposerSkeleton } from './composer-skeleton';

/**
 * The authenticated shell.
 *
 * §6.5: exactly three destinations in the bottom bar — Today, Month, Search.
 * Settings lives behind the avatar. There is no "More" tab.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const t = useTranslations('app');
  const router = useRouter();
  const pathname = usePathname();
  const { session, businesses, bootstrap, bootstrapError, isLoading, pendingSync, online, settings } = useApp();

  useEffect(() => {
    if (isLoading) return;
    if (session === null) router.replace('/sign-in');
    else if (session && businesses.length === 0) router.replace('/onboarding');
  }, [isLoading, session, businesses, router]);

  // §4.7: "cached for offline viewing" has to mean the other tabs too. Next
  // prefetches links in the viewport on its own, but only eventually — warming
  // them once the app is idle is what makes Month and Search readable after the
  // connection drops, rather than leaving it to a race.
  useEffect(() => {
    if (!bootstrap) return;
    const warm = () => {
      router.prefetch('/month');
      router.prefetch('/search');
      router.prefetch('/settings');
    };
    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      const handle = window.requestIdleCallback(warm, { timeout: 2000 });
      return () => window.cancelIdleCallback(handle);
    }
    const handle = setTimeout(warm, 300);
    return () => clearTimeout(handle);
  }, [bootstrap, router]);

  if (bootstrapError) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center gap-3 p-6">
        <h1 className="text-body font-semibold">This ledger could not be loaded.</h1>
        <p role="alert" className="text-label text-muted">
          {bootstrapError.message}
        </p>
        <button type="button" className="chip self-start" onClick={() => window.location.reload()}>
          Try again
        </button>
      </main>
    );
  }

  if (isLoading || !session || !bootstrap) {
    return <ComposerSkeleton />;
  }

  const tabs = [
    { href: '/', label: t('today'), icon: Wallet },
    { href: '/month', label: t('month'), icon: CalendarDays },
    { href: '/search', label: t('search'), icon: Search },
  ];

  return (
    <AppLockGate>
      <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col">
        <header className="flex items-center justify-between gap-3 px-4 pb-2 pt-[calc(env(safe-area-inset-top)+0.75rem)]">
          <BusinessSwitcher name={bootstrap.business.name} role={bootstrap.role} />
          <div className="flex items-center gap-2">
            {settings?.app_lock_enabled && (
              <Lock aria-label={t('locked')} className="h-4 w-4 text-muted" data-testid="lock-indicator" />
            )}
            {!online && <CloudOff aria-label="Offline" className="h-4 w-4 text-muted" data-testid="offline-indicator" />}
            <Link
              href="/settings"
              aria-label={t('settings')}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface text-label font-semibold"
            >
              {(session.displayName ?? session.phone ?? 'K').slice(-2).toUpperCase()}
            </Link>
          </div>
        </header>

        {pendingSync > 0 && (
          <div
            data-testid="sync-pill"
            className="mx-4 mb-2 rounded-chip border border-border bg-surface px-3 py-1.5 text-label text-muted"
          >
            {pendingSync === 1 ? '1 entry waiting to sync' : `${pendingSync} entries waiting to sync`}
          </div>
        )}

        <main className="flex-1 px-4 pb-28">{children}</main>

        <nav
          aria-label="Primary"
          className="fixed inset-x-0 bottom-0 z-40 mx-auto flex w-full max-w-lg justify-around border-t border-border bg-bg/95 pb-[calc(env(safe-area-inset-bottom)+0.25rem)] pt-2 backdrop-blur"
        >
          {tabs.map((tab) => {
            const active = pathname === tab.href;
            const Icon = tab.icon;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-w-20 flex-col items-center gap-0.5 rounded-card px-3 py-1 text-label',
                  active ? 'text-accent' : 'text-muted',
                )}
              >
                <Icon className="h-5 w-5" aria-hidden />
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </AppLockGate>
  );
}
