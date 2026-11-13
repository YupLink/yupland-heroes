// Секреты кошельков под паролем (аудит 11.11.2026, walletVault). Запись в
// IndexedDB бывает двух видов:
//   • запечатанная — sealedIv/sealedCt: сид или приватный ключ под ключом из
//     пароля кошелька; без пароля не открыть;
//   • прежняя — сид/приватник под неизвлекаемым AES-ключом браузера и готовый
//     signingKey: чужой скрипт на нашем домене мог ими пользоваться.
// Прежние запечатываются при первом вводе пароля (sealStoredWallets); смена
// пароля перешифровывает всё ОДНОЙ транзакцией (resealStoredWallets). Каждая
// перезапись — только после проверки, что запечатанное открывается тем же ключом
// и даёт то же самое.
import type { VerificationBlob } from "./appLockCrypto";
import { idbGet, idbKeys, idbPut, idbPutMany, type StoredRecord } from "./secureWalletDb";
import { restoreFromCopies, sealedCopyIds, writeSealedCopy } from "./walletSealedCopy";
import { seal, unseal, type VaultSecrets } from "./walletVault";

const decryptText = async (key: CryptoKey, iv: Uint8Array, ct: ArrayBuffer) =>
  new TextDecoder().decode(
    await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, ct),
  );

/** Секреты прежней записи (ключи браузера). */
export async function legacySecrets(rec: StoredRecord): Promise<VaultSecrets> {
  if (rec.keyOnly) {
    if (!rec.privWrapKey || !rec.privIv || !rec.privCt) {
      throw new Error("Приватный ключ недоступен для этого кошелька");
    }
    return { secretKey: await decryptText(rec.privWrapKey, rec.privIv, rec.privCt) };
  }
  if (!rec.seedWrapKey || !rec.seedIv || !rec.seedCt) {
    throw new Error("NO_SEED: сид недоступен для этого кошелька");
  }
  return { seed: await decryptText(rec.seedWrapKey, rec.seedIv, rec.seedCt) };
}

export const isSealed = (rec: StoredRecord): boolean => !!rec.sealedIv && !!rec.sealedCt;

/** Секреты записи: запечатанной — ключом пароля, прежней — ключами браузера. */
export async function secretsOf(rec: StoredRecord, key?: CryptoKey | null): Promise<VaultSecrets> {
  if (isSealed(rec)) {
    return unseal({ iv: rec.sealedIv as Uint8Array, ct: rec.sealedCt as ArrayBuffer }, key);
  }
  return legacySecrets(rec);
}

const same = (a: VaultSecrets, b: VaultSecrets) =>
  (a.seed ?? "") === (b.seed ?? "") && (a.secretKey ?? "") === (b.secretKey ?? "");

/** Запись с теми же метаданными, секреты — запечатаны; без ключей браузера. */
export async function sealedRecord(
  base: StoredRecord,
  secrets: VaultSecrets,
  key?: CryptoKey | null,
  blob?: VerificationBlob,
): Promise<StoredRecord> {
  const s = await seal(secrets, key, blob);
  // Проверка до записи: запечатанное открывается и даёт то же самое.
  if (!same(await unseal(s, key), secrets)) throw new Error("seal: проверка не сошлась");
  return {
    mode: base.mode,
    accountId: base.accountId,
    publicKeyStr: base.publicKeyStr,
    keyOnly: base.keyOnly,
    signingKey: null,
    sealedIv: s.iv,
    sealedCt: s.ct,
    vault: s.vault,
  };
}

/**
 * Запечатать ключом пароля все прежние записи (нужен разблокированный кошелёк).
 * Нечитаемая запись не мешает остальным и разблокировке — остаётся как была.
 */
export async function sealStoredWallets(): Promise<number> {
  let n = 0;
  for (const id of await idbKeys()) {
    try {
      const rec = await idbGet<StoredRecord>(id);
      if (!rec || isSealed(rec)) continue;
      await idbPut(id, await sealedRecord(rec, await legacySecrets(rec)));
      n++;
    } catch (e) {
      if (e instanceof Error && e.message === "APP_LOCKED") throw e;
      console.warn("[wallet] не удалось запечатать", id, e);
    }
  }
  return n;
}

/**
 * Смена пароля: всё — под новый ключ. Сначала готовим ВСЕ записи (сбой — ничего
 * не тронуто), потом пишем одной транзакцией, потом копии в localStorage.
 * Каждая запись несёт блоб нового пароля: закрыли вкладку до записи пароля —
 * при входе пароль берётся из записей (appLock), кошельки не теряются.
 */
export async function resealStoredWallets(
  oldKey: CryptoKey,
  newKey: CryptoKey,
  newBlob: VerificationBlob,
): Promise<void> {
  const next: Array<[string, StoredRecord]> = [];
  for (const id of await idbKeys()) {
    const rec = await idbGet<StoredRecord>(id);
    if (!rec) continue;
    const secrets = await secretsOf(rec, oldKey);
    next.push([id, await sealedRecord(rec, secrets, newKey, newBlob)]);
  }
  await idbPutMany(next);
  const copies = new Set(sealedCopyIds());
  for (const [id, rec] of next) if (copies.has(id)) writeSealedCopy(id, rec);
}

/** Блобы паролей, которыми запечатаны кошельки на устройстве (обычно один). */
export async function sealedVaultBlobs(): Promise<VerificationBlob[]> {
  await restoreFromCopies();
  const out: VerificationBlob[] = [];
  for (const id of await idbKeys()) {
    const v = (await idbGet<StoredRecord>(id))?.vault;
    if (v && !out.some((b) => b.salt === v.salt)) out.push(v);
  }
  return out;
}

/** Есть ли на устройстве кошелёк под паролем (без пароля его не открыть). */
export async function hasSealedWallets(): Promise<boolean> {
  await restoreFromCopies();
  for (const id of await idbKeys()) {
    const rec = await idbGet<StoredRecord>(id);
    if (rec && isSealed(rec)) return true;
  }
  return false;
}
