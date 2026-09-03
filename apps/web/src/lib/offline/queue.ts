import { del, get, set } from 'idb-keyval';
import type { CreateEntryInput, LedgerRepo } from '../data/index.ts';

/**
 * Offline write queue (§4.7).
 *
 * Creates are queued in IndexedDB with the client_id already minted, so a flush
 * that runs twice — or a request whose response was lost — cannot produce two
 * entries: the unique client_id makes the second insert a no-op.
 */

const QUEUE_KEY = 'khata.outbox.v1';

export interface QueuedCreate extends CreateEntryInput {
  queuedAt: string;
}

async function readQueue(): Promise<QueuedCreate[]> {
  return (await get<QueuedCreate[]>(QUEUE_KEY)) ?? [];
}

async function writeQueue(items: QueuedCreate[]): Promise<void> {
  if (items.length === 0) await del(QUEUE_KEY);
  else await set(QUEUE_KEY, items);
  notify(items.length);
}

const listeners = new Set<(count: number) => void>();

function notify(count: number): void {
  for (const l of listeners) l(count);
}

export function onQueueChange(listener: (count: number) => void): () => void {
  listeners.add(listener);
  void pendingCount().then(listener);
  return () => listeners.delete(listener);
}

export async function enqueue(input: CreateEntryInput): Promise<void> {
  const queue = await readQueue();
  if (queue.some((q) => q.clientId === input.clientId)) return;
  queue.push({ ...input, queuedAt: new Date().toISOString() });
  await writeQueue(queue);
}

export async function pendingCount(): Promise<number> {
  return (await readQueue()).length;
}

export async function pendingEntries(): Promise<QueuedCreate[]> {
  return readQueue();
}

/** Drains the queue. Items that fail for a non-network reason are dropped, not retried forever. */
export async function flushQueue(repo: LedgerRepo): Promise<{ synced: number; failed: number }> {
  const queue = await readQueue();
  if (queue.length === 0) return { synced: 0, failed: 0 };

  const remaining: QueuedCreate[] = [];
  let synced = 0;
  let failed = 0;

  for (const item of queue) {
    try {
      const { queuedAt: _queuedAt, ...input } = item;
      await repo.createEntry(input);
      synced += 1;
    } catch (error) {
      const offline = typeof navigator !== 'undefined' && !navigator.onLine;
      if (offline) remaining.push(item);
      else failed += 1;
      if (!offline) console.error('Dropped an unsyncable queued entry', error);
    }
  }

  await writeQueue(remaining);
  return { synced, failed };
}

export async function clearQueue(): Promise<void> {
  await writeQueue([]);
}
