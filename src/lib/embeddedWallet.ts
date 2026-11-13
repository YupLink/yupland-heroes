// Non-custodial NEAR-кошелёк через чистый browser-native стек.
// ZERO Node-dependencies → НЕ нужны Buffer/process/global полифиллы.
//
// Используем:
//   - @scure/bip39 — генерация/парсинг seed-фразы (BIP39, чистый ESM)
//   - @noble/hashes — sha512 (для SLIP-0010 KDF) + sha256
//   - @noble/ed25519 — keypair + signing
//   - @scure/base — base58 encoding
//
// Совместимость с near-seed-phrase / near-api-js:
//   - same seed phrase → same NEAR keypair (NEAR derivation path m/44'/397'/0')
//   - publicKey в формате "ed25519:<base58>"
//   - implicit account = hex(public key bytes), 64 символа
//
// Поверх сидки — encryption через PIN (см. walletCrypto.ts), хранение в
// localStorage браузера (см. walletStorage.ts).

import { generateMnemonic, mnemonicToSeedSync, validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import * as ed25519 from "@noble/ed25519";
import { hmac } from "@noble/hashes/hmac.js";
import { sha512 } from "@noble/hashes/sha2.js";
import { base58 } from "@scure/base";
import {
  encryptWithPin,
  decryptWithPin,
  blobToString,
  blobFromString,
  detectBlobKind,
  type MasterEncryptedBlob,
} from "./walletCrypto";
import {
  saveWalletBlob,
  loadWalletBlob,
  removeWalletBlob,
  listWalletAccounts,
  makePlainBlob,
  readPlainBlob,
  isPlainBlob,
} from "./walletStorage";
import {
  hasMasterPin,
  getCachedMasterKey,
  encryptSeedWithMaster,
  decryptSeedWithMaster,
  touchMasterCache,
} from "./masterKey";
import {
  setupSecureWallet,
  setupSecureWalletFromPrivateKey,
  hasSecureWallet,
  isKeyOnlyWallet,
  loadSecureWallet,
  signWithSecure,
  revealSeed as secureRevealSeed,
  revealPrivateKey as secureRevealPrivateKey,
  listSecureAccounts,
  removeSecureWallet,
} from "./secureWallet";
import { setAppLockHook, hasAppPassword, isAppUnlocked } from "./appLock";

// NEAR derivation path: m/44'/397'/0' (NEAR coin = 397)
// Каждый компонент через `'` (hardened — bit 0x80000000)
const NEAR_DERIVATION_PATH = [44, 397, 0];

// SLIP-0010 для ed25519: master key derivation из seed
const HMAC_KEY_ED25519 = new TextEncoder().encode("ed25519 seed");

function deriveMasterKey(seed: Uint8Array): { key: Uint8Array; chainCode: Uint8Array } {
  const I = hmac(sha512, HMAC_KEY_ED25519, seed);
  return { key: I.slice(0, 32), chainCode: I.slice(32, 64) };
}

function deriveChildKey(
  parentKey: Uint8Array,
  parentChainCode: Uint8Array,
  index: number,
): { key: Uint8Array; chainCode: Uint8Array } {
  // Hardened: index | 0x80000000
  const hardenedIndex = (index | 0x80000000) >>> 0;
  const data = new Uint8Array(1 + 32 + 4);
  data[0] = 0x00;
  data.set(parentKey, 1);
  // big-endian 4-byte index
  data[33] = (hardenedIndex >>> 24) & 0xff;
  data[34] = (hardenedIndex >>> 16) & 0xff;
  data[35] = (hardenedIndex >>> 8) & 0xff;
  data[36] = hardenedIndex & 0xff;
  const I = hmac(sha512, parentChainCode, data);
  return { key: I.slice(0, 32), chainCode: I.slice(32, 64) };
}

function deriveNearKeyFromSeed(seed: Uint8Array): Uint8Array {
  let { key, chainCode } = deriveMasterKey(seed);
  for (const idx of NEAR_DERIVATION_PATH) {
    const r = deriveChildKey(key, chainCode, idx);
    key = r.key;
    chainCode = r.chainCode;
  }
  return key; // 32 bytes ed25519 private key
}

async function privateKeyToKeypair(privateKey: Uint8Array): Promise<{
  privateKey: Uint8Array;
  publicKey: Uint8Array;
}> {
  const publicKey = await ed25519.getPublicKeyAsync(privateKey);
  return { privateKey, publicKey };
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// «ed25519:<base58>» для публичного ключа
function encodePublicKey(publicKey: Uint8Array): string {
  return `ed25519:${base58.encode(publicKey)}`;
}

// «ed25519:<base58>» для приватного ключа (concat private+public = 64 байта по NEAR-конвенции)
function encodeSecretKey(privateKey: Uint8Array, publicKey: Uint8Array): string {
  const concat = new Uint8Array(64);
  concat.set(privateKey, 0);
  concat.set(publicKey, 32);
  return `ed25519:${base58.encode(concat)}`;
}

// Implicit account = hex 32-байтового public key (64 символа)
function publicKeyToImplicit(publicKey: Uint8Array): string {
  return bytesToHex(publicKey);
}

async function seedPhraseToNearKeys(seedPhrase: string): Promise<{
  publicKeyStr: string;
  secretKeyStr: string;
  accountId: string;
}> {
  const seed = mnemonicToSeedSync(seedPhrase);
  const priv = deriveNearKeyFromSeed(seed);
  const kp = await privateKeyToKeypair(priv);
  return {
    publicKeyStr: encodePublicKey(kp.publicKey),
    secretKeyStr: encodeSecretKey(kp.privateKey, kp.publicKey),
    accountId: publicKeyToImplicit(kp.publicKey),
  };
}

// Сырые байты NEAR-ключа из сид-фразы (та же деривация, что и везде).
// Нужно для secureWallet (импорт в неизвлекаемый WebCrypto-ключ).
export async function deriveRawKeyFromSeedPhrase(seedPhrase: string): Promise<{
  priv32: Uint8Array;
  pub32: Uint8Array;
  publicKeyStr: string;
  accountId: string;
}> {
  const seed = mnemonicToSeedSync(seedPhrase.trim());
  const priv = deriveNearKeyFromSeed(seed);
  const pub = await ed25519.getPublicKeyAsync(priv);
  return {
    priv32: priv,
    pub32: pub,
    publicKeyStr: `ed25519:${base58.encode(pub)}`,
    accountId: bytesToHex(pub),
  };
}

// In-memory cache расшифрованных сидов (живёт пока открыта вкладка)
const seedCache = new Map<string, string>();

// При блокировке приложения (app-lock) чистим открытые сиды из памяти, чтобы
// после лока plaintext-сид не висел в seedCache. Хук, а не прямой импорт
// embeddedWallet в appLock — избегаем цикла.
setAppLockHook(() => seedCache.clear());

// Единый lib-уровневый гард app-lock. Ставится в чокпоинтах доступа к секрету
// (getSeedPhrase/getKeyPairBytes) и к подписи (getSecureSigner) — чтобы замок
// НЕЛЬЗЯ было обойти мимо UI (консоль, demo-роуты, прямые dApp-URL). UI-гейты
// остаются как UX поверх этого.
function assertAppUnlocked(): void {
  // С 11.11.2026 пароль кошелька обязателен: им зашифрованы ключи (walletVault).
  if (!hasAppPassword()) throw new Error("APP_PWD_SETUP");
  if (!isAppUnlocked()) throw new Error("APP_LOCKED");
}

export interface NewWalletResult {
  accountId: string;
  publicKey: string;
  seedPhrase: string;
  hasPin: boolean;
}

/**
 * Производит wallet-blob для хранения. Приоритет:
 *  1. Если глобальный master-PIN установлен И разблокирован → шифруем им.
 *  2. Иначе если передан per-account pin → старый формат v=1 (back-compat).
 *  3. Иначе plain.
 *
 * Бросает если master-PIN установлен НО заблокирован — caller должен
 * сначала вызвать unlockMaster(). Это защита от случайного создания
 * незащищённого кошелька когда у юзера есть master.
 */
async function makeWalletBlob(seed: string, perAccountPin?: string | null): Promise<string> {
  if (hasMasterPin()) {
    const k = getCachedMasterKey();
    if (!k) throw new Error("Master-PIN заблокирован — введи общий PIN");
    const blob = await encryptSeedWithMaster(seed);
    touchMasterCache();
    return JSON.stringify(blob);
  }
  if (perAccountPin) {
    return blobToString(await encryptWithPin(seed, perAccountPin));
  }
  return makePlainBlob(seed);
}

export async function createEmbeddedWallet(_opts?: {
  pin?: string | null;
}): Promise<NewWalletResult> {
  // 128 bits entropy = 12 слов (как стандарт NEAR)
  const seedPhrase = generateMnemonic(wordlist, 128);
  const { publicKeyStr, accountId } = await seedPhraseToNearKeys(seedPhrase);

  // Безопасное хранение: неизвлекаемый ключ в IndexedDB. Открытого сида в
  // localStorage НЕТ; PIN не используется (границу держит сам браузер).
  await setupSecureWallet(seedPhrase, accountId);
  seedCache.set(accountId, seedPhrase); // для разового показа сид-фразы при создании

  return {
    accountId,
    publicKey: publicKeyStr,
    seedPhrase,
    hasPin: false,
  };
}

export async function importEmbeddedWalletBySeed(opts: {
  seedPhrase: string;
  pin?: string | null;
  accountId?: string;
}): Promise<{ accountId: string; publicKey: string; hasPin: boolean }> {
  const seed = opts.seedPhrase.trim();
  if (!validateMnemonic(seed, wordlist)) {
    throw new Error("Невалидная сид-фраза (BIP39)");
  }
  const derived = await seedPhraseToNearKeys(seed);
  const accountId = opts.accountId?.trim() || derived.accountId;

  await setupSecureWallet(seed, accountId);
  seedCache.set(accountId, seed);

  return {
    accountId,
    publicKey: derived.publicKeyStr,
    hasPin: false,
  };
}

/**
 * Импорт кошелька ПО ПРИВАТНОМУ КЛЮЧУ (без сида). Параллельный seed-импорту
 * путь: неизвлекаемый Ed25519-ключ в IndexedDB + AES-обёртка приватника для
 * «показать приватный ключ». Сида у такого кошелька нет (keyOnly).
 */
export async function importEmbeddedWalletByPrivateKey(opts: {
  privateKeyStr: string;
  accountId?: string;
}): Promise<{ accountId: string; publicKey: string; hasPin: boolean }> {
  const res = await setupSecureWalletFromPrivateKey(
    opts.privateKeyStr.trim(),
    opts.accountId?.trim() || undefined,
  );
  return {
    accountId: res.accountId,
    publicKey: res.publicKeyStr,
    hasPin: false,
  };
}

/**
 * Деривировать публичный ключ + implicit-аккаунт из приватного ключа.
 * Для UI: авто-определение аккаунта после вставки приватника (без сохранения).
 */
export async function derivePublicFromPrivateKey(privateKeyStr: string): Promise<{
  publicKeyStr: string;
  accountId: string; // implicit-hex
}> {
  const { parsePrivateKeyStr } = await import("./secureWallet");
  const { pub32 } = await parsePrivateKeyStr(privateKeyStr.trim());
  return {
    publicKeyStr: encodePublicKey(pub32),
    accountId: publicKeyToImplicit(pub32),
  };
}

/**
 * Получить сид-фразу. Cache → plain → master-blob → per-account-PIN.
 *
 * Bросает:
 *  - 'PIN_REQUIRED' — если blob это per-account-PIN формата v=1 и opts.pin не передан.
 *  - 'MASTER_LOCKED' — если blob это master-blob и master-key не в кэше
 *    (caller должен вызвать unlockMaster(pin) и повторить).
 *  - 'Неверный PIN' — при ошибке расшифровки.
 */
export async function getSeedPhrase(opts: { accountId: string; pin?: string }): Promise<string> {
  assertAppUnlocked(); // замок приложения: до кэша и до любого секрета
  const cached = seedCache.get(opts.accountId);
  if (cached) return cached;

  // Новый путь: сид в secureWallet (AES под неизвлекаемым ключом в IndexedDB).
  if (await hasSecureWallet(opts.accountId)) {
    const seed = await secureRevealSeed(opts.accountId);
    seedCache.set(opts.accountId, seed);
    return seed;
  }

  const blobStr = await loadWalletBlob(opts.accountId);
  if (!blobStr) throw new Error(`Кошелёк ${opts.accountId} не найден на устройстве`);

  const kind = detectBlobKind(blobStr);

  if (kind === "plain") {
    const seed = readPlainBlob(blobStr);
    seedCache.set(opts.accountId, seed);
    return seed;
  }

  if (kind === "master-pin") {
    const masterBlob = JSON.parse(blobStr) as MasterEncryptedBlob;
    const seed = await decryptSeedWithMaster(masterBlob);
    touchMasterCache();
    seedCache.set(opts.accountId, seed);
    return seed;
  }

  // per-account-PIN (v=1)
  if (!opts.pin) throw new Error("PIN_REQUIRED");
  const blob = blobFromString(blobStr);
  const seed = await decryptWithPin(blob, opts.pin);
  seedCache.set(opts.accountId, seed);
  return seed;
}

/** Это key-only кошелёк (импортирован по приватному ключу, сида нет)? Для UI. */
export async function isKeyOnly(accountId: string): Promise<boolean> {
  return isKeyOnlyWallet(accountId);
}

export async function listLocalWallets(): Promise<string[]> {
  const [legacy, secure] = await Promise.all([listWalletAccounts(), listSecureAccounts()]);
  return Array.from(new Set([...legacy, ...secure]));
}

export function isInCache(accountId: string): boolean {
  return seedCache.has(accountId);
}

export function clearCache(accountId?: string): void {
  if (accountId) seedCache.delete(accountId);
  else seedCache.clear();
}

export async function removeLocalWallet(accountId: string): Promise<void> {
  await removeWalletBlob(accountId);
  await removeSecureWallet(accountId);
  seedCache.delete(accountId);
}

export async function hasPin(accountId: string): Promise<boolean> {
  const blobStr = await loadWalletBlob(accountId);
  if (!blobStr) return false;
  return !isPlainBlob(blobStr);
}

/**
 * Какой тип PIN-защиты у конкретного кошелька. Полезно для UI чтобы:
 *  - "master-pin" → запросить master-PIN (один общий)
 *  - "per-account-pin" → запросить старый PIN этого кошелька (миграция)
 *  - "plain" → ничего не запрашивать
 */
export async function getBlobKind(
  accountId: string,
): Promise<"plain" | "per-account-pin" | "master-pin" | null> {
  const blobStr = await loadWalletBlob(accountId);
  if (!blobStr) return null;
  return detectBlobKind(blobStr);
}

/**
 * Миграция: пере-шифровать конкретный кошелёк под master-PIN.
 * Используется один раз при апгрейде со старого per-account-PIN формата.
 * Требует:
 *  - Установленный и разблокированный master.
 *  - Знание старого PIN'а кошелька (для расшифровки v=1).
 *
 * Plain-кошельки тоже можно "повысить" в master — для них pin не нужен.
 */
export async function migrateWalletToMaster(opts: {
  accountId: string;
  oldPin?: string;
}): Promise<void> {
  if (!hasMasterPin()) throw new Error("Master-PIN не настроен");
  if (!getCachedMasterKey()) throw new Error("Master заблокирован");
  const blobStr = await loadWalletBlob(opts.accountId);
  if (!blobStr) throw new Error("Кошелёк не найден");

  const kind = detectBlobKind(blobStr);
  if (kind === "master-pin") return; // уже мигрирован

  let seed: string;
  if (kind === "plain") {
    seed = readPlainBlob(blobStr);
  } else {
    if (!opts.oldPin) throw new Error("Нужен старый PIN этого кошелька");
    seed = await decryptWithPin(blobFromString(blobStr), opts.oldPin);
  }
  const newBlob = await encryptSeedWithMaster(seed);
  await saveWalletBlob(opts.accountId, JSON.stringify(newBlob));
  seedCache.set(opts.accountId, seed);
}

/**
 * Получить keypair (для текущей сессии). Используется кодом подписи tx
 * (signAndSendTx через near-api-js — lazy import только когда реально нужно).
 */
export async function getKeyPairBytes(opts: {
  accountId: string;
  pin?: string;
}): Promise<{ privateKey: Uint8Array; publicKey: Uint8Array; secretKeyStr: string }> {
  assertAppUnlocked(); // замок: key-only путь не проходит через getSeedPhrase
  // key-only кошелёк (импорт по приватнику): сида нет — берём приват из
  // secureWallet-обёртки и парсим строку в байты.
  if (await isKeyOnlyWallet(opts.accountId)) {
    const secretKeyStr = await secureRevealPrivateKey(opts.accountId);
    if (!secretKeyStr) throw new Error("Приватный ключ недоступен");
    const { parsePrivateKeyStr } = await import("./secureWallet");
    const { priv32, pub32 } = await parsePrivateKeyStr(secretKeyStr);
    return { privateKey: priv32, publicKey: pub32, secretKeyStr };
  }
  const seed = await getSeedPhrase(opts);
  const { secretKeyStr } = await seedPhraseToNearKeys(seed);
  const priv = deriveNearKeyFromSeed(mnemonicToSeedSync(seed));
  const kp = await privateKeyToKeypair(priv);
  return { privateKey: kp.privateKey, publicKey: kp.publicKey, secretKeyStr };
}

/**
 * Подписант через secureWallet (неизвлекаемый ключ — байты приватника в JS
 * не появляются при подписи). Если кошелёк ещё в legacy-хранилище
 * (plain/PIN) — тихо мигрируем в secureWallet и удаляем legacy-blob. Для
 * PIN/master legacy-кошельков getSeedPhrase бросит PIN_REQUIRED/MASTER_LOCKED,
 * как и раньше (UI запросит PIN); после первой такой подписи кошелёк
 * становится PIN-less secure.
 */
export async function getSecureSigner(opts: {
  accountId: string;
  pin?: string;
}): Promise<{ publicKeyStr: string; sign: (m: Uint8Array) => Promise<Uint8Array> }> {
  assertAppUnlocked(); // замок: единый чокпоинт ВСЕХ путей подписи (send/dApp/batch)
  let meta = await loadSecureWallet(opts.accountId);
  if (!meta) {
    const seed = await getSeedPhrase({ accountId: opts.accountId, pin: opts.pin });
    meta = await setupSecureWallet(seed, opts.accountId);
    // НЕдеструктивная миграция: legacy-блоб НЕ удаляем здесь — оставляем как
    // страховку на случай, если IndexedDB не переживёт перезаход в конкретном
    // окружении (Telegram webview). Удаление открытого legacy-блоба включим
    // отдельным шагом, когда persistence подтверждён в бою. До тех пор для
    // существующих кошельков подпись уже идёт неизвлекаемым ключом, а
    // утечку открытого сида в облако мы уже закрыли.
  }
  return {
    publicKeyStr: meta.publicKeyStr,
    sign: (m: Uint8Array) => signWithSecure(opts.accountId, m),
  };
}

/**
 * Подписать NEP-413 challenge встроенным кошельком БЕЗ извлечения приватника:
 * подпись идёт через secureWallet (getSecureSigner), как и транзакции — байты
 * приватника в JS не появляются. Возврат — ровно формат connectWalletSigned:
 * publicKey "ed25519:<base58>", signature base64. Используется входом с подписью
 * (см. lib/signedConnect.ts). Для legacy PIN-кошельков getSecureSigner может
 * бросить PIN_REQUIRED — вызывающий (грейс) мягко откатится на неподписанный вход.
 */
export async function signNep413Embedded(opts: {
  accountId: string;
  pin?: string;
  message: string;
  recipient: string;
  nonce: Uint8Array;
}): Promise<{ publicKey: string; signature: string }> {
  const { buildNep413Hash, uint8ToBase64 } = await import("./nep413");
  const signer = await getSecureSigner({ accountId: opts.accountId, pin: opts.pin });
  const hash = buildNep413Hash({
    message: opts.message,
    recipient: opts.recipient,
    nonce: opts.nonce,
  });
  const sig = await signer.sign(hash);
  return { publicKey: signer.publicKeyStr, signature: uint8ToBase64(sig) };
}

/**
 * Подпись и отправка транзакции NEAR. На клиенте — наш borsh-builder
 * (см. nearTx.ts). Без near-api-js, без Buffer/process.
 */
export async function signAndSendTx(opts: {
  accountId: string;
  pin?: string;
  receiverId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  actions: any[];
}): Promise<{ txHash: string }> {
  const { signAndSendNearTx } = await import("./nearTx");
  const signer = await getSecureSigner({ accountId: opts.accountId, pin: opts.pin });
  return signAndSendNearTx({
    signerId: opts.accountId,
    publicKeyStr: signer.publicKeyStr,
    sign: signer.sign,
    receiverId: opts.receiverId,
    actions: opts.actions,
  });
}

// ──────── High-level helpers: NEAR/FT/NFT send ────────

/** Перевод NEAR. amountNear — human (например 0.5). */
export async function sendNear(opts: {
  accountId: string;
  pin?: string;
  recipient: string;
  amountNear: string; // human (поддерживаем дроби)
}): Promise<{ txHash: string }> {
  const { transferAction } = await import("./nearTx");
  const yocto = humanToYocto(opts.amountNear, 24);
  return signAndSendTx({
    accountId: opts.accountId,
    pin: opts.pin,
    receiverId: opts.recipient,
    actions: [transferAction(yocto)],
  });
}

/** Перевод FT (NEP-141). Сначала storage_deposit получателю если нужно. */
export async function sendFt(opts: {
  accountId: string;
  pin?: string;
  ftContract: string;
  decimals: number;
  recipient: string;
  amount: string; // human
}): Promise<{ txHash: string }> {
  const { functionCallAction, signAndSendNearTx } = await import("./nearTx");
  const signer = await getSecureSigner({ accountId: opts.accountId, pin: opts.pin });
  const raw = humanToYocto(opts.amount, opts.decimals);

  // storage_deposit на FT-контракт (1 yoctoN не требуется, ~0.00125 NEAR storage)
  // делаем безусловно — контракт сам пропустит если уже зарегистрирован
  await signAndSendNearTx({
    signerId: opts.accountId,
    sign: signer.sign,
    publicKeyStr: signer.publicKeyStr,
    receiverId: opts.ftContract,
    actions: [
      functionCallAction({
        methodName: "storage_deposit",
        args: { account_id: opts.recipient, registration_only: true },
        gas: 10_000_000_000_000n,
        deposit: 1_250_000_000_000_000_000_000n, // 0.00125 NEAR
      }),
    ],
  });

  return signAndSendNearTx({
    signerId: opts.accountId,
    sign: signer.sign,
    publicKeyStr: signer.publicKeyStr,
    receiverId: opts.ftContract,
    actions: [
      functionCallAction({
        methodName: "ft_transfer",
        args: { receiver_id: opts.recipient, amount: raw.toString() },
        gas: 30_000_000_000_000n,
        deposit: 1n, // обязательный 1 yoctoN для NEP-141
      }),
    ],
  });
}

/** Перевод NFT (NEP-171). */
export async function sendNft(opts: {
  accountId: string;
  pin?: string;
  nftContract: string;
  tokenId: string;
  recipient: string;
}): Promise<{ txHash: string }> {
  const { functionCallAction } = await import("./nearTx");
  return signAndSendTx({
    accountId: opts.accountId,
    pin: opts.pin,
    receiverId: opts.nftContract,
    actions: [
      functionCallAction({
        methodName: "nft_transfer",
        args: {
          receiver_id: opts.recipient,
          token_id: opts.tokenId,
        },
        gas: 30_000_000_000_000n,
        deposit: 1n,
      }),
    ],
  });
}

/**
 * Батч-перевод NFT (NEP-171): N переводов одним кошельком, чанками по
 * actionsPerTx. Бюджет газа: nft_transfer ≈ 30 Tgas, лимит tx ~300 Tgas →
 * безопасно ≤8 actions/tx. Подписанта берём ОДИН раз (один PIN-промпт на весь
 * батч), nonce инкрементируется вручную внутри signAndSendManyNearTx — без
 * гонки между tx. Возвращаем хэши всех отправленных транзакций.
 */
export async function sendNftBatch(opts: {
  accountId: string;
  pin?: string;
  nftContract: string;
  transfers: Array<{ tokenId: string; recipient: string }>;
  actionsPerTx?: number;
  onTx?: (txIndex: number, txHash: string, transfersInTx: number) => void;
}): Promise<{ txHashes: string[]; sent: number }> {
  const { functionCallAction, signAndSendManyNearTx } = await import("./nearTx");
  if (opts.transfers.length === 0) throw new Error("Нет переводов для отправки");
  const perTx = Math.max(1, Math.min(opts.actionsPerTx ?? 8, 10));
  const signer = await getSecureSigner({
    accountId: opts.accountId,
    pin: opts.pin,
  });

  // Все переводы — к одному nftContract, значит receiverId tx один и тот же,
  // а получатели задаются в args каждого nft_transfer.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const txs: { receiverId: string; actions: any[] }[] = [];
  for (let i = 0; i < opts.transfers.length; i += perTx) {
    const chunk = opts.transfers.slice(i, i + perTx);
    txs.push({
      receiverId: opts.nftContract,
      actions: chunk.map((t) =>
        functionCallAction({
          methodName: "nft_transfer",
          args: { receiver_id: t.recipient, token_id: t.tokenId },
          gas: 30_000_000_000_000n,
          deposit: 1n,
        }),
      ),
    });
  }

  const { txHashes } = await signAndSendManyNearTx({
    signerId: opts.accountId,
    sign: signer.sign,
    publicKeyStr: signer.publicKeyStr,
    txs,
    onTx: (i, h) => opts.onTx?.(i, h, txs[i].actions.length),
  });
  return { txHashes, sent: opts.transfers.length };
}

export interface NftMintAction {
  recipient: string;
  count: number;
  methodName: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  args: Record<string, any>;
  gas: string;
  deposit: string;
}
export interface NftBatchJob {
  key: string;
  nftContract: string;
  transfers: Array<{ tokenId: string; recipient: string }>;
  // доминт недостающих: nft_batch_mint actions (1 на получателя), параметры
  // строит сервер из Sendler-метаданных (adminBuildNftMintActions)
  mints?: NftMintAction[];
}
export interface NftJobOutcome {
  sent: number;
  txHashes: string[];
  errors: string[];
  // переводы из упавших чанков — для прицельного ретрая (без двойной отправки:
  // упавший nft_transfer не сдвинул токен, он всё ещё на отправителе)
  failed: Array<{ tokenId: string; recipient: string }>;
}

/**
 * Раздача из НЕСКОЛЬКИХ заданий за один прогон, надёжно: все nft_transfer всех
 * заданий разворачиваются в плоский список tx (чанки ≤8 actions) и шлются ОДНОЙ
 * непрерывной nonce-последовательностью через signAndSendSequential (фетч nonce
 * 1 раз + ретраи + проверка статуса исполнения). Это чинит «через 1-2 задания
 * всё падает»: раньше каждое задание перезапрашивало nonce и ловило InvalidNonce.
 * Один PIN на весь прогон. Возвращает результат по каждому jobKey.
 */
export async function sendNftJobsBatch(opts: {
  accountId: string;
  pin?: string;
  jobs: NftBatchJob[];
  actionsPerTx?: number;
  maxAttempts?: number;
  onProgress?: (ev: {
    jobKey: string;
    okTransfers: number;
    txHash?: string;
    error?: string;
    attempts: number;
  }) => void;
}): Promise<Record<string, NftJobOutcome>> {
  const { functionCallAction, signAndSendSequential } = await import("./nearTx");
  const perTx = Math.max(1, Math.min(opts.actionsPerTx ?? 8, 10));
  const signer = await getSecureSigner({
    accountId: opts.accountId,
    pin: opts.pin,
  });

  // Разворачиваем все задания в плоский список tx (с привязкой к jobKey, кол-ву
  // и исходным переводам чанка — для ретрая упавших).
  const flat: Array<{
    jobKey: string;
    receiverId: string;
    n: number;
    kind: "transfer" | "mint";
    chunk: Array<{ tokenId: string; recipient: string }>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    actions: any[];
  }> = [];
  for (const job of opts.jobs) {
    // переводы имеющихся (чанки ≤perTx)
    for (let i = 0; i < job.transfers.length; i += perTx) {
      const chunk = job.transfers.slice(i, i + perTx);
      flat.push({
        jobKey: job.key,
        receiverId: job.nftContract,
        n: chunk.length,
        kind: "transfer",
        chunk,
        actions: chunk.map((t) =>
          functionCallAction({
            methodName: "nft_transfer",
            args: { receiver_id: t.recipient, token_id: t.tokenId },
            gas: 30_000_000_000_000n,
            deposit: 1n,
          }),
        ),
      });
    }
    // доминт недостающих (1 nft_batch_mint на tx — газ до 280 TGas)
    for (const m of job.mints ?? []) {
      flat.push({
        jobKey: job.key,
        receiverId: job.nftContract,
        n: m.count,
        kind: "mint",
        chunk: [],
        actions: [
          functionCallAction({
            methodName: m.methodName,
            args: m.args,
            gas: BigInt(m.gas),
            deposit: BigInt(m.deposit),
          }),
        ],
      });
    }
  }

  const out: Record<string, NftJobOutcome> = {};
  for (const job of opts.jobs) out[job.key] = { sent: 0, txHashes: [], errors: [], failed: [] };

  await signAndSendSequential({
    signerId: opts.accountId,
    sign: signer.sign,
    publicKeyStr: signer.publicKeyStr,
    txs: flat.map((f) => ({ receiverId: f.receiverId, actions: f.actions })),
    maxAttempts: opts.maxAttempts ?? 3,
    onResult: (i, res) => {
      const meta = flat[i];
      const acc = out[meta.jobKey];
      if (res.txHash && !res.error) {
        acc.sent += meta.n;
        acc.txHashes.push(res.txHash);
      } else if (res.error) {
        acc.errors.push(res.error);
        acc.failed.push(...meta.chunk);
      }
      opts.onProgress?.({
        jobKey: meta.jobKey,
        okTransfers: res.txHash && !res.error ? meta.n : 0,
        txHash: res.txHash && !res.error ? res.txHash : undefined,
        error: res.txHash ? undefined : res.error,
        attempts: res.attempts,
      });
    },
  });
  return out;
}

function humanToYocto(human: string, decimals: number): bigint {
  const s = human.trim();
  const [intPart, fracPart = ""] = s.split(".");
  if (!/^\d+$/.test(intPart)) throw new Error("amount: bad number");
  if (fracPart && !/^\d+$/.test(fracPart)) throw new Error("amount: bad fraction");
  const fracPadded = (fracPart + "0".repeat(decimals)).slice(0, decimals);
  return BigInt(intPart) * 10n ** BigInt(decimals) + BigInt(fracPadded || "0");
}
