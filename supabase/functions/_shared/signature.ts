/**
 * Meta signs every webhook body with the app secret. An unsigned or wrongly
 * signed request is rejected with 403 before anything is parsed (§4.5).
 */

function hexToBytes(hex: string): Uint8Array | null {
  if (hex.length % 2 !== 0 || !/^[0-9a-f]*$/i.test(hex)) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** Constant-time comparison; length differences leak nothing beyond length. */
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

export async function verifySignature(
  rawBody: string,
  header: string | null,
  appSecret: string,
): Promise<boolean> {
  if (!header || !appSecret) return false;
  const [scheme, signature] = header.split('=');
  if (scheme !== 'sha256' || !signature) return false;

  const expected = hexToBytes(signature);
  if (!expected) return false;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(appSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody)));
  return timingSafeEqual(mac, expected);
}

/** Test/dev helper: produces the header Meta would have sent. */
export async function signBody(rawBody: string, appSecret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(appSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody)));
  return 'sha256=' + [...mac].map((b) => b.toString(16).padStart(2, '0')).join('');
}
