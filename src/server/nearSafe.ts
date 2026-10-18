// Sign-then-send NEAR transactions: подписываем транзакцию ЛОКАЛЬНО,
// получаем tx_hash ДО broadcast, сохраняем в БД, и только потом отправляем.
//
// Это решает проблему "broadcast прошёл, но ответ потерялся в сети":
// у нас уже есть tx_hash → поллер по нему проверит исход через RPC.
//
// На входе — admin-приват из server/near.ts (Shamir/KMS). Внутри:
//   1. borsh-сериализуем TX
//   2. sha256 → txHash
//   3. ed25519-подпись (локально) → await onSigned(txHash, {nonce, signedTx}) —
//      caller СОХРАНЯЕТ в БД (атомарно с processing-lock)
//   4. broadcast (с timeout, не висим больше 12 сек)
//   5. Возвращаем confirmed | unknown
//
// Поллер потом резолвит unknown через статус-эндпоинт RPC.

import * as borsh from "borsh";
import * as ed25519 from "@noble/ed25519";
import { sha256 } from "@noble/hashes/sha2.js";
import { base58 } from "@scure/base";
import { kmsDecryptString } from "./wallet/kms";
import secrets from "secrets.js-grempe";
import { viewAccessKey, txStatus, broadcastTxCommit } from "./rpc";
import { SIGNED_TRANSACTION_SCHEMA, TRANSACTION_SCHEMA, type NearAction } from "./nearTx";

// Схемы и конструкторы действий — в nearTx.ts (лимит файла); импорты прежние.
export { functionCallAction, ftTransferAction, type NearAction } from "./nearTx";

// ──────── RPC через пул эндпоинтов (см. ./rpc.ts) ────────

async function getAccessKey(
  accountId: string,
  publicKeyStr: string
): Promise<{ nonce: bigint; blockHash: Uint8Array }> {
  const res = await viewAccessKey(accountId, publicKeyStr);
  return {
    nonce: BigInt(res.nonce) + 1n,
    blockHash: base58.decode(res.block_hash),
  };
}

// ──────── Key resolution (Shamir/KMS/plain) ────────
//
// Дублирует логику server/near.ts:resolveSignerKey, но возвращает raw
// 32-байт seed + 32-байт pubkey (формат @noble/ed25519), а не строку.

let cachedSignerKey: {
  seed: Uint8Array;
  publicKey: Uint8Array;
  publicKeyStr: string;
  accountId: string;
} | null = null;

async function resolveAdminKeyString(): Promise<string> {
  const share1Enc = process.env.NEAR_SIGNER_SHARE1_ENCRYPTED;
  const share2 = process.env.NEAR_SIGNER_SHARE2;
  if (share1Enc && share1Enc.length > 10 && share2 && share2.length > 10) {
    const share1 = await kmsDecryptString(share1Enc, "admin_signer_SHARE1");
    const hex = secrets.combine([share1, share2]);
    return secrets.hex2str(hex);
  }
  const enc = process.env.NEAR_SIGNER_ENCRYPTED_KEY;
  if (enc && enc.length > 10) {
    return await kmsDecryptString(enc, "admin_signer_single");
  }
  const plain = process.env.NEAR_SIGNER_PRIVATE_KEY;
  if (plain && plain.length > 10) return plain;
  throw new Error("Нет ни Shamir, ни KMS, ни plain admin-приватa");
}

/**
 * Парсит NEAR-приватник "ed25519:base58encoded" → {seed: 32, pubkey: 32}.
 * NEAR ed25519 secret keys обычно 64 bytes (seed || pub). Если 32 — это
 * только seed, и pubkey надо выводить через стандартный ed25519
 * (но такой формат у нас не встречается).
 */
function parseSecretKey(secretKeyStr: string): {
  seed: Uint8Array;
  publicKey: Uint8Array;
} {
  const stripped = secretKeyStr.startsWith("ed25519:")
    ? secretKeyStr.slice("ed25519:".length)
    : secretKeyStr;
  const decoded = base58.decode(stripped);
  if (decoded.length === 64) {
    return { seed: decoded.slice(0, 32), publicKey: decoded.slice(32, 64) };
  }
  throw new Error(
    `Неожиданная длина secret key: ${decoded.length} (ожидался 64-байт seed||pub)`
  );
}

async function getSignerKey(): Promise<{
  seed: Uint8Array;
  publicKey: Uint8Array;
  publicKeyStr: string;
  accountId: string;
}> {
  if (cachedSignerKey) return cachedSignerKey;
  const accountId = process.env.NEAR_SIGNER_ACCOUNT_ID;
  if (!accountId) throw new Error("NEAR_SIGNER_ACCOUNT_ID не задан");
  const sk = await resolveAdminKeyString();
  const { seed, publicKey } = parseSecretKey(sk);
  const publicKeyStr = "ed25519:" + base58.encode(publicKey);
  cachedSignerKey = { seed, publicKey, publicKeyStr, accountId };
  return cachedSignerKey;
}

// ──────── Public API ────────

export interface SafeSendResult {
  txHash: string;
  status: "confirmed" | "unknown";
  errorMsg?: string;
  /** Ошибка ноды целиком (InvalidNonce, Expired…), если отправка не прошла. */
  errorData?: unknown;
  /** Полный исход транзакции (логи квитанций), если нода его вернула. */
  outcome?: unknown;
}

/** Что известно о подписанной транзакции ДО отправки: по этому её можно найти и переслать. */
export interface SignedMeta {
  nonce: string;
  /** Подписанная транзакция (base64): повторная отправка тех же байтов не исполнит её дважды. */
  signedTx: string;
}

/**
 * Последний выданный nonce в этом процессе. Ключ доступа читается с
 * finality «final», а она отстаёт на пару блоков: две подписи подряд брали
 * один номер, и вторую сеть отбрасывала (03.10 перевод разработчикам сразу
 * после перевода в дупло). Номер только растёт; пропуски сеть принимает.
 */
let lastNonce = 0n;

/**
 * Sign-then-send для любого набора actions. Логика:
 *  1. nonce (не меньше прошлого +1) → подпись → txHash (детерминирован)
 *  2. await onSigned(txHash, {nonce, signedTx}) — caller сохраняет в БД
 *  3. broadcast_tx_commit с timeout 12с
 *  4. confirmed (SuccessValue) или unknown (timeout/network)
 *
 * Поллер потом резолвит unknown через resolveProcessingTransactions().
 */
export async function signAndSendSafe(opts: {
  receiverId: string;
  actions: NearAction[];
  onSigned: (txHash: string, meta: SignedMeta) => Promise<void>;
}): Promise<SafeSendResult> {
  const { seed, publicKey, publicKeyStr, accountId } = await getSignerKey();

  const fresh = await getAccessKey(accountId, publicKeyStr);
  const nonce = fresh.nonce > lastNonce ? fresh.nonce : lastNonce + 1n;
  lastNonce = nonce;
  const { blockHash } = fresh;

  const transaction = {
    signerId: accountId,
    publicKey: { keyType: 0, data: publicKey },
    nonce,
    receiverId: opts.receiverId,
    blockHash,
    actions: opts.actions,
  };

  const serializedTx = borsh.serialize(TRANSACTION_SCHEMA, transaction);
  const txHashBytes = sha256(serializedTx);
  const txHashB58 = base58.encode(txHashBytes);

  // Подпись локальная и быстрая — до onSigned, чтобы сохранить готовые байты.
  const signature = await ed25519.signAsync(txHashBytes, seed);
  const signedTx = { transaction, signature: { keyType: 0, data: signature } };
  const serializedSigned = borsh.serialize(
    SIGNED_TRANSACTION_SCHEMA,
    signedTx
  );
  const signedB64 = Buffer.from(serializedSigned).toString("base64");

  await opts.onSigned(txHashB58, { nonce: nonce.toString(), signedTx: signedB64 });

  return sendSigned(txHashB58, signedB64);
}

/**
 * Отправить уже подписанную транзакцию. Безопасно повторять: те же байты
 * сеть исполнит не больше одного раза (тот же хэш, тот же nonce).
 */
export async function sendSigned(txHash: string, signedB64: string): Promise<SafeSendResult> {
  const r = await broadcastTxCommit(signedB64);
  if (!r.ok) {
    return { txHash, status: "unknown", errorMsg: r.errorMsg, errorData: r.errorData };
  }
  const status = r.result?.status;
  const success =
    typeof status === "object" && status !== null && "SuccessValue" in status;
  if (success) return { txHash, status: "confirmed", outcome: r.result };
  return { txHash, status: "unknown", errorMsg: "no SuccessValue", outcome: r.result };
}

/**
 * Проверка статуса конкретной транзакции на NEAR. Возвращает:
 *   "success" — финализирована успешно
 *   "failure" — финализирована с ошибкой (можно rollback в pending)
 *   "pending" — ещё не финализирована (нужно ждать)
 *   "missing" — не найдена (вероятно broadcast не дошёл)
 */
export type TxStatus = "success" | "failure" | "pending" | "missing";

export async function checkTxStatus(
  txHash: string,
  signerAccount: string
): Promise<TxStatus> {
  const r = await txStatus(txHash, signerAccount);
  if (r.status === "missing") return "missing";
  if (r.status === "pending") return "pending";
  const status = r.data?.status;
  if (typeof status === "object" && status !== null) {
    if ("SuccessValue" in status) return "success";
    if ("Failure" in status) return "failure";
  }
  return "pending";
}

export async function getAdminAccountId(): Promise<string> {
  const { accountId } = await getSignerKey();
  return accountId;
}
