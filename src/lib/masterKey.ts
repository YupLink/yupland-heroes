// Глобальный master-PIN для всех embedded-кошельков юзера.
//
// Зачем: чтобы юзер ввёл PIN ОДИН раз и мог подписывать сразу с нескольких
// своих кошельков (multi-wallet оплата). До этого PIN был per-account —
// каждый кошелёк свой, неудобно.
//
// Архитектура:
//   1. PIN → derive AES-256 key через PBKDF2 (600k iter, salt 16 байт).
//   2. Создаётся verification-blob: AES-GCM шифрование известной строки
//      "yl-master-v1" этим ключом. Хранится в localStorage `yl:master-v1`.
//   3. При unlock: derive key → попытка decrypt verification → если plaintext
//      совпал, ключ верный → кэшируем CryptoKey в JS-памяти на 5 минут.
//   4. Кошельки шифруются этим master-key'ом (формат blob v=2, mk=true).
//
// Безопасность:
//   - PIN никогда не уходит за пределы вкладки. Сервер видит только
//     уже-зашифрованные blob'ы (если включён cloud-sync — даже там
//     криптотекст).
//   - Master CryptoKey в памяти не извлекаемый (extractable=false).
//   - При window unload / explicit lock — кэш чистится.

import {
  encryptWithMaster,
  decryptWithMaster,
  type MasterEncryptedBlob,
} from "./walletCrypto";

const ITERATIONS = 600_000;
const VERIFICATION_PLAINTEXT = "yl-master-v1";
const LS_VERIFICATION = "yl:master-v1";
const CACHE_TTL_MS = 5 * 60_000;

// JS-memory cache: { key, expiresAt }. extractable=false → невозможно слить.
let cached: { key: CryptoKey; expiresAt: number } | null = null;

function lsAvail(): boolean {
  return typeof window !== "undefined" && !!window.localStorage;
}

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

async function derivePinToKey(
  pin: string,
  salt: Uint8Array
): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pin),
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
    false, // extractable=false: ключ нельзя экспортировать из браузера
    ["encrypt", "decrypt"]
  );
}

interface VerificationBlob {
  v: 1;
  kdf: "pbkdf2-sha256";
  iter: number;
  salt: string;
  nonce: string;
  ct: string;
}

function loadVerificationBlob(): VerificationBlob | null {
  if (!lsAvail()) return null;
  const raw = localStorage.getItem(LS_VERIFICATION);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as VerificationBlob;
    if (!parsed || parsed.v !== 1 || !parsed.salt || !parsed.nonce || !parsed.ct)
      return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Установлен ли master-PIN. */
export function hasMasterPin(): boolean {
  return !!loadVerificationBlob();
}

/** Разблокирован ли master (есть валидный ключ в кэше). */
export function isMasterUnlocked(): boolean {
  if (!cached) return false;
  if (cached.expiresAt <= Date.now()) {
    cached = null;
    return false;
  }
  return true;
}

/** Сколько секунд осталось до auto-lock (или 0 если уже заблокирован). */
export function masterUnlockSecondsLeft(): number {
  if (!cached) return 0;
  const left = Math.floor((cached.expiresAt - Date.now()) / 1000);
  return left > 0 ? left : 0;
}

/**
 * Установить master-PIN впервые. Бросает если PIN уже установлен —
 * для смены PIN'а используй changeMasterPin().
 */
export async function setupMasterPin(pin: string): Promise<void> {
  if (!lsAvail()) throw new Error("localStorage недоступен");
  if (loadVerificationBlob()) throw new Error("Master-PIN уже установлен");
  if (pin.length < 6) throw new Error("PIN минимум 6 символов");

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const key = await derivePinToKey(pin, salt);
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    key,
    new TextEncoder().encode(VERIFICATION_PLAINTEXT)
  );
  const blob: VerificationBlob = {
    v: 1,
    kdf: "pbkdf2-sha256",
    iter: ITERATIONS,
    salt: b64encode(salt),
    nonce: b64encode(nonce),
    ct: b64encode(ct),
  };
  localStorage.setItem(LS_VERIFICATION, JSON.stringify(blob));
  cached = { key, expiresAt: Date.now() + CACHE_TTL_MS };
}

/**
 * Разблокировать master введением PIN'а. Возвращает CryptoKey и кэширует
 * его на 5 минут. Если PIN неверный — бросает "Неверный PIN".
 */
export async function unlockMaster(pin: string): Promise<CryptoKey> {
  const blob = loadVerificationBlob();
  if (!blob) throw new Error("Master-PIN не установлен");
  const salt = b64decode(blob.salt);
  const nonce = b64decode(blob.nonce);
  const ct = b64decode(blob.ct);
  const key = await derivePinToKey(pin, salt);
  try {
    const pt = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: nonce },
      key,
      ct
    );
    const text = new TextDecoder().decode(pt);
    if (text !== VERIFICATION_PLAINTEXT) throw new Error("verify failed");
  } catch {
    throw new Error("Неверный PIN");
  }
  cached = { key, expiresAt: Date.now() + CACHE_TTL_MS };
  return key;
}

/**
 * Получить master-key из кэша или null если заблокирован.
 * НЕ запрашивает PIN — caller должен вызвать unlockMaster() если null.
 */
export function getCachedMasterKey(): CryptoKey | null {
  if (!isMasterUnlocked()) return null;
  return cached!.key;
}

/** Освежить TTL (после успешной операции). */
export function touchMasterCache(): void {
  if (cached) cached.expiresAt = Date.now() + CACHE_TTL_MS;
}

/** Заблокировать сейчас (стереть кэш). */
export function lockMaster(): void {
  cached = null;
}

/**
 * Сменить master-PIN. Требует старый PIN для проверки. После смены
 * verification-blob перезаписывается; все wallet-blob'ы НЕ перешифровываются
 * — для этого вызывай rotateAllWallets() отдельно.
 */
export async function changeMasterPin(
  oldPin: string,
  newPin: string
): Promise<void> {
  await unlockMaster(oldPin); // throws если oldPin неверный
  if (newPin.length < 6) throw new Error("Новый PIN минимум 6 символов");
  // Перевыпуск verification + новый кэшированный ключ
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const newKey = await derivePinToKey(newPin, salt);
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    newKey,
    new TextEncoder().encode(VERIFICATION_PLAINTEXT)
  );
  const blob: VerificationBlob = {
    v: 1,
    kdf: "pbkdf2-sha256",
    iter: ITERATIONS,
    salt: b64encode(salt),
    nonce: b64encode(nonce),
    ct: b64encode(ct),
  };
  localStorage.setItem(LS_VERIFICATION, JSON.stringify(blob));
  cached = { key: newKey, expiresAt: Date.now() + CACHE_TTL_MS };
}

/**
 * Полностью удалить master-PIN. Кошельки, защищённые им, останутся
 * зашифрованными и недоступными — поэтому caller должен СНАЧАЛА
 * расшифровать все кошельки и пере-сохранить как plain, потом вызвать это.
 */
export function removeMasterPinUnsafe(): void {
  if (!lsAvail()) return;
  localStorage.removeItem(LS_VERIFICATION);
  cached = null;
}

// ──────── Wallet blob через master ────────

/** Зашифровать seed master-key'ом. Требует разблокированный master. */
export async function encryptSeedWithMaster(
  seed: string
): Promise<MasterEncryptedBlob> {
  const key = getCachedMasterKey();
  if (!key) throw new Error("Master заблокирован — введи PIN");
  return encryptWithMaster(seed, key);
}

/** Расшифровать blob master-key'ом. Требует разблокированный master. */
export async function decryptSeedWithMaster(
  blob: MasterEncryptedBlob
): Promise<string> {
  const key = getCachedMasterKey();
  if (!key) throw new Error("Master заблокирован — введи PIN");
  return decryptWithMaster(blob, key);
}
