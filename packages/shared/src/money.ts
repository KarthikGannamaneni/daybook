import { parseAmountToken } from '@khata/parser';

/**
 * Money as integer minor units on `bigint`.
 *
 * Rule from §9: no money value ever passes through a JS `number`. Construction,
 * arithmetic and comparison are exact; `number` appears only inside
 * `Intl.NumberFormat`, at the very last step before pixels.
 */

const MINOR_DIGITS: Record<string, number> = {
  JPY: 0,
  KRW: 0,
  VND: 0,
  CLP: 0,
  ISK: 0,
  KWD: 3,
  BHD: 3,
  OMR: 3,
  TND: 3,
};

export function minorDigitsFor(currency: string): number {
  return MINOR_DIGITS[currency.toUpperCase()] ?? 2;
}

export class Money {
  private constructor(
    readonly minor: bigint,
    readonly currency: string,
  ) {}

  static fromMinor(minor: bigint | string | number, currency = 'INR'): Money {
    return new Money(BigInt(minor), currency.toUpperCase());
  }

  /** Accepts "450", "450.50", 450 — never a float with more precision than the currency. */
  static fromMajor(major: string | number, currency = 'INR'): Money {
    const parsed = Money.parse(String(major), currency);
    if (!parsed) throw new Error(`Not a valid ${currency} amount: ${major}`);
    return parsed;
  }

  /**
   * Parses what a user typed: "1,20,000", "₹450", "1.5k", "450/-".
   * Returns null instead of throwing so callers can render a field error.
   */
  static parse(input: string, currency = 'INR'): Money | null {
    const trimmed = (input ?? '').trim();
    if (trimmed === '') return null;
    const token = trimmed.replace(/\s+/g, '');
    const parsed = parseAmountToken(token, minorDigitsFor(currency));
    if (!parsed) return null;
    const signed = parsed.sign === '-' ? -parsed.minor : parsed.minor;
    return new Money(signed, currency.toUpperCase());
  }

  get minorDigits(): number {
    return minorDigitsFor(this.currency);
  }

  private assertSameCurrency(other: Money): void {
    if (other.currency !== this.currency) {
      throw new Error(`Currency mismatch: ${this.currency} vs ${other.currency}`);
    }
  }

  add(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.minor + other.minor, this.currency);
  }

  subtract(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.minor - other.minor, this.currency);
  }

  negate(): Money {
    return new Money(-this.minor, this.currency);
  }

  abs(): Money {
    return new Money(this.minor < 0n ? -this.minor : this.minor, this.currency);
  }

  get isZero(): boolean {
    return this.minor === 0n;
  }

  get isNegative(): boolean {
    return this.minor < 0n;
  }

  compare(other: Money): -1 | 0 | 1 {
    this.assertSameCurrency(other);
    if (this.minor < other.minor) return -1;
    if (this.minor > other.minor) return 1;
    return 0;
  }

  /** Plain decimal string in major units: 45000 paise -> "450.00". */
  toMajorString(): string {
    const digits = this.minorDigits;
    const negative = this.minor < 0n;
    const abs = (negative ? -this.minor : this.minor).toString().padStart(digits + 1, '0');
    const whole = digits === 0 ? abs : abs.slice(0, abs.length - digits);
    const frac = digits === 0 ? '' : '.' + abs.slice(abs.length - digits);
    return (negative ? '-' : '') + whole + frac;
  }

  /** "₹1,23,456.00" for en-IN. Grouping comes from the locale, never from us. */
  format(locale = 'en-IN', options: Intl.NumberFormatOptions = {}): string {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: this.currency,
      minimumFractionDigits: this.minorDigits,
      maximumFractionDigits: this.minorDigits,
      ...options,
    }).format(Number(this.toMajorString()));
  }

  /** Same as format() but drops ".00" — used for the big amounts on the home screen. */
  formatCompact(locale = 'en-IN'): string {
    const hasFraction = this.minor % BigInt(10 ** this.minorDigits) !== 0n;
    return this.format(locale, hasFraction ? {} : { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }

  toJSON(): string {
    return this.minor.toString();
  }

  toString(): string {
    return `${this.currency} ${this.toMajorString()}`;
  }
}

/** Sums a list without ever leaving bigint. Client-side display only; §9 keeps real totals in SQL. */
export function sumMinor(values: Array<bigint | string>): bigint {
  return values.reduce<bigint>((acc, v) => acc + BigInt(v), 0n);
}

/** The currency symbol alone, for the composer's amount field prefix. */
export function currencySymbol(currency: string, locale = 'en-IN'): string {
  const parts = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).formatToParts(0);
  return parts.find((p) => p.type === 'currency')?.value ?? currency.toUpperCase();
}
