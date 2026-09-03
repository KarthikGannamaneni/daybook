/**
 * Category prediction ranking.
 *
 * This is the pure mirror of `fn_predict_category` (see the migration): the SQL
 * does the same scoring over `category_predictions`, this version exists so the
 * ranking is unit-testable per §10.1 and so the client can re-rank a cached set
 * without a round trip. No ML: it is co-occurrence counting over the business's
 * own last 90 days.
 */

/** Words with no predictive value; dropped before token matching. */
const STOP_WORDS = new Set([
  'for', 'of', 'the', 'a', 'an', 'and', 'to', 'from', 'on', 'at', 'in', 'by',
  'paid', 'pay', 'got', 'received', 'rs', 'inr', 'today', 'yesterday',
]);

export const PARTY_WEIGHT = 3;
export const TOKEN_WEIGHT = 1;

export interface PredictionRow {
  categoryId: string;
  /** Normalised note token, or null for a party-only row. */
  noteToken: string | null;
  partyId: string | null;
  hits: number;
}

export interface RankedCategory {
  categoryId: string;
  score: number;
}

/**
 * Lowercases, strips punctuation and stop words, dedupes.
 * Unicode-aware so Hindi/Telugu notes tokenise the same way English ones do.
 */
export function normaliseTokens(text: string | null | undefined): string[] {
  if (!text) return [];
  const words = text
    .toLowerCase()
    // \p{M} keeps Devanagari/Telugu matras attached to their consonant.
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !STOP_WORDS.has(w));
  return [...new Set(words)];
}

/**
 * Scores candidate categories. A party match counts triple a note-token match
 * because "Ramesh" identifies the spend far more reliably than "bill" does.
 */
export function rankCategories(
  rows: PredictionRow[],
  input: { note?: string | null; partyId?: string | null },
): RankedCategory[] {
  const tokens = new Set(normaliseTokens(input.note));
  const partyId = input.partyId ?? null;
  const scores = new Map<string, number>();

  for (const row of rows) {
    let weight = 0;
    if (partyId !== null && row.partyId === partyId) weight += PARTY_WEIGHT;
    if (row.noteToken !== null && tokens.has(row.noteToken)) weight += TOKEN_WEIGHT;
    if (weight === 0) continue;
    scores.set(row.categoryId, (scores.get(row.categoryId) ?? 0) + weight * row.hits);
  }

  return [...scores.entries()]
    .map(([categoryId, score]) => ({ categoryId, score }))
    .sort((a, b) => b.score - a.score || a.categoryId.localeCompare(b.categoryId));
}

/** The single prediction shown as a pre-selected chip, or null when nothing matched. */
export function predictCategory(
  rows: PredictionRow[],
  input: { note?: string | null; partyId?: string | null },
): string | null {
  return rankCategories(rows, input)[0]?.categoryId ?? null;
}
