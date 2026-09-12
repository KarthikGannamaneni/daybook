'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, Check, X } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ATTACHMENT_TARGET_BYTES, DUPLICATE_WINDOW_MS, Money, currencySymbol } from '@khata/shared';
import type { EntryView, QuickChip } from '@khata/shared';
import { useApp, useBusiness } from '@/components/providers';
import { useToast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { invalidateLedger } from '@/lib/ledger-cache';
import { enqueue } from '@/lib/offline/queue';
import { cn, haptic, newClientId } from '@/lib/utils';

/**
 * The home screen composer (§4.3).
 *
 * Opens focused with the numeric keypad up, defaults everything it can from
 * this business's own history, and gets a repeat expense down to: tap chip,
 * tap Save.
 */
export function Composer({ onSaved }: { onSaved?: (entry: EntryView) => void }) {
  const t = useTranslations('composer');
  const tGst = useTranslations('gst');
  const { bootstrap, businessId, repo } = useBusiness();
  const { online } = useApp();
  const queryClient = useQueryClient();
  const { show } = useToast();
  const params = useSearchParams();

  const { currency, locale } = bootstrap.business;
  const amountRef = useRef<HTMLInputElement>(null);

  const [type, setType] = useState<'expense' | 'income'>('expense');
  const [amountText, setAmountText] = useState(params.get('amount') ?? '');
  const [note, setNote] = useState(params.get('note') ?? '');
  const [party, setParty] = useState(params.get('party') ?? '');
  const [accountId, setAccountId] = useState(bootstrap.defaultAccountId);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [attachment, setAttachment] = useState<Blob | null>(null);
  const [taxText, setTaxText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => setAccountId(bootstrap.defaultAccountId), [bootstrap.defaultAccountId]);

  const categories = useMemo(
    () => bootstrap.categories.filter((c) => c.type === type),
    [bootstrap.categories, type],
  );

  const chipsQuery = useQuery({
    queryKey: ['chips', businessId],
    queryFn: () => repo.getQuickChips(businessId),
  });

  const recentQuery = useQuery({
    queryKey: ['entries', businessId, 'recent'],
    queryFn: () => repo.listEntries(businessId, { limit: 5 }),
  });

  // §4.3: the category is predicted from this business's own history, shown as
  // a pre-selected chip that one tap replaces.
  useEffect(() => {
    let cancelled = false;
    const handle = setTimeout(async () => {
      const text = [note, party].filter(Boolean).join(' ');
      if (!text.trim()) return;
      const predicted = await repo.predictCategory(businessId, text, null);
      if (cancelled || !predicted) return;
      const match = categories.find((c) => c.id === predicted);
      if (match) setCategoryId((current) => current ?? match.id);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [note, party, businessId, repo, categories]);

  const applyChip = useCallback(
    (chip: QuickChip) => {
      haptic(6);
      setType('expense');
      setAmountText(Money.fromMinor(chip.amount_minor, currency).toMajorString());
      setCategoryId(chip.category_id);
      setAccountId(chip.account_id);
      setNote(chip.note ?? '');
      setParty(chip.party_name ?? '');
      setError(null);
    },
    [currency],
  );

  const reset = useCallback(() => {
    setAmountText('');
    setNote('');
    setParty('');
    setAttachment(null);
    setTaxText('');
    setCategoryId(null);
    setType('expense');
    amountRef.current?.focus();
  }, []);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const money = Money.parse(amountText, currency);
      if (!money || money.minor <= 0n) throw new Error(t('amountRequired'));

      // P1 #9: tax is part of the amount, so it can never exceed it.
      const tax = bootstrap.business.gst_enabled ? Money.parse(taxText || '0', currency) : null;
      if (tax && tax.minor > money.abs().minor) throw new Error('Tax cannot be more than the amount');

      const input = {
        clientId: newClientId(),
        businessId,
        type,
        amountMinor: money.abs().minor.toString(),
        accountId,
        categoryId,
        partyName: party.trim() || null,
        note: note.trim() || null,
        occurredAt: new Date().toISOString(),
        attachment,
        source: 'app' as const,
        taxAmountMinor: tax ? tax.abs().minor.toString() : '0',
      };

      // Offline: queue with the client_id already minted, so the retry is safe.
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        await enqueue(input);
        return null;
      }
      return repo.createEntry(input);
    },
    onSuccess: async (entry) => {
      haptic(10);
      reset();
      await invalidateLedger(queryClient);
      if (entry) onSaved?.(entry);
      else show({ message: 'Saved offline. It will sync when you reconnect.', durationMs: 3000 });
    },
    onError: (err: Error) => setError(err.message),
  });

  const attemptSave = useCallback(() => {
    setError(null);
    const money = Money.parse(amountText, currency);
    if (!money || money.minor <= 0n) {
      setError(t('amountRequired'));
      return;
    }

    // §4.3 duplicate detection: same amount and category within two minutes.
    const cutoff = Date.now() - DUPLICATE_WINDOW_MS;
    const clash = (recentQuery.data ?? []).some(
      (e) =>
        e.amount_minor === money.abs().minor.toString() &&
        e.category_id === categoryId &&
        new Date(e.created_at).getTime() > cutoff,
    );
    if (clash) {
      setDuplicate(true);
      return;
    }
    saveMutation.mutate();
  }, [amountText, currency, categoryId, recentQuery.data, saveMutation, t]);

  async function onPickFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    // Loaded on demand so the compressor never lands in the home-screen bundle.
    const { default: compress } = await import('browser-image-compression');
    const compressed = await compress(file, {
      maxSizeMB: ATTACHMENT_TARGET_BYTES / (1024 * 1024),
      maxWidthOrHeight: 1600,
      useWebWorker: true,
      fileType: 'image/jpeg',
    });
    setAttachment(compressed);
  }

  const symbol = currencySymbol(currency, locale);

  return (
    <section aria-label={t('amount')} className="card p-4">
      <div className="flex items-center justify-between gap-2">
        <div role="group" aria-label="Entry type" className="flex gap-1.5">
          {(['expense', 'income'] as const).map((option) => (
            <button
              key={option}
              type="button"
              data-testid={`type-${option}`}
              aria-pressed={type === option}
              onClick={() => {
                setType(option);
                setCategoryId(null);
              }}
              className={cn('chip', type === option && 'chip-selected')}
            >
              {t(option)}
            </button>
          ))}
        </div>
        {!online && <span className="text-label text-muted">Offline</span>}
      </div>

      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-amount text-muted" aria-hidden>
          {symbol}
        </span>
        <input
          ref={amountRef}
          autoFocus
          data-testid="amount-input"
          aria-label={t('amount')}
          inputMode="decimal"
          enterKeyHint="done"
          placeholder="0"
          value={amountText}
          onChange={(e) => setAmountText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') attemptSave();
          }}
          className="tabular w-full text-amount font-semibold placeholder:text-muted/50"
        />
      </div>

      {chipsQuery.data && chipsQuery.data.length > 0 && (
        <div className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1" aria-label={t('quickChips')}>
          {chipsQuery.data.map((chip) => (
            <button
              key={`${chip.category_id}-${chip.party_id}-${chip.amount_minor}`}
              type="button"
              data-testid="quick-chip"
              onClick={() => applyChip(chip)}
              className="chip shrink-0"
            >
              <span className="text-muted">{chip.note || chip.category_name || chip.party_name}</span>
              <span className="tabular font-semibold">
                {Money.fromMinor(chip.amount_minor, currency).formatCompact(locale)}
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1" aria-label={t('category')}>
        {categories.map((category) => (
          <button
            key={category.id}
            type="button"
            data-testid="category-chip"
            aria-pressed={categoryId === category.id}
            onClick={() => setCategoryId(categoryId === category.id ? null : category.id)}
            className={cn('chip shrink-0', categoryId === category.id && 'chip-selected')}
          >
            {category.name}
          </button>
        ))}
      </div>

      {bootstrap.accounts.length > 1 && (
        <div className="-mx-1 mt-2 flex gap-2 overflow-x-auto px-1 pb-1" aria-label={t('account')}>
          {bootstrap.accounts.map((account) => (
            <button
              key={account.id}
              type="button"
              data-testid="account-chip"
              aria-pressed={accountId === account.id}
              onClick={() => setAccountId(account.id)}
              className={cn('chip shrink-0', accountId === account.id && 'chip-selected')}
            >
              {account.name}
            </button>
          ))}
        </div>
      )}

      <div className="mt-3 grid gap-2">
        <input
          data-testid="note-input"
          aria-label={t('notePlaceholder')}
          placeholder={t('notePlaceholder')}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="h-11 w-full rounded-card border border-border px-3 text-body placeholder:text-muted"
        />
        <input
          data-testid="party-input"
          aria-label={t('partyPlaceholder')}
          placeholder={t('partyPlaceholder')}
          value={party}
          onChange={(e) => setParty(e.target.value)}
          list="party-suggestions"
          className="h-11 w-full rounded-card border border-border px-3 text-body placeholder:text-muted"
        />
        {bootstrap.business.gst_enabled && (
          <input
            data-testid="tax-input"
            aria-label={tGst('taxAmount')}
            placeholder={tGst('taxAmount')}
            inputMode="decimal"
            value={taxText}
            onChange={(e) => setTaxText(e.target.value)}
            className="h-11 w-full rounded-card border border-border px-3 text-body placeholder:text-muted"
          />
        )}
        <PartySuggestions />
      </div>

      {error && (
        <p role="alert" className="mt-2 text-label text-expense">
          {error}
        </p>
      )}

      <div className="mt-3 flex items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          aria-label={t('attach')}
          className="sr-only"
          data-testid="attachment-input"
          onChange={(e) => void onPickFile(e)}
        />
        <Button
          type="button"
          size="md"
          aria-label={t('attach')}
          onClick={() => fileRef.current?.click()}
          className="shrink-0"
        >
          {attachment ? <Check className="h-5 w-5 text-income" aria-hidden /> : <Camera className="h-5 w-5" aria-hidden />}
          <span className="text-label">{attachment ? t('attached') : t('attach')}</span>
        </Button>
        <Button
          type="button"
          variant="primary"
          size="lg"
          data-testid="save-entry"
          className="flex-1"
          disabled={saveMutation.isPending}
          onClick={attemptSave}
        >
          {t('save')}
        </Button>
      </div>

      <Sheet
        open={duplicate}
        onOpenChange={setDuplicate}
        title={t('duplicateTitle')}
        description={t('duplicateBody')}
      >
        <div className="flex gap-2">
          <Button
            variant="quiet"
            size="lg"
            className="flex-1"
            onClick={() => setDuplicate(false)}
          >
            <X className="h-4 w-4" aria-hidden />
            Cancel
          </Button>
          <Button
            variant="primary"
            size="lg"
            className="flex-1"
            data-testid="duplicate-confirm"
            onClick={() => {
              setDuplicate(false);
              saveMutation.mutate();
            }}
          >
            {t('duplicateConfirm')}
          </Button>
        </div>
      </Sheet>
    </section>
  );
}

/** Autocomplete source for the party field; cheap enough to keep always-loaded. */
function PartySuggestions() {
  const { businessId, repo } = useBusiness();
  const { data } = useQuery({ queryKey: ['parties', businessId], queryFn: () => repo.listParties(businessId) });
  return (
    <datalist id="party-suggestions">
      {(data ?? []).map((party) => (
        <option key={party.id} value={party.name} />
      ))}
    </datalist>
  );
}
