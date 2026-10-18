// Хранилище encrypted wallet blob'ов — только localStorage (HOT-style:
// per-device, не синкается между устройствами). На новом устройстве кошелёк
// восстанавливается импортом сид-фразы. Облачной синхронизации больше нет.
//
// Если PIN отключён — храним plain seed в формате {plain: "...", pin: null}.
// Если PIN включён — храним EncryptedBlob (см. walletCrypto.ts).

const LS_PREFIX = "yl:wallet:";

function lsKey(accountId: string): string {
  return LS_PREFIX + accountId;
}

function lsAvail(): boolean {
  return typeof window !== "undefined" && !!window.localStorage;
}

/**
 * Сохранить blob в localStorage. Бросает, если localStorage недоступен.
 */
export async function saveWalletBlob(
  accountId: string,
  blobStr: string
): Promise<void> {
  if (!lsAvail()) throw new Error("localStorage недоступен");
  localStorage.setItem(lsKey(accountId), blobStr);
}

/**
 * Получить blob из localStorage.
 */
export async function loadWalletBlob(accountId: string): Promise<string | null> {
  if (!lsAvail()) return null;
  return localStorage.getItem(lsKey(accountId));
}

export async function removeWalletBlob(accountId: string): Promise<void> {
  if (lsAvail()) localStorage.removeItem(lsKey(accountId));
}

// ──────── Последний активный кошелёк ────────
// Чтобы при заходе открывался тот кош, которым юзер пользовался в прошлый
// раз, а не произвольный первый из списка. Ключ ВНЕ LS_PREFIX, иначе
// listWalletAccounts подхватил бы его как «кошелёк».
const LAST_ACTIVE_KEY = "yl:last-wallet";

export function getLastActiveWallet(): string | null {
  if (!lsAvail()) return null;
  return localStorage.getItem(LAST_ACTIVE_KEY);
}

export function setLastActiveWallet(accountId: string): void {
  if (lsAvail()) localStorage.setItem(LAST_ACTIVE_KEY, accountId);
}

/**
 * Список accountId всех локально доступных кошельков (из localStorage).
 */
export async function listWalletAccounts(): Promise<string[]> {
  const out = new Set<string>();
  if (lsAvail()) {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(LS_PREFIX)) out.add(k.slice(LS_PREFIX.length));
    }
  }
  return Array.from(out);
}

// ──────── Формат блоба: encrypted ИЛИ plain ────────

export interface PlainBlob {
  v: 1;
  plain: true;
  seed: string;
}

export function isPlainBlob(s: string): boolean {
  try {
    const j = JSON.parse(s);
    return j && j.plain === true;
  } catch {
    return false;
  }
}

export function makePlainBlob(seed: string): string {
  const b: PlainBlob = { v: 1, plain: true, seed };
  return JSON.stringify(b);
}

export function readPlainBlob(s: string): string {
  const j = JSON.parse(s) as PlainBlob;
  if (!j || !j.plain || !j.seed) throw new Error("Bad plain blob");
  return j.seed;
}
