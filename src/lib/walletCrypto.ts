// Non-custodial кошелёк: ключ юзера шифруется PIN'ом локально через WebCrypto.
// Сервер НИКОГДА не видит plaintext private key и НИКОГДА не видит PIN.
//
// Алгоритм:
//   - KDF: PBKDF2-HMAC-SHA256, 600 000 iterations (OWASP 2024), salt 16 байт случайный
//   - AEAD: AES-256-GCM, nonce 12 байт случайный
//   - Encoding: всё base64 (URL-safe не нужен — это JSON-payload)
//
// Формат encrypted-blob (JSON):
//   { v: 1, kdf: "pbkdf2-sha256", iter: 600000, salt: "<b64>", nonce: "<b64>", ct: "<b64>" }

const ITERATIONS = 600_000;

function b64encode(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function b64decode(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function deriveKey(pin: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(pin),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: ITERATIONS,
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export interface EncryptedBlob {
  v: 1;
  kdf: "pbkdf2-sha256";
  iter: number;
  salt: string;
  nonce: string;
  ct: string;
}

export async function encryptWithPin(
  plaintext: string,
  pin: string
): Promise<EncryptedBlob> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(pin, salt);
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    key,
    new TextEncoder().encode(plaintext)
  );
  return {
    v: 1,
    kdf: "pbkdf2-sha256",
    iter: ITERATIONS,
    salt: b64encode(salt),
    nonce: b64encode(nonce),
    ct: b64encode(ct),
  };
}

export async function decryptWithPin(
  blob: EncryptedBlob,
  pin: string
): Promise<string> {
  if (blob.v !== 1) throw new Error(`Неизвестная версия blob: ${blob.v}`);
  if (blob.kdf !== "pbkdf2-sha256")
    throw new Error(`Неизвестный KDF: ${blob.kdf}`);
  const salt = b64decode(blob.salt);
  const nonce = b64decode(blob.nonce);
  const ct = b64decode(blob.ct);
  const key = await deriveKey(pin, salt);
  try {
    const pt = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: nonce },
      key,
      ct
    );
    return new TextDecoder().decode(pt);
  } catch {
    throw new Error("Неверный PIN");
  }
}

// Сериализация blob ↔ строка (для TG CloudStorage и БД).
export function blobToString(b: EncryptedBlob): string {
  return JSON.stringify(b);
}
export function blobFromString(s: string): EncryptedBlob {
  const parsed = JSON.parse(s) as EncryptedBlob;
  if (!parsed || parsed.v !== 1) throw new Error("Bad blob format");
  return parsed;
}

// ──────── v=2 master-key encryption ────────
// Когда юзер настроил глобальный master-PIN — все кошельки шифруются
// одним и тем же master-key'ом. Соль/итерации хранятся ОДИН раз в
// verification-blob (см. masterKey.ts), а в самом wallet-blob'е только
// nonce + ciphertext.

export interface MasterEncryptedBlob {
  v: 2;
  mk: true; // signal: blob использует master-key
  nonce: string;
  ct: string;
}

export async function encryptWithMaster(
  plaintext: string,
  masterKey: CryptoKey
): Promise<MasterEncryptedBlob> {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    masterKey,
    new TextEncoder().encode(plaintext)
  );
  return {
    v: 2,
    mk: true,
    nonce: b64encode(nonce),
    ct: b64encode(ct),
  };
}

export async function decryptWithMaster(
  blob: MasterEncryptedBlob,
  masterKey: CryptoKey
): Promise<string> {
  if (blob.v !== 2 || !blob.mk) throw new Error("Не master-blob");
  const nonce = b64decode(blob.nonce);
  const ct = b64decode(blob.ct);
  try {
    const pt = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: nonce },
      masterKey,
      ct
    );
    return new TextDecoder().decode(pt);
  } catch {
    throw new Error("Не удалось расшифровать (master-key не подходит)");
  }
}

/** Определяет тип blob: plain / per-account-PIN (v=1) / master (v=2). */
export type BlobKind = "plain" | "per-account-pin" | "master-pin";

export function detectBlobKind(s: string): BlobKind {
  try {
    const j = JSON.parse(s) as { v?: number; plain?: boolean; mk?: boolean };
    if (j?.plain === true) return "plain";
    if (j?.v === 2 && j?.mk === true) return "master-pin";
    if (j?.v === 1) return "per-account-pin";
  } catch {
    // fall through
  }
  return "per-account-pin"; // unknown — пытаемся как PIN
}
