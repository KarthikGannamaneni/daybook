import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/*
 * Our type scale is named (text-label / text-body / text-amount). Without this
 * declaration tailwind-merge reads those as *colour* utilities and silently
 * drops the real colour class next to them — which is how a primary button
 * ends up with body-coloured text on an accent background.
 */
const twMerge = extendTailwindMerge({
  extend: { classGroups: { 'font-size': [{ text: ['label', 'body', 'amount'] }] } },
});

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Local calendar day (YYYY-MM-DD) in a given timezone. */
export function dayKey(date: Date | string, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(typeof date === 'string' ? new Date(date) : date);
}

export function monthKey(date: Date | string, timezone: string): string {
  return dayKey(date, timezone).slice(0, 7) + '-01';
}

export function addMonths(monthIso: string, delta: number): string {
  const [year, month] = monthIso.split('-').map(Number);
  const d = new Date(Date.UTC(year!, (month ?? 1) - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

export function formatMonthLabel(monthIso: string, locale: string): string {
  const [year, month] = monthIso.split('-').map(Number);
  // The month key is a calendar label, not an instant: format it in UTC, or a
  // browser west of Greenwich renders "2026-09-01" as August.
  return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(year!, (month ?? 1) - 1, 1)),
  );
}

export function formatTime(iso: string, locale: string, timezone: string): string {
  return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', timeZone: timezone }).format(
    new Date(iso),
  );
}

export function formatDayLabel(iso: string, locale: string, timezone: string): string {
  const today = dayKey(new Date(), timezone);
  const day = dayKey(iso, timezone);
  if (day === today) return 'Today';
  const yesterday = dayKey(new Date(Date.now() - 86400000), timezone);
  if (day === yesterday) return 'Yesterday';
  return new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short', timeZone: timezone }).format(
    new Date(iso),
  );
}

/** §6.2: a haptic tick on save, where the platform offers one. */
export function haptic(ms = 10): void {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate(ms);
    } catch {
      // Vibration is a nicety; a refusal must never break a save.
    }
  }
}

export function newClientId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}
