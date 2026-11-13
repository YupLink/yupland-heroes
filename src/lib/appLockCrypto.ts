// Криптография пароля кошелька (appLock): PBKDF2(600k, SHA-256) → AES-256-GCM,
// ключ неизвлекаемый. Тем же ключом запечатаны секреты кошельков (walletVault).
// Блоб проверки (соль + зашифрованная известная строка) — в localStorage; копия
// лежит в каждой запечатанной записи кошелька (по ней пароль восстанавливается).
const ITERATIONS = 600_000;
const VERIFICATION_PLAINTEXT = "yl-applock-v1";
export const LS_VERIFICATION = "yl:applock-v1";

export function b64encode(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}
export function b64decode(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function derivePwdToKey(pw: string, salt: Uint8Array): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pw),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as BufferSource, iterations: ITERATIONS, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false, // extractable=false
    ["encrypt", "decrypt"],
  );
}

export interface VerificationBlob {
  v: 1;
  kdf: "pbkdf2-sha256";
  iter: number;
  salt: string;
  nonce: string;
  ct: string;
}

export async function makeBlob(pw: string): Promise<{ blob: VerificationBlob; key: CryptoKey }> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const key = await derivePwdToKey(pw, salt);
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    key,
    new TextEncoder().encode(VERIFICATION_PLAINTEXT),
  );
  const blob: VerificationBlob = {
    v: 1,
    kdf: "pbkdf2-sha256",
    iter: ITERATIONS,
    salt: b64encode(salt),
    nonce: b64encode(nonce),
    ct: b64encode(ct),
  };
  return { blob, key };
}

/** Проверить пароль; верный — ключ из него (им же запечатаны кошельки). */
export async function verifyOnly(blob: VerificationBlob, pw: string): Promise<CryptoKey> {
  const key = await derivePwdToKey(pw, b64decode(blob.salt));
  try {
    const pt = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: b64decode(blob.nonce) as BufferSource },
      key,
      b64decode(blob.ct) as BufferSource,
    );
    if (new TextDecoder().decode(pt) !== VERIFICATION_PLAINTEXT) throw new Error("verify");
  } catch {
    throw new Error("Неверный пароль");
  }
  return key;
}

/** Блоб проверки из строки (JSON); не тот формат — null. */
export function parseVerificationBlob(raw: string | null | undefined): VerificationBlob | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as VerificationBlob;
    return p && p.v === 1 && p.salt && p.nonce && p.ct ? p : null;
  } catch {
    return null;
  }
}

/** Один и тот же пароль (та же соль и проверка). */
export const sameBlob = (a: VerificationBlob | null, b: VerificationBlob | null): boolean =>
  !!a && !!b && a.salt === b.salt && a.ct === b.ct;
