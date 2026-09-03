/**
 * Formatting for outbound WhatsApp text. Kept tiny and dependency-free: the
 * webhook has a 2-second budget and must not pull the app's bundle into Deno.
 */

export function formatMinor(minor: bigint | string, currency = 'INR', locale = 'en-IN'): string {
  const value = BigInt(minor);
  const digits = currency === 'JPY' || currency === 'KRW' ? 0 : 2;
  const negative = value < 0n;
  const abs = (negative ? -value : value).toString().padStart(digits + 1, '0');
  const major = digits === 0 ? abs : `${abs.slice(0, abs.length - digits)}.${abs.slice(abs.length - digits)}`;
  const formatted = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  }).format(Number(major));
  return negative ? `-${formatted}` : formatted;
}

/** ISO date in the business timezone, which is what "today" means to the user. */
export function localDate(at: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
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
 * A Date whose *system-local* components equal the business's wall clock.
 *
 * The parser resolves "yesterday" against the local components of the `now` it
 * is given, and the edge runtime is UTC while the shop is in IST. Handing it
 * this shifted value is what makes "yesterday" mean yesterday in the shop.
 */
export function businessNow(at: Date, timezone: string): Date {
  const p = zonedParts(at, timezone);
  return new Date(p.year!, (p.month ?? 1) - 1, p.day ?? 1, p.hour ?? 0, p.minute ?? 0, p.second ?? 0);
}

/**
 * Turns a PlainDate from the parser into an instant at 12:00 in the business
 * timezone. Midday avoids every DST edge without needing a tz database.
 */
export function plainDateToInstant(
  date: { year: number; month: number; day: number },
  timezone: string,
): string {
  const guess = Date.UTC(date.year, date.month - 1, date.day, 12, 0, 0);
  const p = zonedParts(new Date(guess), timezone);
  const asIfUtc = Date.UTC(p.year!, (p.month ?? 1) - 1, p.day ?? 1, p.hour ?? 0, p.minute ?? 0, p.second ?? 0);
  return new Date(guess - (asIfUtc - guess)).toISOString();
}
