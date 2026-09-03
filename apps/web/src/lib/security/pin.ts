/**
 * App-lock PIN (§4.1).
 *
 * A 4-digit PIN has 10k possibilities, so the hash is only a speed bump against
 * someone with the device in hand — that is what PBKDF2 with a high iteration
 * count buys. The PIN itself is never stored or transmitted.
 */

const ITERATIONS = 210_000;
const ALGO = 'PBKDF2';

function toBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function fromBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}

async function derive(pin: string, salt: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), ALGO, false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: ALGO, salt: salt as BufferSource, iterations: ITERATIONS, hash: 'SHA-256' },
    key,
    256,
  );
  return new Uint8Array(bits);
}

export async function hashPin(pin: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(pin, salt);
  return `pbkdf2$${ITERATIONS}$${toBase64(salt)}$${toBase64(hash)}`;
}

export async function verifyPin(pin: string, stored: string | null): Promise<boolean> {
  if (!stored) return false;
  const [scheme, , saltB64, hashB64] = stored.split('$');
  if (scheme !== 'pbkdf2' || !saltB64 || !hashB64) return false;
  const hash = await derive(pin, fromBase64(saltB64));
  const expected = fromBase64(hashB64);
  if (hash.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < hash.length; i++) diff |= (hash[i] ?? 0) ^ (expected[i] ?? 0);
  return diff === 0;
}
