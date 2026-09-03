'use client';

import { useMutation } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { useBusiness } from '@/components/providers';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';

/**
 * §4.1: a 30-day session is convenient, but it should not be enough on its own
 * to export the whole ledger or unlink a phone. Those actions re-send an OTP to
 * the identity already on the session and wait for it here.
 */
export function ReauthSheet({
  open,
  onOpenChange,
  onConfirmed,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirmed: () => void;
}) {
  const t = useTranslations('settings');
  const tAuth = useTranslations('auth');
  const { repo } = useBusiness();
  const [token, setToken] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setToken('');
      setError(null);
      return;
    }
    void repo.requestReauth().catch((err: Error) => setError(err.message));
  }, [open, repo]);

  const confirm = useMutation({
    mutationFn: () => repo.reauthenticate(token),
    onSuccess: () => {
      onOpenChange(false);
      onConfirmed();
    },
    onError: (err: Error) => setError(err.message),
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={t('reauth')} description={t('reauthHint')}>
      <input
        autoFocus
        inputMode="numeric"
        maxLength={6}
        aria-label={tAuth('codeLabel')}
        data-testid="reauth-input"
        value={token}
        onChange={(e) => setToken(e.target.value.replace(/\D/g, ''))}
        className="tabular h-14 w-full rounded-card border border-border bg-surface text-center text-amount tracking-[0.3em]"
      />
      {error && (
        <p role="alert" className="mt-2 text-label text-expense">
          {error}
        </p>
      )}
      <Button
        variant="primary"
        size="lg"
        className="mt-4 w-full"
        data-testid="reauth-confirm"
        disabled={token.length < 6 || confirm.isPending}
        onClick={() => confirm.mutate()}
      >
        {tAuth('verify')}
      </Button>
    </Sheet>
  );
}
