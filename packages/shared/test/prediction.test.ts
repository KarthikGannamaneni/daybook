import { describe, expect, it } from 'vitest';
import { normaliseTokens, predictCategory, rankCategories, type PredictionRow } from '../src';

const FOOD = 'cat-food';
const TRANSPORT = 'cat-transport';
const RENT = 'cat-rent';

const ROWS: PredictionRow[] = [
  { categoryId: FOOD, noteToken: 'tea', partyId: null, hits: 40 },
  { categoryId: FOOD, noteToken: 'shop', partyId: null, hits: 12 },
  { categoryId: TRANSPORT, noteToken: 'shop', partyId: null, hits: 3 },
  { categoryId: TRANSPORT, noteToken: 'auto', partyId: null, hits: 25 },
  { categoryId: RENT, noteToken: null, partyId: 'party-landlord', hits: 6 },
  { categoryId: TRANSPORT, noteToken: null, partyId: 'party-landlord', hits: 1 },
];

describe('normaliseTokens', () => {
  it('lowercases, splits and dedupes', () => {
    expect(normaliseTokens('Tea Shop tea')).toEqual(['tea', 'shop']);
  });

  it('drops punctuation, stop words and single characters', () => {
    expect(normaliseTokens('paid for the tea!! x')).toEqual(['tea']);
  });

  it('keeps non-latin words', () => {
    expect(normaliseTokens('500 चाय')).toEqual(['500', 'चाय']);
  });

  it('handles empty input', () => {
    expect(normaliseTokens('')).toEqual([]);
    expect(normaliseTokens(null)).toEqual([]);
    expect(normaliseTokens(undefined)).toEqual([]);
  });
});

describe('rankCategories', () => {
  it('ranks the most co-occurring category first', () => {
    expect(rankCategories(ROWS, { note: 'tea shop' })[0]).toEqual({ categoryId: FOOD, score: 52 });
  });

  it('weights a party match above a note token', () => {
    // Rent: 3 x 6 party hits = 18. Food: 1 x 12 "shop" hits = 12. The party wins.
    const ranked = rankCategories(ROWS, { note: 'shop', partyId: 'party-landlord' });
    expect(ranked[0]).toEqual({ categoryId: RENT, score: 18 });
    expect(ranked[1]).toEqual({ categoryId: FOOD, score: 12 });
  });

  it('returns nothing when no signal matches', () => {
    expect(rankCategories(ROWS, { note: 'unrelated words' })).toEqual([]);
    expect(predictCategory(ROWS, { note: 'unrelated words' })).toBeNull();
  });

  it('is deterministic on a tie', () => {
    const tied: PredictionRow[] = [
      { categoryId: 'b', noteToken: 'xy', partyId: null, hits: 5 },
      { categoryId: 'a', noteToken: 'xy', partyId: null, hits: 5 },
    ];
    expect(rankCategories(tied, { note: 'xy' }).map((r) => r.categoryId)).toEqual(['a', 'b']);
  });

  it('predicts the top category', () => {
    expect(predictCategory(ROWS, { note: 'auto rickshaw' })).toBe(TRANSPORT);
  });

  it('ignores empty input', () => {
    expect(predictCategory(ROWS, {})).toBeNull();
  });
});
