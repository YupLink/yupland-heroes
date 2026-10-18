// Зашифрованный бэкап сид-фразы для восстановления кошелька на другом устройстве
// или после чистки хранилища (Telegram-webview). Шифрование/расшифровка ТОЛЬКО на
// клиенте: на сервер уходит лишь шифр-блоб + соль/nonce/params + публичное.
// Сервер НИКОГДА не видит ни пароль, ни сид/приватный ключ.
//
// Схема: Argon2id(пароль, соль) -> 32-байтный ключ -> AES-256-GCM(сид).
// Неверный пароль = провал GCM-аутентификации -> бросаем "Неверный пароль".
// Параметры KDF хранятся в блобе (kdf) — можно ужесточать со временем без поломки
// старых бэкапов.

import { argon2idAsync } from "@noble/hashes/argon2.js";
import { base64 } from "@scure/base";

export interface BackupKdf {
  algo: "argon2id";
  m: number; // память, KiB
  t: number; // итерации
  p: number; // параллелизм
  v: 1;
}

export interface BackupBlob {
  encSeed: string; // base64: AES-GCM ciphertext (+ встроенный auth-tag)
  salt: string; // base64 (16 байт)
  nonce: string; // base64 (12 байт IV)
  kdf: BackupKdf;
}

// Текущие параметры KDF. m=32 MiB, t=3 — баланс «дорого перебирать» / работает на
// мобиле за ~1-2с (бэкап/восстановление — операция редкая, не на каждую подпись).
const KDF: BackupKdf = { algo: "argon2id", m: 32768, t: 3, p: 1, v: 1 };

const MIN_PASSWORD_LEN = 8;

function randomBytes(n: number): Uint8Array {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return b;
}

async function deriveAesKey(password: string, salt: Uint8Array, kdf: BackupKdf): Promise<CryptoKey> {
  const raw = await argon2idAsync(new TextEncoder().encode(password), salt, {
    t: kdf.t,
    m: kdf.m,
    p: kdf.p,
    dkLen: 32,
    asyncTick: 20, // уступаем UI-потоку каждые 20мс
  });
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

/** Зашифровать сид паролем. Результат можно безопасно отдать на сервер. */
export async function encryptSeed(seed: string, password: string): Promise<BackupBlob> {
  if (!seed || !seed.trim()) throw new Error("Нет сид-фразы для бэкапа");
  if (password.length < MIN_PASSWORD_LEN) {
    throw new Error(`Пароль слишком короткий (минимум ${MIN_PASSWORD_LEN} символов)`);
  }
  const salt = randomBytes(16);
  const nonce = randomBytes(12);
  const key = await deriveAesKey(password, salt, KDF);
  const ct = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce },
      key,
      new TextEncoder().encode(seed.trim()),
    ),
  );
  return {
    encSeed: base64.encode(ct),
    salt: base64.encode(salt),
    nonce: base64.encode(nonce),
    kdf: KDF,
  };
}

/** Расшифровать сид паролем. Неверный пароль -> Error("Неверный пароль"). */
export async function decryptSeed(blob: BackupBlob, password: string): Promise<string> {
  const salt = base64.decode(blob.salt);
  const nonce = base64.decode(blob.nonce);
  const ct = base64.decode(blob.encSeed);
  const key = await deriveAesKey(password, salt, blob.kdf ?? KDF);
  let pt: ArrayBuffer;
  try {
    pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce }, key, ct);
  } catch {
    throw new Error("Неверный пароль");
  }
  return new TextDecoder().decode(pt);
}

export { MIN_PASSWORD_LEN };
