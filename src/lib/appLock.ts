// App-lock: ПАРОЛЬ кошелька внутри приложения. Гейтит раздел кошелька, показ
// сид-фразы/приватного ключа и подпись dApp-транзакций (/wallet/sign).
//
// С 11.11.2026 (аудит, владелец: «да, делай») пароль ШИФРУЕТ секреты кошельков:
// PBKDF2(600k) → AES-ключ (appLockCrypto), его держит walletVault в памяти
// страницы, им запечатаны записи secureWallet. «Разблокировано» = ключ в памяти
// (перезагрузка, новое окно — ввести снова); метка в localStorage — только
// таймер авто-лока (appLockSession), подделка её ничего не открывает. Пароль
// обязателен, пока на устройстве есть кошелёк.
//
// Блоб проверки: AES-GCM(известная строка) в localStorage yl:applock-v1; сам
// пароль никуда не сохраняется. Его копия — в каждой запечатанной записи: при
// проверке пароля правда берётся из записей (так переживаются очищенный
// localStorage и смена пароля, оборванная посередине). Забыл пароль — кошелёк
// удаляется с устройства и возвращается по сид-фразе или серверному бэкапу.
import {
  LS_VERIFICATION,
  makeBlob,
  parseVerificationBlob,
  sameBlob,
  verifyOnly,
  type VerificationBlob,
} from "./appLockCrypto";
import { getUntil, lsAvail, nextExpiry, setUntil } from "./appLockSession";
import { clearVaultKey, hasVaultKey, setVaultKey, withVaultLock } from "./walletVault";

export {
  APPLOCK_NEVER,
  DEFAULT_AUTOLOCK_MS,
  getAutoLockMs,
  setAutoLockMs,
  touchAppCache,
} from "./appLockSession";

// Хук очистки кэша сидов. Ставится из embeddedWallet (избегаем цикл-импорта).
let lockHook: (() => void) | null = null;
export function setAppLockHook(fn: () => void): void {
  lockHook = fn;
}

function loadBlob(): VerificationBlob | null {
  return lsAvail() ? parseVerificationBlob(localStorage.getItem(LS_VERIFICATION)) : null;
}
function saveBlob(b: VerificationBlob): void {
  localStorage.setItem(LS_VERIFICATION, JSON.stringify(b));
}

/** Пароли, которыми закрыты кошельки на устройстве (правда — в самих записях). */
async function recordBlobs(): Promise<VerificationBlob[]> {
  const { sealedVaultBlobs } = await import("./secureWalletSeal");
  return sealedVaultBlobs();
}

/** Проверить пароль: против записей кошельков, а без них — против localStorage. */
async function checkPassword(pw: string): Promise<{ key: CryptoKey; blob: VerificationBlob }> {
  const recs = await recordBlobs();
  const main = loadBlob();
  const list = recs.length ? recs : main ? [main] : [];
  if (!list.length) throw new Error("Пароль не установлен");
  for (const blob of list) {
    try {
      return { key: await verifyOnly(blob, pw), blob };
    } catch {
      /* следующий */
    }
  }
  throw new Error("Неверный пароль");
}

/** Ключ пароля — в память страницы; блоб записей — главный (чинит localStorage). */
function openVault(key: CryptoKey, blob: VerificationBlob): void {
  if (!sameBlob(loadBlob(), blob)) saveBlob(blob);
  setVaultKey(key, blob);
  setUntil(nextExpiry());
}

/** Запечатать паролем кошельки, что ещё лежат по-старому. Сбой — не помеха входу. */
async function sealWallets(): Promise<void> {
  const { sealAllWallets } = await import("./secureWallet");
  try {
    await withVaultLock(sealAllWallets);
  } catch (e) {
    if (e instanceof Error && e.message === "APP_LOCKED") throw e;
    console.warn("[applock] перенос кошельков под пароль", e);
  }
}

/**
 * localStorage очистился, а кошельки под паролем остались — вернуть блоб пароля
 * из записей (иначе «поставь пароль» завёл бы новый, и кошельки не открылись бы).
 */
export async function restoreAppPassword(): Promise<boolean> {
  if (!lsAvail() || loadBlob()) return false;
  const [b] = await recordBlobs();
  if (!b) return false;
  saveBlob(b);
  return true;
}

// ──────── Состояние ────────

/** Установлен ли пароль кошелька. */
export function hasAppPassword(): boolean {
  return !!loadBlob();
}

/** Разблокировано ли сейчас (с учётом авто-лока). Истёкшее окно → лок + чистка. */
export function isAppUnlocked(): boolean {
  // Без ключа в памяти этой страницы секреты не открыть — значит, заблокировано.
  if (!hasVaultKey()) return false;
  const until = getUntil();
  if (until === 0) return false;
  if (until <= Date.now()) {
    lockApp();
    return false;
  }
  return true;
}

/** Можно создавать/подписывать: пароль есть и ключ открыт в этой странице. */
export function vaultReady(): boolean {
  return hasAppPassword() && isAppUnlocked();
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
  clearVaultKey();
  try {
    lockHook?.();
  } catch {
    /* ignore */
  }
}

// ──────── Установка / разблокировка / смена / снятие ────────

/** Установить пароль впервые. Бросает, если уже установлен. Сразу разблокирует. */
export async function setupAppPassword(pw: string): Promise<void> {
  if (!lsAvail()) throw new Error("localStorage недоступен");
  if (loadBlob() || (await restoreAppPassword())) throw new Error("Пароль уже установлен");
  if (pw.length < 8) throw new Error("Пароль минимум 8 символов");
  const { blob, key } = await makeBlob(pw);
  saveBlob(blob);
  openVault(key, blob);
  await sealWallets();
}

/** Разблокировать вводом пароля. Неверный → throw "Неверный пароль". */
export async function unlockApp(pw: string): Promise<void> {
  const { key, blob } = await checkPassword(pw);
  openVault(key, blob);
  await sealWallets();
}

/**
 * Проверить пароль БЕЗ изменения сессии (для гейта показа сид/ключа — он
 * спрашивается всегда, независимо от разблокировки входа). Неверный → throw.
 */
export async function verifyAppPassword(pw: string): Promise<void> {
  await checkPassword(pw);
}

/** Сменить пароль (нужен текущий). */
export async function changeAppPassword(oldPw: string, newPw: string): Promise<void> {
  if (newPw.length < 8) throw new Error("Новый пароль минимум 8 символов");
  await withVaultLock(async () => {
    const old = await checkPassword(oldPw);
    const next = await makeBlob(newPw);
    // Сначала кошельки — одной транзакцией и с блобом нового пароля в каждой
    // записи, потом сам пароль: оборвалось посередине — ничего не потеряно.
    const { resealAllWallets } = await import("./secureWallet");
    await resealAllWallets(old.key, next.key, next.blob);
    saveBlob(next.blob);
    openVault(next.key, next.blob);
  });
}

/** Снять пароль (нужен текущий). */
export async function removeAppPassword(pw: string): Promise<void> {
  if (!loadBlob()) return;
  await checkPassword(pw);
  // Пароль обязателен, пока на устройстве есть кошелёк: им зашифрованы ключи.
  const { listSecureAccounts } = await import("./secureWallet");
  if ((await listSecureAccounts()).length > 0) {
    throw new Error("Пароль нужен, пока на устройстве есть кошелёк — он шифрует ключи");
  }
  if (lsAvail()) localStorage.removeItem(LS_VERIFICATION);
  lockApp();
}

/**
 * «Забыл пароль». Кошельки под паролем без него не открыть — они удаляются с
 * устройства (вернуть — по сид-фразе / серверному бэкапу). Исключение: на
 * устройстве нет ни одного кошелька под паролем, а прежний замок ещё открыт
 * (метка сессии действует) — тогда снимается только пароль, кошельки остаются
 * и закрываются новым паролем. Это ровно та защита, что была до 11.11.
 */
export async function forgotAppPassword(): Promise<"kept" | "removed"> {
  const { hasSealedWallets } = await import("./secureWalletSeal");
  const keep = getUntil() > Date.now() && !(await hasSealedWallets());
  if (!keep) {
    const { listLocalWallets, removeLocalWallet } = await import("./embeddedWallet");
    for (const a of await listLocalWallets()) await removeLocalWallet(a);
  }
  resetAppLockForce();
  return keep ? "kept" : "removed";
}

/**
 * Сброс пароля БЕЗ его знания. Только через forgotAppPassword (вместе с удалением
 * кошельков под паролем) — иначе замок обходится одной кнопкой.
 */
export function resetAppLockForce(): void {
  if (lsAvail()) localStorage.removeItem(LS_VERIFICATION);
  lockApp();
}
