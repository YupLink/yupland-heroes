// Ключ, которым запечатаны секреты кошельков (аудит 11.11.2026; владелец: «да,
// делай»). Раньше сид и подписывающий ключ лежали в IndexedDB под ключом
// браузера: чужой скрипт на нашем домене мог ими подписать и расшифровать сид, а
// «пароль кошелька» был только замком интерфейса (метка в localStorage). Теперь
// секреты зашифрованы ключом из пароля кошелька (PBKDF2 → AES-GCM, appLock), и
// этот ключ живёт ТОЛЬКО в памяти открытой страницы: перезагрузка или новое окно —
// ввести пароль снова. Без пароля секреты не открыть никому.
//
// Каждая запечатанная запись несёт блоб проверки своего пароля (vault): по нему
// пароль восстанавливается, если localStorage очистился, и видно, каким паролем
// она закрыта. Другая вкладка сменила или сбросила пароль — ключ этой вкладки
// устарел: печатать им нельзя (APP_LOCKED), иначе запись закрылась бы паролем,
// которого уже нет.
import { LS_VERIFICATION, parseVerificationBlob, type VerificationBlob } from "./appLockCrypto";

export type Sealed = { iv: Uint8Array; ct: ArrayBuffer; vault?: VerificationBlob };
/** Что запечатано: сид (кошелёк из сид-фразы) или приватный ключ (key-only). */
export type VaultSecrets = { seed?: string; secretKey?: string };

let vaultKey: CryptoKey | null = null;
let vaultBlob: VerificationBlob | null = null;
const lockHooks: Array<() => void> = [];

/** Разблокировано по-настоящему: ключ из пароля есть в памяти этой страницы. */
export function hasVaultKey(): boolean {
  return vaultKey !== null;
}

/** appLock: пароль проверен — ключ (и блоб его пароля) в память. */
export function setVaultKey(key: CryptoKey, blob: VerificationBlob): void {
  vaultKey = key;
  vaultBlob = blob;
}

/** Замок: ключ и всё, что от него открыто в памяти, — прочь. */
export function clearVaultKey(): void {
  vaultKey = null;
  vaultBlob = null;
  for (const fn of lockHooks) {
    try {
      fn();
    } catch {
      /* ignore */
    }
  }
}

/** Кэши открытого (подписывающие ключи) чистятся вместе с замком. */
export function onVaultLock(fn: () => void): void {
  lockHooks.push(fn);
}

/** Ключ памяти — от пароля, что сейчас стоит на устройстве; иначе замок. */
function currentKey(): CryptoKey {
  if (!vaultKey || !vaultBlob) throw new Error("APP_LOCKED");
  const stored = parseVerificationBlob(globalThis.localStorage?.getItem(LS_VERIFICATION));
  if (stored?.salt !== vaultBlob.salt) {
    clearVaultKey();
    throw new Error("APP_LOCKED");
  }
  return vaultKey;
}

let lockDepth = 0;
/**
 * Перешифровка и запись кошельков — по одной на все вкладки (Web Locks), чтобы
 * вкладка со старым ключом не записала кошелёк посреди смены пароля в другой.
 * Вложенный вызов в той же вкладке идёт без нового замка.
 */
export async function withVaultLock<T>(fn: () => Promise<T>): Promise<T> {
  const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
  if (lockDepth > 0 || !locks?.request) return fn();
  return locks.request("yl-wallet-vault", async () => {
    lockDepth++;
    try {
      return await fn();
    } finally {
      lockDepth--;
    }
  });
}

/** Запечатать секреты: ключом памяти или явным ключом (смена пароля). */
export async function seal(
  secrets: VaultSecrets,
  key?: CryptoKey | null,
  blob?: VerificationBlob,
): Promise<Sealed> {
  const k = key ?? currentKey();
  const vault = key ? blob : (vaultBlob ?? undefined);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    k,
    new TextEncoder().encode(JSON.stringify(secrets)),
  );
  return { iv, ct, vault };
}

/** Открыть запечатанное. Нет ключа — APP_LOCKED; чужой ключ — ошибка расшифровки. */
export async function unseal(s: Sealed, key?: CryptoKey | null): Promise<VaultSecrets> {
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: s.iv as BufferSource },
    key ?? currentKey(),
    s.ct,
  );
  const v = JSON.parse(new TextDecoder().decode(pt)) as VaultSecrets;
  return {
    seed: typeof v.seed === "string" ? v.seed : undefined,
    secretKey: typeof v.secretKey === "string" ? v.secretKey : undefined,
  };
}
