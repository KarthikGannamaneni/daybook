/**
 * WebAuthn passkeys for the app lock (P1 #1).
 *
 * Threat model, stated plainly: this is the same class of protection as the
 * 4-digit PIN it replaces — a lock on a device that is already in your hand. It
 * gates the *local* UI, and it is the platform authenticator (Face ID, Touch ID,
 * Windows Hello) that does the actual verification of the person.
 *
 * It is NOT an authentication factor against the server. Replacing the OTP
 * sign-in with a passkey needs the assertion verified server-side against the
 * stored public key; that is a separate piece of work and is not what this does.
 * The public key is stored so that verification can be added without asking
 * anyone to re-enrol.
 */

const RP_NAME = 'Khata';

export function isPasskeySupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.PublicKeyCredential !== 'undefined' &&
    typeof navigator.credentials?.create === 'function'
  );
}

/** True when the device has a built-in authenticator (fingerprint, face, Hello). */
export async function hasPlatformAuthenticator(): Promise<boolean> {
  if (!isPasskeySupported()) return false;
  try {
    return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

export function toBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

function randomBytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}

export interface RegisteredPasskey {
  credentialId: string;
  publicKey: string;
  transports: string[];
  deviceLabel: string;
}

/** Best-effort device name, so a list of passkeys is readable later. */
function deviceLabel(): string {
  if (typeof navigator === 'undefined') return 'This device';
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua)) return 'iPad';
  if (/Android/.test(ua)) return 'Android device';
  if (/Mac OS X/.test(ua)) return 'Mac';
  if (/Windows/.test(ua)) return 'Windows PC';
  return 'This device';
}

export async function registerPasskey(userId: string, userLabel: string): Promise<RegisteredPasskey> {
  if (!isPasskeySupported()) throw new Error('Passkeys are not supported on this device.');

  const credential = (await navigator.credentials.create({
    publicKey: {
      challenge: randomBytes(32),
      rp: { name: RP_NAME, id: window.location.hostname },
      user: {
        // Not the real user id: a stable random handle keeps the account
        // identifier out of the authenticator.
        id: randomBytes(16),
        name: userLabel,
        displayName: userLabel,
      },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 }, // ES256
        { type: 'public-key', alg: -257 }, // RS256
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        residentKey: 'preferred',
        userVerification: 'required',
      },
      timeout: 60_000,
      attestation: 'none',
    },
  })) as PublicKeyCredential | null;

  if (!credential) throw new Error('No passkey was created.');
  const response = credential.response as AuthenticatorAttestationResponse;
  const publicKey = response.getPublicKey?.();

  return {
    credentialId: credential.id,
    publicKey: publicKey ? toBase64Url(publicKey) : toBase64Url(response.attestationObject),
    transports: response.getTransports?.() ?? [],
    deviceLabel: deviceLabel(),
  };
}

/**
 * Asks the authenticator to verify the person. Resolves with the credential id
 * that was used, or throws if the user cancelled or it failed.
 */
export async function verifyPasskey(credentialIds: string[]): Promise<string> {
  if (!isPasskeySupported()) throw new Error('Passkeys are not supported on this device.');

  const assertion = (await navigator.credentials.get({
    publicKey: {
      challenge: randomBytes(32),
      rpId: window.location.hostname,
      allowCredentials: credentialIds.map((id) => ({
        type: 'public-key' as const,
        id: fromBase64Url(id),
      })),
      userVerification: 'required',
      timeout: 60_000,
    },
  })) as PublicKeyCredential | null;

  if (!assertion) throw new Error('Passkey check was cancelled.');
  return assertion.id;
}
