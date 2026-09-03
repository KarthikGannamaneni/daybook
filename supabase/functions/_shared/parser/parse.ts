// GENERATED FILE — do not edit.
// Mirrored from packages/parser/src by scripts/sync-parser.mjs.
// Edit the source there, then run `pnpm sync:parser`.

import { MULTIPLIER_WORDS, parseAmountToken, selectAmount, type AmountCandidate } from './amount.ts';
import { extractDate } from './date.ts';
import {
  ACCOUNT_KEYWORDS,
  CATEGORY_KEYWORDS,
  EXPENSE_MARKERS,
  FILLER_WORDS,
  INCOME_MARKERS,
  categoryMatchesType,
} from './keywords.ts';
import type {
  AccountKind,
  EntryType,
  ParseOptions,
  ParseResult,
  ParsedCommandName,
} from './types.ts';

const COMMANDS: Record<string, ParsedCommandName> = {
  undo: 'undo',
  today: 'today',
  month: 'month',
  'this month': 'month',
};

/** Account words safe to detect anywhere; the rest need a trailing position or a preposition. */
const STRONG_ACCOUNT_WORDS = new Set(['upi', 'gpay', 'googlepay', 'phonepe', 'paytm', 'bhim', 'neft', 'imps', 'rtgs', 'cheque']);
const ACCOUNT_PREPOSITIONS = new Set(['via', 'by', 'through', 'thru', 'in']);
const PARTY_PREPOSITIONS = new Set(['from', 'to']);

const DEFAULT_MAX_AMOUNT_MINOR = 10n ** 13n; // 10 billion major units — a typo guard, not a limit.

/** Sorted longest-first so "bank charge" beats "bank" and "raw material" beats "material". */
const SORTED_CATEGORY_KEYWORDS = [...CATEGORY_KEYWORDS].sort((a, b) => b[0].length - a[0].length);

function titleCase(input: string): string {
  return input
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function trimFillers(tokens: string[]): string[] {
  let start = 0;
  let end = tokens.length;
  while (start < end && FILLER_WORDS.has((tokens[start] ?? '').toLowerCase())) start++;
  while (end > start && FILLER_WORDS.has((tokens[end - 1] ?? '').toLowerCase())) end--;
  return tokens.slice(start, end);
}

function matchCategory(text: string, type: EntryType): string | null {
  if (!text) return null;
  const haystack = ' ' + text.toLowerCase().replace(/[^\p{L}\p{N}&\s]/gu, ' ').replace(/\s+/g, ' ') + ' ';
  for (const [keyword, category] of SORTED_CATEGORY_KEYWORDS) {
    if (!categoryMatchesType(category, type)) continue;
    if (haystack.includes(' ' + keyword + ' ')) return category;
  }
  return null;
}

/**
 * Parses one inbound WhatsApp message.
 *
 * Deterministic by design (§13): every shape below is a rule with a test row, and an
 * unrecognised message fails loudly rather than being guessed into the ledger.
 */
export function parseMessage(input: string | null | undefined, opts: ParseOptions = {}): ParseResult {
  const now = opts.now ?? new Date();
  const minorUnitDigits = opts.minorUnitDigits ?? 2;
  const maxAmountMinor = opts.maxAmountMinor ?? DEFAULT_MAX_AMOUNT_MINOR;

  if (input == null) return { kind: 'unparsed', reason: 'empty' };
  const clean = input.replace(/\s+/g, ' ').trim();
  if (clean === '') return { kind: 'unparsed', reason: 'empty' };

  const commandKey = clean.toLowerCase().replace(/[!.?,]+$/g, '').trim();
  const command = COMMANDS[commandKey];
  if (command) return { kind: 'command', command };

  const origTokens = clean.split(' ');
  const lowerTokens = origTokens.map((t) => t.toLowerCase());
  const consumed = new Set<number>();

  // 1. Date override.
  const dateMatch = extractDate(lowerTokens, now);
  if (dateMatch) for (const i of dateMatch.consumed) consumed.add(i);

  // 2. Account override: trailing keyword, "via upi", or an unambiguous wallet name.
  let account: AccountKind | null = null;
  for (let i = lowerTokens.length - 1; i >= 0; i--) {
    if (consumed.has(i)) continue;
    const word = (lowerTokens[i] ?? '').replace(/[^a-z]/g, '');
    const kind = ACCOUNT_KEYWORDS[word];
    if (!kind) continue;
    const isLast = lowerTokens.slice(i + 1).every((_, k) => consumed.has(i + 1 + k));
    const prev = lowerTokens[i - 1];
    const afterPreposition = prev !== undefined && ACCOUNT_PREPOSITIONS.has(prev);
    if (isLast || afterPreposition || STRONG_ACCOUNT_WORDS.has(word)) {
      account = kind;
      consumed.add(i);
      if (afterPreposition) consumed.add(i - 1);
      break;
    }
  }

  // 3. Direction marker.
  let type: EntryType = 'expense';
  let hasDirectionMarker = false;
  let directionWord = '';
  for (let i = 0; i < lowerTokens.length; i++) {
    if (consumed.has(i)) continue;
    const word = (lowerTokens[i] ?? '').replace(/[^a-z]/g, '');
    if (INCOME_MARKERS.has(word)) {
      type = 'income';
      hasDirectionMarker = true;
      directionWord = word;
      consumed.add(i);
      break;
    }
    if (EXPENSE_MARKERS.has(word)) {
      type = 'expense';
      hasDirectionMarker = true;
      directionWord = word;
      consumed.add(i);
      break;
    }
  }

  // 4. Amount.
  const candidates: AmountCandidate[] = [];
  for (let i = 0; i < origTokens.length; i++) {
    if (consumed.has(i)) continue;
    const parsed = parseAmountToken(origTokens[i] ?? '', minorUnitDigits);
    if (!parsed) continue;
    // "2 lakh" / "1.5 k": the multiplier arrived as its own token.
    const nextWord = (lowerTokens[i + 1] ?? '').replace(/[^a-z]/g, '');
    const wordMultiplier = consumed.has(i + 1) ? undefined : MULTIPLIER_WORDS[nextWord];
    if (wordMultiplier !== undefined) {
      candidates.push({
        ...parsed,
        minor: parsed.minor * wordMultiplier,
        explicit: true,
        index: i,
        multiplierIndex: i + 1,
      });
      continue;
    }
    candidates.push({ ...parsed, index: i });
  }
  const picked = selectAmount(candidates);
  if (!picked.ok) return { kind: 'unparsed', reason: picked.reason };
  const amount = picked.amount;
  consumed.add(amount.index);
  if (amount.multiplierIndex !== undefined) consumed.add(amount.multiplierIndex);

  if (amount.minor <= 0n) return { kind: 'unparsed', reason: 'zero_amount' };
  if (amount.minor > maxAmountMinor) return { kind: 'unparsed', reason: 'amount_too_large' };

  if (amount.sign === '+') type = 'income';
  if (amount.sign === '-') type = 'expense';

  // 5. Remainder -> note and party.
  const remainderIdx: number[] = [];
  for (let i = 0; i < origTokens.length; i++) if (!consumed.has(i)) remainderIdx.push(i);

  let party: string | null = null;
  let noteTokens: string[] = remainderIdx.map((i) => origTokens[i] ?? '');

  const prepositionAt = remainderIdx.findIndex((i) => PARTY_PREPOSITIONS.has(lowerTokens[i] ?? ''));
  if (prepositionAt !== -1 && prepositionAt < remainderIdx.length - 1) {
    const before = remainderIdx.slice(0, prepositionAt).map((i) => origTokens[i] ?? '');
    const after = remainderIdx.slice(prepositionAt + 1).map((i) => origTokens[i] ?? '');
    party = titleCase(after.join(' '));
    noteTokens = before;
  }

  noteTokens = trimFillers(noteTokens);
  let note = noteTokens.join(' ').replace(/\s+/g, ' ').trim();

  // The consumed direction word still carries category signal ("sold 3000" -> Sales).
  const categoryText = [note, party ?? '', directionWord].filter(Boolean).join(' ');
  const category = matchCategory(categoryText, type);

  // An income message with a short bare remainder names the payer: "received 5000 ramesh".
  if (party === null && type === 'income' && noteTokens.length > 0 && noteTokens.length <= 2 && category === null) {
    party = titleCase(note);
  }

  if (note === '' && party) note = party;

  let confidence = 0.5;
  if (amount.explicit || hasDirectionMarker) confidence += 0.2;
  if (category) confidence += 0.15;
  if (note !== '') confidence += 0.1;
  if (account) confidence += 0.05;

  return {
    kind: 'entry',
    type,
    amountMinor: amount.minor.toString(),
    note,
    party,
    account,
    category,
    date: dateMatch ? dateMatch.date : null,
    confidence: Math.min(1, Number(confidence.toFixed(2))),
  };
}
