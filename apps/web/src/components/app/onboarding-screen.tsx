'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Money } from '@khata/shared';
import { useApp } from '@/components/providers';

import { Button } from '@/components/ui/button';
import { Label, TextField } from '@/components/ui/field';

const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AED'] as const;

/** §4.2: three steps, no other fields, under 30 seconds. */
export function OnboardingScreen() {
  const t = useTranslations('onboarding');
  const router = useRouter();
  const queryClient = useQueryClient();
  const { repo } = useApp();

  const detectedLocale = typeof navigator !== 'undefined' ? navigator.language : 'en-IN';
  const detectedTimezone =
    typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'Asia/Kolkata';

  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState(detectedLocale.endsWith('IN') ? 'INR' : 'INR');
  const [locale, setLocale] = useState(detectedLocale || 'en-IN');
  const [balance, setBalance] = useState('');
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: async () => {
      const startingBalance = Money.parse(balance || '0', currency) ?? Money.fromMinor(0n, currency);
      if (!repo) throw new Error('Still starting up, try again in a moment');
      return repo.createBusiness({
        name: name.trim(),
        currency,
        locale,
        timezone: detectedTimezone || 'Asia/Kolkata',
        startingBalanceMinor: startingBalance.minor.toString(),
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries();
      router.replace('/');
    },
    onError: (err: Error) => setError(err.message),
  });

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center gap-4 p-6">
      <p className="text-label text-muted">{t('step', { current: step + 1, total: 3 })}</p>

      {step === 0 && (
        <>
          <h1 className="text-body font-semibold">{t('nameTitle')}</h1>
          <TextField
            autoFocus
            data-testid="business-name"
            placeholder={t('namePlaceholder')}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Button
            variant="primary"
            size="lg"
            data-testid="onboarding-next"
            disabled={name.trim().length === 0}
            onClick={() => setStep(1)}
          >
            {t('next')}
          </Button>
        </>
      )}

      {step === 1 && (
        <>
          <h1 className="text-body font-semibold">{t('currencyTitle')}</h1>
          <div className="flex flex-wrap gap-2" role="group" aria-label={t('currencyTitle')}>
            {CURRENCIES.map((code) => (
              <button
                key={code}
                type="button"
                data-testid={`currency-${code}`}
                aria-pressed={currency === code}
                onClick={() => setCurrency(code)}
                className={'chip' + (currency === code ? ' chip-selected' : '')}
              >
                {code}
              </button>
            ))}
          </div>
          <div>
            <Label htmlFor="locale">Number format</Label>
            <TextField id="locale" value={locale} onChange={(e) => setLocale(e.target.value)} />
            <p className="mt-1 text-label text-muted">
              Example: {Money.fromMinor(12345600n, currency).format(locale || 'en-IN')}
            </p>
          </div>
          <Button variant="primary" size="lg" data-testid="onboarding-next" onClick={() => setStep(2)}>
            {t('next')}
          </Button>
        </>
      )}

      {step === 2 && (
        <>
          <h1 className="text-body font-semibold">{t('balanceTitle')}</h1>
          <TextField
            autoFocus
            data-testid="starting-balance"
            inputMode="decimal"
            placeholder="0"
            value={balance}
            onChange={(e) => setBalance(e.target.value)}
          />
          <p className="text-label text-muted">{t('balanceHint')}</p>
          {error && (
            <p role="alert" className="text-label text-expense">
              {error}
            </p>
          )}
          <Button
            variant="primary"
            size="lg"
            data-testid="onboarding-finish"
            disabled={!repo || create.isPending}
            onClick={() => create.mutate()}
          >
            {t('finish')}
          </Button>
        </>
      )}
    </main>
  );
}
