// IndexedDB кошельков: одна запись на accountId (вынесено из secureWallet.ts).
// Запись — StoredRecord: публичный ключ и режим подписи; секреты — либо
// запечатаны паролем кошелька (sealedIv/sealedCt, walletVault — с 11.11.2026),
// либо по-старому под неизвлекаемыми ключами браузера (seedWrapKey/privWrapKey,
// signingKey) — такие запечатываются при первом вводе пароля.
import type { VerificationBlob } from "./appLockCrypto";

const DB_NAME = "yl-secure-wallet";
const STORE = "wallets";

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
export async function idbPut(key: string, value: unknown): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}
/** Несколько записей ОДНОЙ транзакцией: либо все, либо ни одной. */
export async function idbPutMany(entries: Array<[string, unknown]>): Promise<void> {
  if (entries.length === 0) return;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    for (const [k, v] of entries) tx.objectStore(STORE).put(v, k);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("idb: транзакция прервана"));
  });
  db.close();
}
export async function idbGet<T>(key: string): Promise<T | null> {
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
export async function idbDelete(key: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve();
  });
  db.close();
}
export async function idbKeys(): Promise<string[]> {
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
export type StoredRecord = {
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
  /** Секреты под ключом пароля кошелька (walletVault): {seed} или {secretKey}. */
  sealedIv?: Uint8Array;
  sealedCt?: ArrayBuffer;
  /** Блоб проверки пароля, которым запечатано (appLockCrypto). */
  vault?: VerificationBlob;
};
