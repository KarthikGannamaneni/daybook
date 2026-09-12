import { Money, type CategoryTotal, type EntryView } from '@khata/shared';

/**
 * P1 #6: the monthly PDF statement an owner sends to their accountant.
 *
 * jsPDF is imported dynamically at call time — it is roughly 350 KB and nothing
 * on the home screen needs it (§10.6).
 */

export interface StatementInput {
  businessName: string;
  monthLabel: string;
  currency: string;
  locale: string;
  timezone: string;
  totals: { incomeMinor: string; expenseMinor: string; netMinor: string; entryCount: number };
  categories: CategoryTotal[];
  entries: EntryView[];
}

export async function buildMonthlyStatement(input: StatementInput): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });

  const money = (minor: string) => Money.fromMinor(minor, input.currency).toMajorString();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 40;
  let y = margin;

  const line = (text: string, size = 10, bold = false, indent = 0) => {
    if (y > pageHeight - margin) {
      doc.addPage();
      y = margin;
    }
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    doc.text(text, margin + indent, y);
    y += size + 6;
  };

  const rightText = (text: string, atY: number, size = 10) => {
    doc.setFontSize(size);
    doc.text(text, pageWidth - margin, atY, { align: 'right' });
  };

  // --- header ---------------------------------------------------------------
  line(input.businessName, 18, true);
  line(`Statement for ${input.monthLabel}`, 11);
  line(`Amounts in ${input.currency}. Generated ${new Date().toISOString().slice(0, 10)}.`, 8);
  y += 8;

  // --- summary --------------------------------------------------------------
  line('Summary', 12, true);
  const summaryRows: Array<[string, string]> = [
    ['Income', money(input.totals.incomeMinor)],
    ['Expense', money(input.totals.expenseMinor)],
    ['Net', money(input.totals.netMinor)],
    ['Entries', String(input.totals.entryCount)],
  ];
  for (const [label, value] of summaryRows) {
    const rowY = y;
    line(label, 10, false, 8);
    rightText(value, rowY);
  }
  y += 8;

  // --- by category ----------------------------------------------------------
  if (input.categories.length > 0) {
    line('By category', 12, true);
    for (const c of input.categories) {
      const rowY = y;
      line(`${c.category_name} (${c.type})`, 10, false, 8);
      rightText(money(c.total_minor), rowY);
    }
    y += 8;
  }

  // --- entries --------------------------------------------------------------
  line('Entries', 12, true);
  const dateFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: input.timezone });

  const headerY = y;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('Date', margin, headerY);
  doc.text('Details', margin + 70, headerY);
  doc.text('Account', margin + 300, headerY);
  rightText('Amount', headerY, 9);
  y += 16;
  doc.setDrawColor(200);
  doc.line(margin, y - 10, pageWidth - margin, y - 10);

  doc.setFont('helvetica', 'normal');
  for (const entry of input.entries) {
    if (y > pageHeight - margin) {
      doc.addPage();
      y = margin;
    }
    const rowY = y;
    doc.setFontSize(9);
    doc.text(dateFormatter.format(new Date(entry.occurred_at)), margin, rowY);

    const details = [entry.note, entry.category_name, entry.party_name].filter(Boolean).join(' · ');
    doc.text(doc.splitTextToSize(details || '—', 220)[0] ?? '—', margin + 70, rowY);
    doc.text(entry.account_name ?? '', margin + 300, rowY);
    rightText(`${entry.type === 'income' ? '+' : '-'}${money(entry.amount_minor)}`, rowY, 9);
    y += 14;
  }

  // --- footer ---------------------------------------------------------------
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    doc.setFontSize(8);
    doc.setTextColor(130);
    doc.text(
      `${input.businessName} · ${input.monthLabel} · page ${page} of ${pages}`,
      margin,
      pageHeight - 20,
    );
  }

  return doc.output('blob');
}
