'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Fingerprint, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { useApp, useBusiness } from '@/components/providers';
import { useToast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { hasPlatformAuthenticator, registerPasskey } from '@/lib/security/passkey';

/** P1 #1: a passkey unlocks the app instead of a typed PIN, where the device supports it. */
export function PasskeySettings() {
  const t = useTranslations('passkeys');
  const { repo } = useBusiness();
  const { session } = useApp();
  const queryClient = useQueryClient();
  const { show } = useToast();
  const [supported, setSupported] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void hasPlatformAuthenticator().then(setSupported);
  }, []);

  const listQuery = useQuery({ queryKey: ['passkeys'], queryFn: () => repo.listPasskeys() });

  const add = useMutation({
    mutationFn: async () => {
      const label = session?.displayName ?? session?.phone ?? session?.email ?? 'Khata user';
      const created = await registerPasskey(session?.userId ?? 'user', label);
      await repo.savePasskey({
        credentialId: created.credentialId,
        publicKey: created.publicKey,
        deviceLabel: created.deviceLabel,
        transports: created.transports,
      });
      // A passkey is only useful as a lock if the lock is on.
      await repo.saveUserSettings({ app_lock_enabled: true });
    },
    onSuccess: async () => {
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ['passkeys'] });
      await queryClient.invalidateQueries({ queryKey: ['settings'] });
      show({ message: t('added'), durationMs: 2500 });
    },
    onError: (err: Error) => setError(err.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => repo.removePasskey(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['passkeys'] }),
  });

  const keys = listQuery.data ?? [];

  return (
    <section aria-label={t('title')}>
      <h2 className="text-label text-muted">{t('title')}</h2>
      <p className="mt-1 text-body text-muted">{t('hint')}</p>

      {supported === false ? (
        <p className="mt-2 text-body text-muted" data-testid="passkey-unsupported">
          {t('unavailable')}
        </p>
      ) : (
        <>
          {keys.length === 0 ? (
            <p className="mt-2 text-body text-muted">{t('none')}</p>
          ) : (
            <ul className="mt-2 divide-y divide-border" data-testid="passkey-list">
              {keys.map((k) => (
                <li key={k.id} className="flex items-center gap-2 py-2">
                  <Fingerprint className="h-4 w-4 text-muted" aria-hidden />
                  <span className="flex-1 truncate text-body">{k.device_label ?? 'Passkey'}</span>
                  <Button size="sm" variant="ghost" aria-label={t('remove')} onClick={() => remove.mutate(k.id)}>
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </Button>
                </li>
              ))}
            </ul>
          )}

          <Button
            variant="quiet"
            size="md"
            className="mt-2"
            data-testid="add-passkey"
            disabled={add.isPending || supported === null}
            onClick={() => add.mutate()}
          >
            <Fingerprint className="h-4 w-4" aria-hidden />
            {t('add')}
          </Button>
        </>
      )}

      {error && (
        <p role="alert" className="mt-2 text-label text-expense">
          {error}
        </p>
      )}
    </section>
  );
}
