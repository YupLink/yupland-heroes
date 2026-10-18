// ── Безопасное хранилище ключа кошелька (PROD) ──
// Приватный ключ NEAR (Ed25519) импортируется как НЕИЗВЛЕКАЕМЫЙ CryptoKey и
// кладётся в IndexedDB. JS может ПОДПИСАТЬ им (crypto.subtle.sign), но НЕ может
// прочитать байты ключа (exportKey бросает). Переживает перезагрузки/новые
// вкладки (IndexedDB постоянен и привязан к origin). PIN не нужен — границу
// держит сам браузер.
//
// Мультиаккаунт: записи в одном object store, ключ = accountId.
//
// Гибрид: рядом — копия сид-фразы, завёрнутая НЕИЗВЛЕКАЕМЫМ AES-ключом, для
// кнопки «показать сид» (расшифровка в памяти только по явному запросу; в UI
// gated биометрией). Это нужно для бэкапа/восстановления.
//
// Авто-детект: если браузер умеет Ed25519 в WebCrypto → «чистый» режим (приват
// вообще не появляется в JS при подписи). Если нет (старый WebKit) → fallback:
// подпись считается в памяти из расшифрованного сида через @noble/ed25519.
import * as ed25519 from "@noble/ed25519";
import { base58 } from "@scure/base";
import { deriveRawKeyFromSeedPhrase } from "./embeddedWallet";
import { hasAppPassword, isAppUnlocked, touchAppCache } from "./appLock";

// Защита самого нижнего слоя: если установлен пароль кошелька (app-lock) и он
// заблокирован — НЕ выдаём секрет / не подписываем, даже при прямом импорте
// этого модуля (консоль/закладка), мимо фасада embeddedWallet и UI.
function assertAppUnlocked(): void {
  if (hasAppPassword() && !isAppUnlocked()) {
    throw new Error("APP_LOCKED");
  }
}

const DB_NAME = "yl-secure-wallet";
const STORE = "wallets";

// ── DER-обёртки для WebCrypto Ed25519 ──
function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}
const PKCS8_PREFIX = hexToBytes("302e020100300506032b657004220420"); // 16 байт
function pkcs8FromRawPriv(priv32: Uint8Array): Uint8Array {
  const out = new Uint8Array(PKCS8_PREFIX.length + 32);
  out.set(PKCS8_PREFIX, 0);
  out.set(priv32, PKCS8_PREFIX.length);
  return out;
}

// ── Авто-детект Ed25519 в WebCrypto ──
let _ed25519Supported: boolean | null = null;
export async function ed25519Supported(): Promise<boolean> {
  if (_ed25519Supported !== null) return _ed25519Supported;
  try {
    const kp = (await crypto.subtle.generateKey({ name: "Ed25519" }, false, [
      "sign",
      "verify",
    ])) as CryptoKeyPair;
    const sig = await crypto.subtle.sign({ name: "Ed25519" }, kp.privateKey, new Uint8Array([1, 2, 3]));
    _ed25519Supported = sig.byteLength === 64;
  } catch {
    _ed25519Supported = false;
  }
  return _ed25519Supported;
}

// ── IndexedDB helpers (ключ = accountId) ──
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbPut(key: string, value: unknown): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}
async function idbGet<T>(key: string): Promise<T | null> {
  const db = await openDb();
  const v = await new Promise<T | null>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const r = tx.objectStore(STORE).get(key);
    r.onsuccess = () => resolve((r.result as T) ?? null);
    r.onerror = () => reject(r.error);
  });
  db.close();
  return v;
}
async function idbDelete(key: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve();
  });
  db.close();
}
async function idbKeys(): Promise<string[]> {
  const db = await openDb();
  const keys = await new Promise<string[]>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const r = tx.objectStore(STORE).getAllKeys();
    r.onsuccess = () => resolve((r.result as IDBValidKey[]).map(String));
    r.onerror = () => reject(r.error);
  });
  db.close();
  return keys;
}

// ── Запись в хранилище ──
// Два типа кошельков, единый стор/формат:
//  - seed-кошелёк (keyOnly отсутствует/false): хранит AES-обёртку СИД-ФРАЗЫ
//    (seedWrapKey/seedIv/seedCt). «Показать сид» и «показать приватный ключ»
//    работают (приватник деривируется из сида).
//  - key-only кошелёк (keyOnly:true): сида НЕТ. Хранит AES-обёртку ПРИВАТНОГО
//    КЛЮЧА (privWrapKey/privIv/privCt) — для «показать приватный ключ». В
//    fallback-режиме (нет Ed25519 в WebCrypto) подпись считается из
//    распакованного приватника через noble. «Показать сид» недоступно.
type StoredRecord = {
  mode: "ed25519" | "aes";
  accountId: string;
  publicKeyStr: string;
  keyOnly?: boolean; // true → импортирован по приватному ключу, сида нет
  signingKey: CryptoKey | null; // только mode=ed25519
  // Обёртка сид-фразы (только seed-кошельки). Для key-only — отсутствуют.
  seedWrapKey?: CryptoKey; // неизвлекаемый AES-GCM, для сида
  seedIv?: Uint8Array;
  seedCt?: ArrayBuffer;
  // Обёртка приватного ключа (только key-only кошельки). secretKeyStr в виде
  // ed25519:<base58(priv32||pub32)> зашифрован под неизвлекаемым AES-GCM.
  privWrapKey?: CryptoKey;
  privIv?: Uint8Array;
  privCt?: ArrayBuffer;
};

export type SecureMode = "ed25519" | "aes";

/**
 * Импортировать кошелёк из сид-фразы и сохранить безопасно.
 * accountIdOverride — для именованных аккаунтов (implicit ≠ accountId).
 */
export async function setupSecureWallet(
  seedPhrase: string,
  accountIdOverride?: string
): Promise<{ accountId: string; publicKeyStr: string; mode: SecureMode }> {
  const { priv32, publicKeyStr, accountId: implicitId } =
    await deriveRawKeyFromSeedPhrase(seedPhrase);
  const accountId = accountIdOverride?.trim() || implicitId;

  // AES-обёртка сида (для «показать сид»). Ключ НЕИЗВЛЕКАЕМЫЙ.
  const seedWrapKey = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, [
    "encrypt",
    "decrypt",
  ]);
  const seedIv = crypto.getRandomValues(new Uint8Array(12));
  const seedCt = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: seedIv },
    seedWrapKey,
    new TextEncoder().encode(seedPhrase.trim())
  );

  const supported = await ed25519Supported();
  let signingKey: CryptoKey | null = null;
  if (supported) {
    // Чистый режим: приват импортируется НЕИЗВЛЕКАЕМЫМ, сырые байты затираем.
    signingKey = await crypto.subtle.importKey(
      "pkcs8",
      pkcs8FromRawPriv(priv32) as BufferSource,
      { name: "Ed25519" },
      false,
      ["sign"]
    );
  }
  priv32.fill(0); // затираем сырой приват из памяти

  const rec: StoredRecord = {
    mode: supported ? "ed25519" : "aes",
    accountId,
    publicKeyStr,
    signingKey,
    seedWrapKey,
    seedIv,
    seedCt,
  };
  await idbPut(accountId, rec);

  // Просим браузер не вытеснять хранилище.
  try { await navigator.storage?.persist?.(); } catch { /* noop */ }

  return { accountId, publicKeyStr, mode: rec.mode };
}

// ── Парсинг приватного ключа NEAR ──
// Принимает «ed25519:<base58>» или «<base58>» или hex. Внутри base58/hex —
// либо 64 байта (priv32||pub32, NEAR-конвенция), либо 32 байта (только priv,
// public дочитываем из приватника). Возвращает нормализованные priv32/pub32.
export async function parsePrivateKeyStr(
  raw: string
): Promise<{ priv32: Uint8Array; pub32: Uint8Array }> {
  let s = raw.trim();
  if (s.startsWith("ed25519:")) s = s.slice("ed25519:".length);
  s = s.trim();

  let bytes: Uint8Array | null = null;
  // hex (64 hex = 32 байта, 128 hex = 64 байта)
  if (/^[0-9a-fA-F]+$/.test(s) && (s.length === 64 || s.length === 128)) {
    bytes = hexToBytes(s.toLowerCase());
  } else {
    // base58
    try {
      bytes = base58.decode(s);
    } catch {
      bytes = null;
    }
  }
  if (!bytes || (bytes.length !== 32 && bytes.length !== 64)) {
    throw new Error("Невалидный приватный ключ (нужен ed25519, 32 или 64 байта)");
  }
  const priv32 = bytes.slice(0, 32);
  let pub32: Uint8Array;
  if (bytes.length === 64) {
    pub32 = bytes.slice(32, 64);
  } else {
    pub32 = await ed25519.getPublicKeyAsync(priv32);
  }
  return { priv32, pub32 };
}

/**
 * Импортировать кошелёк ПО ПРИВАТНОМУ КЛЮЧУ (без сида) и сохранить безопасно.
 * privateKeyStr — «ed25519:<base58>» / base58 / hex (32 или 64 байта).
 * accountIdOverride — для named-аккаунтов (иначе implicit-hex от public key).
 *
 * Приват импортируется как НЕИЗВЛЕКАЕМЫЙ Ed25519 CryptoKey (как seed-путь), а
 * для кнопки «показать приватный ключ» рядом кладётся AES-GCM-обёртка строки
 * secretKey. Сид отсутствует (keyOnly:true).
 */
export async function setupSecureWalletFromPrivateKey(
  privateKeyStr: string,
  accountIdOverride?: string
): Promise<{ accountId: string; publicKeyStr: string; mode: SecureMode }> {
  const { priv32, pub32 } = await parsePrivateKeyStr(privateKeyStr);
  const publicKeyStr = `ed25519:${base58.encode(pub32)}`;
  const implicitId = bytesToHexLocal(pub32);
  const accountId = accountIdOverride?.trim() || implicitId;

  // Каноничная строка приватника (priv32||pub32) для «показать приватный ключ».
  const concat = new Uint8Array(64);
  concat.set(priv32, 0);
  concat.set(pub32, 32);
  const secretKeyStr = `ed25519:${base58.encode(concat)}`;

  // AES-обёртка приватника. Ключ НЕИЗВЛЕКАЕМЫЙ.
  const privWrapKey = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, [
    "encrypt",
    "decrypt",
  ]);
  const privIv = crypto.getRandomValues(new Uint8Array(12));
  const privCt = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: privIv },
    privWrapKey,
    new TextEncoder().encode(secretKeyStr)
  );

  const supported = await ed25519Supported();
  let signingKey: CryptoKey | null = null;
  if (supported) {
    // Чистый режим: приват импортируется НЕИЗВЛЕКАЕМЫМ, сырые байты затираем.
    signingKey = await crypto.subtle.importKey(
      "pkcs8",
      pkcs8FromRawPriv(priv32) as BufferSource,
      { name: "Ed25519" },
      false,
      ["sign"]
    );
  }
  priv32.fill(0); // затираем сырой приват из памяти

  const rec: StoredRecord = {
    mode: supported ? "ed25519" : "aes",
    accountId,
    publicKeyStr,
    keyOnly: true,
    signingKey,
    privWrapKey,
    privIv,
    privCt,
  };
  await idbPut(accountId, rec);

  try { await navigator.storage?.persist?.(); } catch { /* noop */ }

  return { accountId, publicKeyStr, mode: rec.mode };
}

function bytesToHexLocal(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Есть ли безопасно-сохранённый кошелёк для accountId. */
export async function hasSecureWallet(accountId: string): Promise<boolean> {
  return (await idbGet<StoredRecord>(accountId)) !== null;
}

/** Это key-only кошелёк (импортирован по приватному ключу, без сида)? */
export async function isKeyOnlyWallet(accountId: string): Promise<boolean> {
  const rec = await idbGet<StoredRecord>(accountId);
  return rec?.keyOnly === true;
}

/** Метаданные кошелька (переживает перезаход). */
export async function loadSecureWallet(accountId: string): Promise<{
  accountId: string;
  publicKeyStr: string;
  mode: SecureMode;
} | null> {
  const rec = await idbGet<StoredRecord>(accountId);
  if (!rec) return null;
  return { accountId: rec.accountId, publicKeyStr: rec.publicKeyStr, mode: rec.mode };
}

/** Список accountId всех безопасно-сохранённых кошельков. */
export async function listSecureAccounts(): Promise<string[]> {
  return idbKeys();
}

/** Подписать сообщение (обычно sha256(tx)). В чистом режиме приват не появляется в JS. */
export async function signWithSecure(accountId: string, message: Uint8Array): Promise<Uint8Array> {
  assertAppUnlocked(); // замок: подпись только разблокированным кошельком
  touchAppCache(); // активная подпись держит окно живым (анти-лок в длинном батче)
  const rec = await idbGet<StoredRecord>(accountId);
  if (!rec) throw new Error("Кошелёк не подключён");
  if (rec.mode === "ed25519" && rec.signingKey) {
    const sig = await crypto.subtle.sign({ name: "Ed25519" }, rec.signingKey, message as BufferSource);
    return new Uint8Array(sig);
  }
  // Fallback (нет Ed25519 в WebCrypto): разворачиваем приват в памяти,
  // подписываем noble, затираем. Для seed-кошелька — деривируем приват из
  // сида; для key-only — берём приват прямо из обёртки приватника.
  let priv32: Uint8Array;
  if (rec.keyOnly) {
    const parsed = await parsePrivateKeyStr(await revealPrivateKeyFor(rec));
    priv32 = parsed.priv32;
  } else {
    const seed = await revealSeedFor(rec);
    priv32 = (await deriveRawKeyFromSeedPhrase(seed)).priv32;
  }
  const sig = await ed25519.signAsync(message, priv32);
  priv32.fill(0);
  return sig;
}

/**
 * Показать сид-фразу (расшифровка в памяти только по явному запросу).
 * Для key-only кошельков сида НЕТ → бросаем понятную ошибку.
 */
export async function revealSeed(accountId: string): Promise<string> {
  assertAppUnlocked(); // замок: не выдаём сид при заблокированном кошельке
  const rec = await idbGet<StoredRecord>(accountId);
  if (!rec) throw new Error("Кошелёк не подключён");
  if (rec.keyOnly || !rec.seedWrapKey || !rec.seedIv || !rec.seedCt) {
    throw new Error("NO_SEED: кошелёк импортирован по приватному ключу — сид-фразы нет");
  }
  return revealSeedFor(rec);
}
async function revealSeedFor(rec: StoredRecord): Promise<string> {
  if (!rec.seedWrapKey || !rec.seedIv || !rec.seedCt) {
    throw new Error("NO_SEED: сид недоступен для этого кошелька");
  }
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: rec.seedIv as BufferSource }, rec.seedWrapKey, rec.seedCt);
  return new TextDecoder().decode(pt);
}

/**
 * Показать приватный ключ (ed25519:<base58>). Работает для ОБОИХ типов:
 *  - key-only: расшифровываем сохранённую обёртку приватника;
 *  - seed: деривируем приват из расшифрованного сида.
 * Возвращает null если кошелёк не secure (legacy plain/PIN — там путь через
 * getKeyPairBytes/getSeedPhrase в embeddedWallet).
 */
export async function revealPrivateKey(accountId: string): Promise<string | null> {
  assertAppUnlocked(); // замок: не выдаём приватный ключ при заблокированном кошельке
  const rec = await idbGet<StoredRecord>(accountId);
  if (!rec) return null;
  if (rec.keyOnly) return revealPrivateKeyFor(rec);
  // seed-кошелёк: деривируем приват из сида.
  const seed = await revealSeedFor(rec);
  const { priv32, pub32 } = await deriveRawKeyFromSeedPhrase(seed);
  const concat = new Uint8Array(64);
  concat.set(priv32, 0);
  concat.set(pub32, 32);
  priv32.fill(0);
  return `ed25519:${base58.encode(concat)}`;
}
async function revealPrivateKeyFor(rec: StoredRecord): Promise<string> {
  if (!rec.privWrapKey || !rec.privIv || !rec.privCt) {
    throw new Error("Приватный ключ недоступен для этого кошелька");
  }
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: rec.privIv as BufferSource }, rec.privWrapKey, rec.privCt);
  return new TextDecoder().decode(pt);
}

/** Удалить безопасную запись (при удалении кошелька). */
export async function removeSecureWallet(accountId: string): Promise<void> {
  await idbDelete(accountId);
}
