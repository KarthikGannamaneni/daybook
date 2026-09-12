'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, LogOut, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { entriesToCsv } from '@khata/shared';
import { useApp, useBusiness } from '@/components/providers';
import { useToast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { Label, TextField } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import { isDemoMode } from '@/lib/data';
import { hashPin } from '@/lib/security/pin';
import { dayKey, zonedDayEnd, zonedDayStart } from '@/lib/utils';
import { BudgetSettings } from './budget-settings';
import { GstSettings } from './gst-settings';
import { MembersSettings, JoinBusiness } from './members-settings';
import { PasskeySettings } from './passkey-settings';
import { ReauthSheet } from './reauth-sheet';
import { RecurringSettings } from './recurring-settings';
import { TaxonomySettings } from './taxonomy-settings';

export function SettingsScreen() {
  const t = useTranslations('settings');
  const tAuth = useTranslations('auth');
  const router = useRouter();
  const queryClient = useQueryClient();
  const { repo, bootstrap, businessId } = useBusiness();
  const { session, settings } = useApp();
  const isOwner = bootstrap.role === 'owner';

  return (
    <div className="flex flex-col gap-6 pb-8">
      <section aria-label={t('business')}>
        <h2 className="text-label text-muted">{t('business')}</h2>
        <p className="mt-1 text-body font-semibold">{bootstrap.business.name}</p>
        <p className="text-label text-muted">
          {bootstrap.business.currency} · {bootstrap.business.locale} · {bootstrap.business.timezone}
        </p>
      </section>

      <AppLockSection />

      <PasskeySettings />

      <RecurringSettings />

      {isOwner && <BudgetSettings />}

      <TaxonomySettings />

      <MembersSettings />

      <JoinBusiness />

      {isOwner && <GstSettings />}

      {isOwner ? <WhatsappSection /> : null}

      {isOwner ? (
        <ExportSection />
      ) : (
        <section aria-label={t('export')}>
          <h2 className="text-label text-muted">{t('export')}</h2>
          <p className="mt-1 text-body text-muted" data-testid="export-owner-only">
            {t('ownerOnly')}
          </p>
        </section>
      )}

      <section aria-label={t('devices')}>
        <h2 className="text-label text-muted">{t('devices')}</h2>
        <p className="mt-1 text-body">
          {session?.phone ?? session?.email ?? 'Signed in'}
          {isDemoMode() ? ' · demo mode' : ''}
        </p>
        <Button
          variant="quiet"
          size="md"
          className="mt-2"
          data-testid="sign-out"
          onClick={async () => {
            await repo.signOut();
            queryClient.clear();
            router.replace('/sign-in');
          }}
        >
          <LogOut className="h-4 w-4" aria-hidden />
          {tAuth('signOut')}
        </Button>
      </section>

      <p className="text-label text-muted">
        Business id {businessId.slice(0, 8)} · lock {settings?.app_lock_enabled ? 'on' : 'off'}
      </p>
    </div>
  );
}

function AppLockSection() {
  const t = useTranslations('settings');
  const { repo } = useBusiness();
  const { settings } = useApp();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: async () => {
      if (!/^\d{4}$/.test(pin)) throw new Error('PIN must be exactly 4 digits');
      if (new Set(pin).size === 1) throw new Error('PIN cannot be four identical digits');
      await repo.saveUserSettings({ pin_hash: await hashPin(pin), app_lock_enabled: true });
    },
    onSuccess: async () => {
      setOpen(false);
      setPin('');
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
    onError: (err: Error) => setError(err.message),
  });

  const disable = useMutation({
    mutationFn: () => repo.saveUserSettings({ pin_hash: null, app_lock_enabled: false }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['settings'] }),
  });

  return (
    <section aria-label={t('appLock')}>
      <h2 className="text-label text-muted">{t('appLock')}</h2>
      <p className="mt-1 text-body text-muted">{t('appLockHint')}</p>
      <div className="mt-2 flex gap-2">
        <Button variant="quiet" size="md" data-testid="set-pin" onClick={() => setOpen(true)}>
          {settings?.app_lock_enabled ? t('changePin') : t('setPin')}
        </Button>
        {settings?.app_lock_enabled && (
          <Button variant="ghost" size="md" data-testid="remove-pin" onClick={() => disable.mutate()}>
            {t('removePin')}
          </Button>
        )}
      </div>

      <Sheet open={open} onOpenChange={setOpen} title={t('setPin')} description={t('appLockHint')}>
        <input
          autoFocus
          inputMode="numeric"
          maxLength={4}
          aria-label={t('setPin')}
          data-testid="pin-input"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
          className="tabular h-14 w-full rounded-card border border-border bg-surface text-center text-amount tracking-[0.4em]"
        />
        {error && (
          <p role="alert" className="mt-2 text-label text-expense">
            {error}
          </p>
        )}
        <Button variant="primary" size="lg" className="mt-4 w-full" data-testid="pin-save" onClick={() => save.mutate()}>
          {t('setPin')}
        </Button>
      </Sheet>
    </section>
  );
}

function WhatsappSection() {
  const t = useTranslations('settings');
  const { repo, businessId } = useBusiness();
  const queryClient = useQueryClient();
  const { show } = useToast();
  const [code, setCode] = useState<string | null>(null);
  const [pendingUnlink, setPendingUnlink] = useState<string | null>(null);

  const linksQuery = useQuery({ queryKey: ['wa-links', businessId], queryFn: () => repo.listLinks(businessId) });

  const generate = useMutation({
    mutationFn: () => repo.createLinkCode(businessId),
    onSuccess: (result) => setCode(result.code),
  });

  const unlink = useMutation({
    mutationFn: (id: string) => repo.unlink(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['wa-links', businessId] }),
  });

  return (
    <section aria-label={t('whatsapp')}>
      <h2 className="text-label text-muted">{t('whatsapp')}</h2>
      <p className="mt-1 text-body text-muted">{t('whatsappHint')}</p>

      <div className="mt-2 flex items-center gap-2">
        <Button variant="quiet" size="md" data-testid="generate-link-code" onClick={() => generate.mutate()}>
          {t('generateCode')}
        </Button>
        {code && (
          <button
            type="button"
            data-testid="link-code"
            className="chip tabular font-semibold"
            onClick={() => {
              void navigator.clipboard?.writeText(code);
              show({ message: 'Code copied', durationMs: 2000 });
            }}
          >
            {code}
            <Copy className="h-3.5 w-3.5" aria-hidden />
          </button>
        )}
      </div>
      {code && <p className="mt-1 text-label text-muted">{t('codeExpires')}</p>}

      <h3 className="mt-4 text-label text-muted">{t('linkedNumbers')}</h3>
      <ul className="mt-1 divide-y divide-border" data-testid="linked-numbers">
        {(linksQuery.data ?? []).map((link) => (
          <li key={link.id} className="flex items-center justify-between py-2">
            {/* §6.4: other members' numbers are never shown in full. */}
            <span className="tabular text-body">{link.masked}</span>
            <Button
              variant="ghost"
              size="sm"
              aria-label={t('unlink')}
              data-testid="unlink-number"
              onClick={() => setPendingUnlink(link.id)}
            >
              <Trash2 className="h-4 w-4" aria-hidden />
            </Button>
          </li>
        ))}
        {(linksQuery.data ?? []).length === 0 && <li className="py-2 text-body text-muted">None yet.</li>}
      </ul>

      <ReauthSheet
        open={pendingUnlink !== null}
        onOpenChange={(open) => !open && setPendingUnlink(null)}
        onConfirmed={() => {
          if (pendingUnlink) unlink.mutate(pendingUnlink);
          setPendingUnlink(null);
        }}
      />
    </section>
  );
}

function ExportSection() {
  const t = useTranslations('settings');
  const { repo, businessId, bootstrap } = useBusiness();
  const { timezone, currency, locale } = bootstrap.business;
  const [from, setFrom] = useState(() => dayKey(new Date(Date.now() - 30 * 86400000), timezone));
  const [to, setTo] = useState(() => dayKey(new Date(), timezone));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  async function download() {
    setBusy(true);
    setError(null);
    try {
      // The range the user picked is calendar days in their own timezone.
      const entries = await repo.listEntries(businessId, {
        from: zonedDayStart(from, timezone),
        to: zonedDayEnd(to, timezone),
      });
      const csv = entriesToCsv(entries, { currency, locale, timezone });
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `khata-${from}-to-${to}.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label={t('export')}>
      <h2 className="text-label text-muted">{t('export')}</h2>
      <p className="mt-1 text-body text-muted">{t('exportHint')}</p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <div>
          <Label htmlFor="export-from">{t('from')}</Label>
          <TextField id="export-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="export-to">{t('to')}</Label>
          <TextField id="export-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-label text-expense">
          {error}
        </p>
      )}
      <Button
        variant="quiet"
        size="md"
        className="mt-2"
        data-testid="export-csv"
        disabled={busy}
        onClick={() => setConfirming(true)}
      >
        {t('download')}
      </Button>

      {/* §4.1: exporting the whole ledger re-verifies the person, not the session. */}
      <ReauthSheet
        open={confirming}
        onOpenChange={setConfirming}
        onConfirmed={() => void download()}
      />
    </section>
  );
}
