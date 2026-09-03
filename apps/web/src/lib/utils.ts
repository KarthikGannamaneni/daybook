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

/** Wall-clock parts of an instant in a given IANA timezone. */
function zonedParts(at: Date, timezone: string): Record<string, number> {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at);
  const out: Record<string, number> = {};
  for (const p of parts) if (p.type !== 'literal') out[p.type] = Number(p.value);
  out.hour = (out.hour ?? 0) % 24; // some ICU builds render midnight as 24.
  return out;
}

/**
 * The instant at which a calendar day begins in a given timezone.
 *
 * Totals are bucketed by the business's local day (see v_daily_totals), so any
 * query that drills into a bucket has to use the same boundary. Filtering by
 * UTC midnight instead silently drops entries near the edges — in IST that is
 * everything between 18:30 and midnight.
 */
export function zonedDayStart(dayIso: string, timezone: string): string {
  const [year, month, day] = dayIso.split('-').map(Number);
  const guess = Date.UTC(year!, (month ?? 1) - 1, day ?? 1, 0, 0, 0);
  const p = zonedParts(new Date(guess), timezone);
  const asIfUtc = Date.UTC(p.year!, (p.month ?? 1) - 1, p.day ?? 1, p.hour ?? 0, p.minute ?? 0, p.second ?? 0);
  return new Date(guess - (asIfUtc - guess)).toISOString();
}

/** The last instant of a calendar day in a given timezone. */
export function zonedDayEnd(dayIso: string, timezone: string): string {
  const nextDay = new Date(zonedDayStart(dayIso, timezone));
  return new Date(nextDay.getTime() + 86400000 - 1).toISOString();
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
