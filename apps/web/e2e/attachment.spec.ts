import zlib from 'node:zlib';
import { expect, test } from '@playwright/test';
import { resetDemoData, signInToComposer } from './helpers';

/** A large, poorly-compressible PNG, so the client-side compressor has real work to do. */
function makeLargePng(size = 1400): Buffer {
  const rows: Buffer[] = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(size * 3 + 1);
    row[0] = 0;
    for (let x = 0; x < size; x++) {
      const i = 1 + x * 3;
      row[i] = (x * 7 + y * 13) % 256;
      row[i + 1] = (x * x + y * 3) % 256;
      row[i + 2] = (x ^ y) % 256;
    }
    rows.push(row);
  }

  const chunk = (tag: string, data: Buffer): Buffer => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(tag, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32 ? zlib.crc32(body) : crc32(body));
    return Buffer.concat([length, body, crc]);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(Buffer.concat(rows), { level: 1 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function crc32(buf: Buffer): number {
  let c = ~0;
  for (const byte of buf) {
    c ^= byte;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

/** §10.4 scenario 3: a bill photo is compressed below 800 KB before it is stored. */
test('a bill photo is compressed under 800 KB', async ({ page }) => {
  await resetDemoData(page);
  await signInToComposer(page);

  const original = makeLargePng();
  expect(original.byteLength).toBeGreaterThan(800 * 1024);

  await page.getByTestId('attachment-input').setInputFiles({
    name: 'bill.png',
    mimeType: 'image/png',
    buffer: original,
  });
  await expect(page.getByText('Photo attached')).toBeVisible({ timeout: 20_000 });

  await page.getByTestId('amount-input').fill('1250');
  await page.getByTestId('note-input').fill('printer paper');
  await page.getByTestId('save-entry').click();
  await expect(page.getByTestId('entry-row').first()).toContainText('printer paper');

  const storedSize = await page.evaluate(() => {
    const raw = window.localStorage.getItem('khata.demo.v1');
    const state = JSON.parse(raw ?? '{}') as { attachments?: Record<string, string> };
    const sizes = Object.values(state.attachments ?? {}).map(Number);
    return sizes.length > 0 ? Math.max(...sizes) : -1;
  });

  expect(storedSize).toBeGreaterThan(0);
  expect(storedSize).toBeLessThan(800 * 1024);
});
