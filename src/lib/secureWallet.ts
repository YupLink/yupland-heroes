// ── Хранилище ключей встроенного кошелька (PROD) ──
// Записи IndexedDB, ключ = accountId (secureWalletDb). С 11.11.2026 секреты
// (сид или приватный ключ) запечатаны ключом из пароля кошелька (walletVault,
// secureWalletSeal): без пароля их не открыть и не подписать. Новый кошелёк
// создаётся только при разблокированном пароле; прежние записи (ключ браузера +
// готовый signingKey) запечатываются при первом вводе пароля.
//
// Подпись: если браузер умеет Ed25519 в WebCrypto — открытый паролем приват
// импортируется неизвлекаемым CryptoKey и живёт в памяти до замка; иначе
// (старый WebKit) подпись считается из привата через @noble/ed25519.
import * as ed25519 from "@noble/ed25519";
import { base58 } from "@scure/base";
import { deriveRawKeyFromSeedPhrase } from "./embeddedWallet";
import { hasAppPassword, isAppUnlocked, touchAppCache } from "./appLock";
import type { VerificationBlob } from "./appLockCrypto";
import { hasVaultKey, onVaultLock, withVaultLock } from "./walletVault";
import { removeSealedCopy, restoreFromCopies, writeSealedCopy } from "./walletSealedCopy";
import {
  isSealed,
  resealStoredWallets,
  sealStoredWallets,
  sealedRecord,
  secretsOf,
} from "./secureWalletSeal";

// Защита самого нижнего слоя: без пароля кошелька и без разблокировки этой
// страницы НЕ выдаём секрет и не подписываем — даже при прямом импорте модуля
// (консоль/закладка), мимо фасада embeddedWallet и UI. С 11.11.2026 пароль
// обязателен: им зашифрованы секреты (walletVault, secureWalletSeal).
function assertAppUnlocked(): void {
  if (!hasAppPassword()) throw new Error("APP_PWD_SETUP");
  if (!isAppUnlocked()) throw new Error("APP_LOCKED");
}

// Подписывающие ключи, открытые паролем, — только в памяти и до замка.
const signingCache = new Map<string, CryptoKey>();
onVaultLock(() => signingCache.clear());


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
import { idbDelete, idbGet, idbKeys, idbPut, type StoredRecord } from "./secureWalletDb";

export type SecureMode = "ed25519" | "aes";

/**
 * Импортировать кошелёк из сид-фразы и сохранить безопасно.
 * accountIdOverride — для именованных аккаунтов (implicit ≠ accountId).
 */
export async function setupSecureWallet(
  seedPhrase: string,
  accountIdOverride?: string
): Promise<{ accountId: string; publicKeyStr: string; mode: SecureMode }> {
  assertAppUnlocked(); // кошелёк — только под паролем: секреты сразу запечатаны
  const { priv32, publicKeyStr, accountId: implicitId } =
    await deriveRawKeyFromSeedPhrase(seedPhrase);
  priv32.fill(0);
  const accountId = accountIdOverride?.trim() || implicitId;
  const mode: SecureMode = (await ed25519Supported()) ? "ed25519" : "aes";
  const base: StoredRecord = { mode, accountId, publicKeyStr, signingKey: null };
  await withVaultLock(async () =>
    idbPut(accountId, await sealedRecord(base, { seed: seedPhrase.trim() })),
  );
  signingCache.delete(accountId);
  // Просим браузер не вытеснять хранилище.
  try { await navigator.storage?.persist?.(); } catch { /* noop */ }
  return { accountId, publicKeyStr, mode };
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
  assertAppUnlocked(); // кошелёк — только под паролем (см. setupSecureWallet)
  const { priv32, pub32 } = await parsePrivateKeyStr(privateKeyStr);
  const publicKeyStr = `ed25519:${base58.encode(pub32)}`;
  const implicitId = bytesToHexLocal(pub32);
  const accountId = accountIdOverride?.trim() || implicitId;

  // Каноничная строка приватника (priv32||pub32) для «показать приватный ключ».
  const concat = new Uint8Array(64);
  concat.set(priv32, 0);
  concat.set(pub32, 32);
  const secretKeyStr = `ed25519:${base58.encode(concat)}`;

  priv32.fill(0);
  concat.fill(0);
  const mode: SecureMode = (await ed25519Supported()) ? "ed25519" : "aes";
  const base: StoredRecord = { mode, accountId, publicKeyStr, keyOnly: true, signingKey: null };
  await withVaultLock(async () =>
    idbPut(accountId, await sealedRecord(base, { secretKey: secretKeyStr })),
  );
  signingCache.delete(accountId);
  try { await navigator.storage?.persist?.(); } catch { /* noop */ }
  return { accountId, publicKeyStr, mode };
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
  await restoreFromCopies(); // пропавшие записи IndexedDB — из запечатанных копий
  return idbKeys();
}

/** Сырой приват (32 байта) из секретов записи: из сида или из приватника. */
async function priv32Of(rec: StoredRecord): Promise<Uint8Array> {
  const secrets = await secretsOf(rec);
  if (rec.keyOnly) {
    if (!secrets.secretKey) throw new Error("Приватный ключ недоступен для этого кошелька");
    return (await parsePrivateKeyStr(secrets.secretKey)).priv32;
  }
  if (!secrets.seed) throw new Error("NO_SEED: сид недоступен для этого кошелька");
  return (await deriveRawKeyFromSeedPhrase(secrets.seed)).priv32;
}

/** Прежняя запись при разблокированном кошельке — запечатать (перенос на лету). */
async function sealedOrMigrate(accountId: string): Promise<StoredRecord> {
  const rec = await idbGet<StoredRecord>(accountId);
  if (!rec) throw new Error("Кошелёк не подключён");
  if (isSealed(rec) || !hasVaultKey()) return rec;
  return withVaultLock(async () => {
    const next = await sealedRecord(rec, await secretsOf(rec));
    await idbPut(accountId, next);
    return next;
  });
}

/**
 * Подписать сообщение (обычно sha256(tx)). Ключ подписи открывается паролем и
 * живёт в памяти до замка; в браузере с Ed25519 — неизвлекаемым CryptoKey.
 */
export async function signWithSecure(accountId: string, message: Uint8Array): Promise<Uint8Array> {
  assertAppUnlocked(); // замок: подпись только разблокированным кошельком
  touchAppCache(); // активная подпись держит окно живым (анти-лок в длинном батче)
  const rec = await sealedOrMigrate(accountId);
  if (rec.mode === "ed25519") {
    let key = signingCache.get(accountId);
    if (!key) {
      const priv32 = await priv32Of(rec);
      key = await crypto.subtle.importKey(
        "pkcs8",
        pkcs8FromRawPriv(priv32) as BufferSource,
        { name: "Ed25519" },
        false,
        ["sign"],
      );
      priv32.fill(0);
      signingCache.set(accountId, key);
    }
    const sig = await crypto.subtle.sign({ name: "Ed25519" }, key, message as BufferSource);
    return new Uint8Array(sig);
  }
  // Fallback (нет Ed25519 в WebCrypto): приват в памяти, подпись noble, затираем.
  const priv32 = await priv32Of(rec);
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
  const rec = await sealedOrMigrate(accountId);
  if (rec.keyOnly) {
    throw new Error("NO_SEED: кошелёк импортирован по приватному ключу — сид-фразы нет");
  }
  const { seed } = await secretsOf(rec);
  if (!seed) throw new Error("NO_SEED: сид недоступен для этого кошелька");
  return seed;
}

/**
 * Показать приватный ключ (ed25519:<base58>). Работает для ОБОИХ типов:
 *  - key-only: сохранённый приватник;
 *  - seed: деривируем приват из сида.
 * Возвращает null если кошелёк не secure (legacy plain/PIN — там путь через
 * getKeyPairBytes/getSeedPhrase в embeddedWallet).
 */
export async function revealPrivateKey(accountId: string): Promise<string | null> {
  assertAppUnlocked(); // замок: не выдаём приватный ключ при заблокированном кошельке
  if (!(await idbGet<StoredRecord>(accountId))) return null;
  const rec = await sealedOrMigrate(accountId);
  const secrets = await secretsOf(rec);
  if (rec.keyOnly && secrets.secretKey) return secrets.secretKey;
  const priv32 = await priv32Of(rec);
  const pub32 = await ed25519.getPublicKeyAsync(priv32);
  const concat = new Uint8Array(64);
  concat.set(priv32, 0);
  concat.set(pub32, 32);
  priv32.fill(0);
  return `ed25519:${base58.encode(concat)}`;
}

/**
 * Перенос под пароль (зовёт appLock при вводе пароля): прежние записи IndexedDB
 * и старые незашифрованные сиды из localStorage — в запечатанные записи.
 */
export async function sealAllWallets(): Promise<void> {
  if (!hasVaultKey()) return;
  const { listWalletAccounts, loadWalletBlob, isPlainBlob, readPlainBlob, removeWalletBlob } =
    await import("./walletStorage");
  for (const acc of await listWalletAccounts()) {
    const raw = await loadWalletBlob(acc);
    if (!raw || !isPlainBlob(raw)) continue;
    let seed = "";
    try {
      seed = readPlainBlob(raw);
    } catch {
      continue;
    }
    if (!seed) continue;
    if (!(await idbGet<StoredRecord>(acc))) await setupSecureWallet(seed, acc);
    const rec = await sealedOrMigrate(acc);
    // Открытый сид → запечатанная копия (страховка остаётся, но под паролем);
    // убираем, только когда запечатанная запись даёт тот же сид.
    if ((await secretsOf(rec)).seed !== seed.trim()) continue;
    writeSealedCopy(acc, rec);
    await removeWalletBlob(acc);
  }
  await sealStoredWallets();
}

/** Смена пароля: всё запечатанное — под новый ключ (сбой — ничего не тронуто). */
export async function resealAllWallets(
  oldKey: CryptoKey,
  newKey: CryptoKey,
  newBlob: VerificationBlob,
): Promise<void> {
  await resealStoredWallets(oldKey, newKey, newBlob);
  signingCache.clear();
}

/** Удалить безопасную запись (при удалении кошелька). */
export async function removeSecureWallet(accountId: string): Promise<void> {
  await idbDelete(accountId);
  removeSealedCopy(accountId);
  signingCache.delete(accountId);
}
