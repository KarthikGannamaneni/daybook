import type { PlainDate } from './types.ts';

const MONTHS: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export function toPlainDate(d: Date): PlainDate {
  return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() };
}

export function shiftDays(now: Date, delta: number): PlainDate {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + delta);
  return toPlainDate(d);
}

function isValidDay(month: number, day: number): boolean {
  return day >= 1 && month >= 1 && month <= 12 && day <= (DAYS_IN_MONTH[month - 1] ?? 31);
}

/** Strips 1st/2nd/3rd/4th style ordinal suffixes. */
function ordinalToNumber(token: string): number | null {
  const m = /^(\d{1,2})(?:st|nd|rd|th)?$/.exec(token);
  if (!m) return null;
  return Number(m[1]);
}

function normaliseYear(year: number): number {
  if (year >= 1000) return year;
  return year < 70 ? 2000 + year : 1900 + year;
}

/**
 * Resolves a day/month without a year against "now": a date that would be in the
 * future belongs to an earlier year, because people record what already happened.
 * Walking back also lands 29 February on the nearest leap year.
 */
function resolveYear(now: Date, month: number, day: number, explicitYear?: number): number {
  if (explicitYear !== undefined) return explicitYear;
  let year = now.getFullYear();
  for (let attempt = 0; attempt < 8; attempt++) {
    const candidate = new Date(year, month - 1, day, 23, 59, 59);
    const exists = candidate.getMonth() === month - 1 && candidate.getDate() === day;
    if (exists && candidate.getTime() <= now.getTime()) return year;
    year -= 1;
  }
  return now.getFullYear();
}

export interface DateMatch {
  date: PlainDate;
  /** Token indices consumed by the date expression. */
  consumed: number[];
}

/**
 * Finds a date expression in the token list. Only the first match is used; the
 * grammar is intentionally small and every shape has a test row.
 */
export function extractDate(tokens: string[], now: Date): DateMatch | null {
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i] ?? '';

    if (t === 'today' || t === 'aaj') {
      return { date: shiftDays(now, 0), consumed: [i] };
    }
    if (t === 'yesterday' || t === 'ystd' || t === 'yday') {
      return { date: shiftDays(now, -1), consumed: [i] };
    }
    if (t === 'day' && tokens[i + 1] === 'before' && tokens[i + 2] === 'yesterday') {
      return { date: shiftDays(now, -2), consumed: [i, i + 1, i + 2] };
    }

    // 3/9, 3-9-2026, 03/09/26  (day first, Indian convention)
    const slash = /^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/.exec(t);
    if (slash) {
      const day = Number(slash[1]);
      const month = Number(slash[2]);
      if (isValidDay(month, day)) {
        const year =
          slash[3] !== undefined
            ? normaliseYear(Number(slash[3]))
            : resolveYear(now, month, day);
        return { date: { year, month, day }, consumed: [i] };
      }
    }

    // "3 sep", "3rd sept 2025", "sep 3"
    const asDay = ordinalToNumber(t);
    const nextRaw = tokens[i + 1] ?? '';
    const nextMonth = MONTHS[nextRaw.replace(/[.,]$/, '')];
    if (asDay !== null && nextMonth !== undefined && isValidDay(nextMonth, asDay)) {
      const consumed = [i, i + 1];
      const maybeYear = tokens[i + 2];
      let year: number | undefined;
      if (maybeYear !== undefined && /^\d{4}$/.test(maybeYear)) {
        year = Number(maybeYear);
        consumed.push(i + 2);
      }
      if (i > 0 && tokens[i - 1] === 'on') consumed.unshift(i - 1);
      return { date: { year: resolveYear(now, nextMonth, asDay, year), month: nextMonth, day: asDay }, consumed };
    }

    const monthFirst = MONTHS[t.replace(/[.,]$/, '')];
    const dayAfter = ordinalToNumber(nextRaw);
    if (monthFirst !== undefined && dayAfter !== null && isValidDay(monthFirst, dayAfter)) {
      const consumed = [i, i + 1];
      if (i > 0 && tokens[i - 1] === 'on') consumed.unshift(i - 1);
      return {
        date: { year: resolveYear(now, monthFirst, dayAfter), month: monthFirst, day: dayAfter },
        consumed,
      };
    }
  }
  return null;
}
