import type { QueryClient } from '@tanstack/react-query';

/**
 * Everything that is derived from the entries table.
 *
 * Budgets, quick chips and month totals are all read models over the same rows,
 * so anything that writes an entry has to refresh all of them. Keeping the list
 * in one place is what stops the next read model from being forgotten — which is
 * exactly how a budget bar came to sit still while money was being spent.
 */
export async function invalidateLedger(queryClient: QueryClient): Promise<void> {
  await Promise.all(
    [['entries'], ['totals'], ['chips'], ['budgets'], ['recurring'], ['gst'], ['parties']].map((key) =>
      queryClient.invalidateQueries({ queryKey: key }),
    ),
  );
}
