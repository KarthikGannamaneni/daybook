'use client';

import { FileText } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useBusiness } from '@/components/providers';
import { Button } from '@/components/ui/button';
import { buildMonthlyStatement } from '@/lib/statement';
import { addMonths, formatMonthLabel, zonedDayStart } from '@/lib/utils';

/** P1 #6: a month's summary and entries as a PDF, for sending to an accountant. */
export function StatementButton({ month }: { month: string }) {
  const t = useTranslations('statement');
  const { repo, businessId, bootstrap } = useBusiness();
  const { currency, locale, timezone, name } = bootstrap.business;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setBusy(true);
    setError(null);
    try {
      const from = zonedDayStart(month, timezone);
      const to = new Date(new Date(zonedDayStart(addMonths(month, 1), timezone)).getTime() - 1).toISOString();

      const [totals, categories, entries] = await Promise.all([
        repo.getMonthSummary(businessId, month),
        repo.getMonthCategoryTotals(businessId, month),
        repo.listEntries(businessId, { from, to }),
      ]);

      const blob = await buildMonthlyStatement({
        businessName: name,
        monthLabel: formatMonthLabel(month, locale),
        currency,
        locale,
        timezone,
        totals: {
          incomeMinor: totals.incomeMinor,
          expenseMinor: totals.expenseMinor,
          netMinor: totals.netMinor,
          entryCount: totals.entryCount,
        },
        categories,
        entries: [...entries].reverse(),
      });

      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${month.slice(0, 7)}.pdf`;
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
    <div>
      <Button variant="quiet" size="md" data-testid="download-statement" disabled={busy} onClick={() => void download()}>
        <FileText className="h-4 w-4" aria-hidden />
        {busy ? t('generating') : t('download')}
      </Button>
      {error && (
        <p role="alert" className="mt-2 text-label text-expense">
          {error}
        </p>
      )}
    </div>
  );
}
