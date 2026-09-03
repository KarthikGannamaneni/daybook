/**
 * Amount extraction. Everything here is integer/bigint arithmetic; a money value
 * never passes through a JS float.
 */

/** Multiplier words that may follow the number as a separate token: "2 lakh". */
export const MULTIPLIER_WORDS: Record<string, bigint> = {
  k: 1000n,
  lac: 100000n,
  lakh: 100000n,
  lakhs: 100000n,
};

export interface AmountCandidate {
  /** Value in minor units. */
  minor: bigint;
  /** Index of the token this came from. */
  index: number;
  /** true when the token carried a currency symbol, /-, k/lakh suffix, decimals or a sign. */
  explicit: boolean;
  /** '+' or '-' prefix, which also decides the entry type. */
  sign: '+' | '-' | null;
  /** Index of a trailing multiplier word token ("2 lakh"), when one was consumed. */
  multiplierIndex?: number;
}

const MULTIPLIERS: Record<string, bigint> = {
  k: 1000n,
  l: 100000n,
  lac: 100000n,
  lakh: 100000n,
  lakhs: 100000n,
};

const CURRENCY_PREFIX = /^(?:₹|rs\.?|inr|\$|€|£)/;
const CURRENCY_SUFFIX = /(?:\/-|₹|rs\.?|inr)$/;

/** Half-up division for positive bigints. */
export function roundDiv(numerator: bigint, denominator: bigint): bigint {
  return (numerator * 2n + denominator) / (denominator * 2n);
}

/**
 * Parses a single whitespace-delimited token as an amount.
 * Returns null when the token is not amount-shaped.
 */
export function parseAmountToken(raw: string, minorUnitDigits = 2): Omit<AmountCandidate, 'index'> | null {
  let token = raw.toLowerCase().trim();
  if (token === '') return null;

  let explicit = false;
  let sign: '+' | '-' | null = null;

  if (token.startsWith('+') || token.startsWith('-')) {
    sign = token[0] as '+' | '-';
    explicit = true;
    token = token.slice(1);
  }

  const withoutPrefix = token.replace(CURRENCY_PREFIX, '');
  if (withoutPrefix !== token) {
    explicit = true;
    token = withoutPrefix;
  }

  const withoutSuffix = token.replace(CURRENCY_SUFFIX, '');
  if (withoutSuffix !== token) {
    explicit = true;
    token = withoutSuffix;
  }

  const match = /^(\d[\d,]*)(?:\.(\d+))?(k|l|lac|lakh|lakhs)?$/.exec(token);
  if (!match) return null;

  const intPart = (match[1] ?? '').replace(/,/g, '');
  const fracPart = match[2] ?? '';
  const suffix = match[3];

  if (intPart === '') return null;
  if (fracPart !== '') explicit = true;

  let multiplier = 1n;
  if (suffix) {
    multiplier = MULTIPLIERS[suffix] ?? 1n;
    explicit = true;
  }

  // minor = digits * multiplier * 10^minorUnitDigits / 10^fracLen, rounded half-up.
  const digits = BigInt(intPart + fracPart);
  const scale = 10n ** BigInt(minorUnitDigits);
  const divisor = 10n ** BigInt(fracPart.length);
  const minor = roundDiv(digits * multiplier * scale, divisor);

  return { minor, explicit, sign };
}

/**
 * Picks the amount out of the remaining tokens.
 *
 * With more than one candidate we do not guess: a single explicitly-marked
 * candidate (₹, /-, k, decimals, +/-) wins, otherwise the message is ambiguous
 * and the sender is asked to resend. Guessing on a money path is worse than asking.
 */
export function selectAmount(
  candidates: AmountCandidate[],
): { ok: true; amount: AmountCandidate } | { ok: false; reason: 'no_amount' | 'ambiguous_amount' } {
  if (candidates.length === 0) return { ok: false, reason: 'no_amount' };
  if (candidates.length === 1) return { ok: true, amount: candidates[0]! };

  const explicit = candidates.filter((c) => c.explicit);
  if (explicit.length === 1) return { ok: true, amount: explicit[0]! };
  return { ok: false, reason: 'ambiguous_amount' };
}
