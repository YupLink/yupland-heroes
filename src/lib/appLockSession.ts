// Таймер авто-лока пароля кошелька (вынесено из appLock.ts, 11.11.2026).
// «Разблокировано до» (ms; 0 = заблокировано, Infinity = «Никогда») лежит в
// localStorage — одна разблокировка действует на раздел кошелька, окно подписи
// /wallet/sign и все вкладки. Само по себе ничего не открывает: секреты
// открывает только ключ пароля в памяти страницы (walletVault).
// memUntil — фолбэк для SSR / окружений без localStorage.
const LS_AUTOLOCK = "yl:applock-autolock-ms";
const LS_SESSION = "yl:applock-session";

export const DEFAULT_AUTOLOCK_MS = 60 * 60_000; // 1 час
export const APPLOCK_NEVER = -1; // спец-значение авто-лока «Никогда»

let memUntil = 0;

export function lsAvail(): boolean {
  return typeof window !== "undefined" && !!window.localStorage;
}

export function getUntil(): number {
  if (!lsAvail()) return memUntil;
  const raw = localStorage.getItem(LS_SESSION);
  if (!raw) return 0;
  if (raw === "never") return Number.POSITIVE_INFINITY;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function setUntil(until: number): void {
  memUntil = until;
  if (!lsAvail()) return;
  if (until === 0) localStorage.removeItem(LS_SESSION);
  else
    localStorage.setItem(LS_SESSION, until === Number.POSITIVE_INFINITY ? "never" : String(until));
}

/** Текущее время авто-лока в ms (или APPLOCK_NEVER = -1 для «Никогда»). */
export function getAutoLockMs(): number {
  if (!lsAvail()) return DEFAULT_AUTOLOCK_MS;
  const raw = localStorage.getItem(LS_AUTOLOCK);
  if (raw == null) return DEFAULT_AUTOLOCK_MS;
  const n = Number(raw);
  if (Number.isNaN(n)) return DEFAULT_AUTOLOCK_MS;
  return n; // -1 = «Никогда»
}

export function nextExpiry(): number {
  const ms = getAutoLockMs();
  return ms < 0 ? Number.POSITIVE_INFINITY : Date.now() + ms;
}

/** Задать время авто-лока. Если уже разблокировано — пересчитать окно. */
export function setAutoLockMs(ms: number): void {
  if (!lsAvail()) return;
  localStorage.setItem(LS_AUTOLOCK, String(ms));
  if (getUntil() !== 0) setUntil(nextExpiry());
}

/** Освежить окно разблокировки (после активности). */
export function touchAppCache(): void {
  if (getUntil() !== 0) setUntil(nextExpiry());
}
