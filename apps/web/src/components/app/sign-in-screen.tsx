'use client';

import { useMutation } from '@tanstack/react-query';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { isDemoMode } from '@/lib/data';
import { useApp } from '@/components/providers';
import { Button } from '@/components/ui/button';
import { Label, TextField } from '@/components/ui/field';

/** §4.1: password-less. Phone OTP first, email magic code as the fallback. */
export function SignInScreen() {
  const t = useTranslations('auth');
  const router = useRouter();
  const queryClient = useQueryClient();
  const { repo } = useApp();

  const [channel, setChannel] = useState<'phone' | 'email'>('phone');
  const [identifier, setIdentifier] = useState('');
  const [token, setToken] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const request = useMutation({
    mutationFn: async () => {
      const value = identifier.trim();
      if (channel === 'phone' && !/^\+[1-9]\d{7,14}$/.test(value.replace(/[\s-]/g, ''))) {
        throw new Error('Enter the number with country code, like +919999900001');
      }
      if (channel === 'email' && !value.includes('@')) throw new Error('Enter a valid email');
      if (!repo) throw new Error('Still starting up, try again in a moment');
      await repo.requestOtp(
        channel === 'phone' ? { phone: value.replace(/[\s-]/g, '') } : { email: value },
      );
    },
    onSuccess: () => {
      setSent(true);
      setError(null);
    },
    onError: (err: Error) => setError(err.message),
  });

  const verify = useMutation({
    mutationFn: async () => {
      const value = identifier.trim().replace(/[\s-]/g, '');
      if (!repo) throw new Error('Still starting up, try again in a moment');
      return repo.verifyOtp(channel === 'phone' ? { phone: value, token } : { email: identifier.trim(), token });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries();
      router.replace('/');
    },
    onError: (err: Error) => setError(err.message),
  });

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center gap-4 p-6">
      <h1 className="text-body font-semibold">{t('title')}</h1>

      <div>
        <Label htmlFor="identifier">{channel === 'phone' ? t('phoneLabel') : t('emailLabel')}</Label>
        <TextField
          id="identifier"
          data-testid="identifier-input"
          autoFocus
          inputMode={channel === 'phone' ? 'tel' : 'email'}
          placeholder={channel === 'phone' ? t('phonePlaceholder') : 'you@example.com'}
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
        />
      </div>

      {sent && (
        <div>
          <Label htmlFor="otp">{t('codeLabel')}</Label>
          <TextField
            id="otp"
            data-testid="otp-input"
            inputMode="numeric"
            maxLength={6}
            autoFocus
            value={token}
            onChange={(e) => setToken(e.target.value.replace(/\D/g, ''))}
            className="tabular tracking-[0.3em]"
          />
          <p className="mt-1 text-label text-muted">{t('codeSent')}</p>
        </div>
      )}

      {error && (
        <p role="alert" className="text-label text-expense">
          {error}
        </p>
      )}

      <Button
        variant="primary"
        size="lg"
        data-testid={sent ? 'verify-otp' : 'send-code'}
        disabled={!repo || request.isPending || verify.isPending}
        onClick={() => (sent ? verify.mutate() : request.mutate())}
      >
        {sent ? t('verify') : t('sendCode')}
      </Button>

      <button
        type="button"
        className="text-label text-muted"
        onClick={() => {
          setChannel(channel === 'phone' ? 'email' : 'phone');
          setSent(false);
          setIdentifier('');
        }}
      >
        {channel === 'phone' ? t('useEmail') : t('usePhone')}
      </button>

      {isDemoMode() && (
        <p className="text-label text-muted">
          Demo mode. Try +919999900001 (owner) or +919999900003 (staff) with code 123456.
        </p>
      )}
    </main>
  );
}
