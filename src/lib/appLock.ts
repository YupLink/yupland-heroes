// App-lock: пользовательский ПАРОЛЬ на доступ к кошельку ВНУТРИ приложения.
//
// Это НЕ шифрование рабочего ключа (неизвлекаемый Ed25519 в IndexedDB не
// трогаем) — это внутренний замок приложения. Он гейтит:
//   • вход в раздел кошелька (показ баланса/действий),
//   • показ сид-фразы и приватного ключа,
//   • подпись dApp-транзакций (/wallet/sign).
//
// Модель (тот же проверенный паттерн, что master-PIN, но отдельная сущность и
// с настраиваемым авто-локом):
//   1. Пароль (8+) → PBKDF2(600k, SHA-256) → AES-256 verification-key
//      (extractable=false).
//   2. Verification-blob: AES-GCM(известная строка) в localStorage
//      yl:applock-v1. Сам пароль никуда не сохраняется.
//   3. unlock: derive → decrypt verify → совпало → «разблокировано до T».
//   4. T = now + авто-лок. Авто-лок настраивается (дефолт 1 час); «Никогда» =
//      бесконечно и сбрасывается только перезагрузкой/закрытием вкладки (кэш
//      времени живёт в JS-памяти, не в localStorage).
//   5. При локе вызываем хук очистки seedCache (ставит embeddedWallet, чтобы
//      открытый сид не висел в памяти после блокировки).
//
// Забыл пароль — кошелёк НЕ потерян: удаляешь его с устройства и возвращаешь по
// сид-фразе или серверному бэкапу. Пароль чисто для внутрянки приложения.

const ITERATIONS = 600_000;
const VERIFICATION_PLAINTEXT = "yl-applock-v1";
const LS_VERIFICATION = "yl:applock-v1";
const LS_AUTOLOCK = "yl:applock-autolock-ms";
const LS_SESSION = "yl:applock-session";

export const DEFAULT_AUTOLOCK_MS = 60 * 60_000; // 1 час
export const APPLOCK_NEVER = -1; // спец-значение авто-лока «Никогда»

// «разблокировано до» (ms-timestamp; 0=заблокировано, Infinity=«Никогда»)
// храним в localStorage — чтобы одна разблокировка действовала на ВЕСЬ origin:
// раздел кошелька, окно подписи /wallet/sign (даже в iframe/после редиректа от
// dApp), все вкладки. Иначе подтверждение транзы спрашивало бы пароль повторно.
// memUntil — фолбэк для SSR / окружений без localStorage.
let memUntil = 0;

function getUntil(): number {
  if (!lsAvail()) return memUntil;
  const raw = localStorage.getItem(LS_SESSION);
  if (!raw) return 0;
  if (raw === "never") return Number.POSITIVE_INFINITY;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function setUntil(until: number): void {
  memUntil = until;
  if (!lsAvail()) return;
  if (until === 0) localStorage.removeItem(LS_SESSION);
  else
    localStorage.setItem(
      LS_SESSION,
      until === Number.POSITIVE_INFINITY ? "never" : String(until)
    );
}

// Хук очистки кэша сидов. Ставится из embeddedWallet (избегаем цикл-импорта).
let lockHook: (() => void) | null = null;
export function setAppLockHook(fn: () => void): void {
  lockHook = fn;
}

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

async function derivePwdToKey(pw: string, salt: Uint8Array): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pw),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false, // extractable=false
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

function loadBlob(): VerificationBlob | null {
  if (!lsAvail()) return null;
  const raw = localStorage.getItem(LS_VERIFICATION);
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as VerificationBlob;
    if (!p || p.v !== 1 || !p.salt || !p.nonce || !p.ct) return null;
    return p;
  } catch {
    return null;
  }
}

async function makeBlob(pw: string): Promise<VerificationBlob> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const key = await derivePwdToKey(pw, salt);
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    key,
    new TextEncoder().encode(VERIFICATION_PLAINTEXT)
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

/** Проверить пароль против verification-blob. Неверный → throw "Неверный пароль". */
async function verifyOnly(blob: VerificationBlob, pw: string): Promise<void> {
  const key = await derivePwdToKey(pw, b64decode(blob.salt));
  try {
    const pt = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: b64decode(blob.nonce) },
      key,
      b64decode(blob.ct)
    );
    if (new TextDecoder().decode(pt) !== VERIFICATION_PLAINTEXT)
      throw new Error("verify");
  } catch {
    throw new Error("Неверный пароль");
  }
}

// ──────── Авто-лок (настраиваемое время открытого доступа) ────────

/** Текущее время авто-лока в ms (или APPLOCK_NEVER = -1 для «Никогда»). */
export function getAutoLockMs(): number {
  if (!lsAvail()) return DEFAULT_AUTOLOCK_MS;
  const raw = localStorage.getItem(LS_AUTOLOCK);
  if (raw == null) return DEFAULT_AUTOLOCK_MS;
  const n = Number(raw);
  if (Number.isNaN(n)) return DEFAULT_AUTOLOCK_MS;
  return n; // -1 = «Никогда»
}

/** Задать время авто-лока. Если уже разблокировано — пересчитать окно. */
export function setAutoLockMs(ms: number): void {
  if (!lsAvail()) return;
  localStorage.setItem(LS_AUTOLOCK, String(ms));
  if (getUntil() !== 0) setUntil(nextExpiry());
}

function nextExpiry(): number {
  const ms = getAutoLockMs();
  return ms < 0 ? Number.POSITIVE_INFINITY : Date.now() + ms;
}

// ──────── Состояние ────────

/** Установлен ли пароль кошелька. */
export function hasAppPassword(): boolean {
  return !!loadBlob();
}

/** Разблокировано ли сейчас (с учётом авто-лока). Истёкшее окно → лок + чистка. */
export function isAppUnlocked(): boolean {
  const until = getUntil();
  if (until === 0) return false;
  if (until <= Date.now()) {
    lockApp();
    return false;
  }
  return true;
}

/** Секунд до авто-лока. Infinity для «Никогда», 0 если заблокировано. */
export function appUnlockSecondsLeft(): number {
  if (!isAppUnlocked()) return 0;
  const until = getUntil();
  if (until === Number.POSITIVE_INFINITY) return Number.POSITIVE_INFINITY;
  const left = Math.floor((until - Date.now()) / 1000);
  return left > 0 ? left : 0;
}

/** Заблокировать сейчас (+ очистить кэш сидов). Действует на весь origin. */
export function lockApp(): void {
  setUntil(0);
  try {
    lockHook?.();
  } catch {
    /* ignore */
  }
}

/** Освежить окно разблокировки (после активности). */
export function touchAppCache(): void {
  if (getUntil() !== 0) setUntil(nextExpiry());
}

// ──────── Установка / разблокировка / смена / снятие ────────

/** Установить пароль впервые. Бросает, если уже установлен. Сразу разблокирует. */
export async function setupAppPassword(pw: string): Promise<void> {
  if (!lsAvail()) throw new Error("localStorage недоступен");
  if (loadBlob()) throw new Error("Пароль уже установлен");
  if (pw.length < 8) throw new Error("Пароль минимум 8 символов");
  localStorage.setItem(LS_VERIFICATION, JSON.stringify(await makeBlob(pw)));
  setUntil(nextExpiry());
}

/** Разблокировать вводом пароля. Неверный → throw "Неверный пароль". */
export async function unlockApp(pw: string): Promise<void> {
  const blob = loadBlob();
  if (!blob) throw new Error("Пароль не установлен");
  await verifyOnly(blob, pw);
  setUntil(nextExpiry());
}

/**
 * Проверить пароль БЕЗ изменения сессии (для гейта показа сид/ключа — он
 * спрашивается всегда, независимо от разблокировки входа). Неверный → throw.
 */
export async function verifyAppPassword(pw: string): Promise<void> {
  const blob = loadBlob();
  if (!blob) throw new Error("Пароль не установлен");
  await verifyOnly(blob, pw);
}

/** Сменить пароль (нужен текущий). */
export async function changeAppPassword(oldPw: string, newPw: string): Promise<void> {
  const blob = loadBlob();
  if (!blob) throw new Error("Пароль не установлен");
  await verifyOnly(blob, oldPw);
  if (newPw.length < 8) throw new Error("Новый пароль минимум 8 символов");
  localStorage.setItem(LS_VERIFICATION, JSON.stringify(await makeBlob(newPw)));
  setUntil(nextExpiry());
}

/** Снять пароль (нужен текущий). */
export async function removeAppPassword(pw: string): Promise<void> {
  const blob = loadBlob();
  if (!blob) return;
  await verifyOnly(blob, pw);
  if (lsAvail()) localStorage.removeItem(LS_VERIFICATION);
  lockApp();
}

/**
 * Сброс пароля БЕЗ его знания — для сценария «Забыл пароль».
 * ВАЖНО: вызывать ТОЛЬКО вместе с удалением локальных кошельков, иначе замок
 * обходится одной кнопкой. Безопасность сценария: после сброса локальный кош
 * удалён, и вернуть его (а значит и деньги) можно лишь по сид-фразе/серверному
 * бэкапу — у атакующего без сид-фразы доступа к средствам нет.
 */
export function resetAppLockForce(): void {
  if (lsAvail()) localStorage.removeItem(LS_VERIFICATION);
  lockApp();
}
