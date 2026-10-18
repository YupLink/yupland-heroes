// Минимальный NEAR transaction builder + signer на чистом browser-стеке.
// Zero Node deps: используем borsh@2 (ESM) + @noble/ed25519 + @scure/base.
//
// Поддерживает три типа actions:
//   - Transfer (NEAR native)
//   - FunctionCall (для ft_transfer / nft_transfer / любой контракт)
//   - storage_deposit helper (для регистрации получателя FT)
//
// RPC: говорим напрямую с https://rpc.mainnet.fastnear.com (POST JSON-RPC).

import * as borsh from "borsh";
import * as ed25519 from "@noble/ed25519";
import { sha256 } from "@noble/hashes/sha2.js";
import { base58 } from "@scure/base";

const NEAR_RPC = "https://rpc.mainnet.fastnear.com";

// ──────── Borsh schemas (NEAR transaction format) ────────

// PublicKey: { keyType: u8, data: [u8; 32] }
const PUBLIC_KEY_SCHEMA: borsh.Schema = {
  struct: { keyType: "u8", data: { array: { type: "u8", len: 32 } } },
};

// Signature: { keyType: u8, data: [u8; 64] }
const SIGNATURE_SCHEMA: borsh.Schema = {
  struct: { keyType: "u8", data: { array: { type: "u8", len: 64 } } },
};

// AccessKey permissions etc нам не нужны на send — только actions.

const TRANSFER_ACTION_SCHEMA: borsh.Schema = {
  struct: { deposit: "u128" },
};

const FUNCTION_CALL_ACTION_SCHEMA: borsh.Schema = {
  struct: {
    methodName: "string",
    args: { array: { type: "u8" } }, // Vec<u8>
    gas: "u64",
    deposit: "u128",
  },
};

// AccessKeyPermission — enum: 0=FunctionCall, 1=FullAccess
const ACCESS_KEY_PERMISSION_SCHEMA: borsh.Schema = {
  enum: [
    {
      struct: {
        FunctionCall: {
          struct: {
            allowance: { option: "u128" }, // Option<u128>; null = unlimited
            receiverId: "string",
            methodNames: { array: { type: "string" } },
          },
        },
      },
    },
    { struct: { FullAccess: { struct: {} } } },
  ],
};

const ACCESS_KEY_SCHEMA: borsh.Schema = {
  struct: {
    nonce: "u64",
    permission: ACCESS_KEY_PERMISSION_SCHEMA,
  },
};

// Action — enum (тэгом u8). Используем тэги:
//   0=CreateAccount, 1=DeployContract, 2=FunctionCall, 3=Transfer,
//   4=Stake, 5=AddKey, 6=DeleteKey, 7=DeleteAccount, 8=Delegate
const ACTION_SCHEMA: borsh.Schema = {
  enum: [
    { struct: { CreateAccount: { struct: {} } } },
    {
      struct: {
        DeployContract: { struct: { code: { array: { type: "u8" } } } },
      },
    },
    { struct: { FunctionCall: FUNCTION_CALL_ACTION_SCHEMA } },
    { struct: { Transfer: TRANSFER_ACTION_SCHEMA } },
    {
      struct: {
        Stake: {
          struct: { stake: "u128", publicKey: PUBLIC_KEY_SCHEMA },
        },
      },
    },
    {
      struct: {
        AddKey: {
          struct: {
            publicKey: PUBLIC_KEY_SCHEMA,
            accessKey: ACCESS_KEY_SCHEMA,
          },
        },
      },
    },
    {
      struct: {
        DeleteKey: { struct: { publicKey: PUBLIC_KEY_SCHEMA } },
      },
    },
    {
      struct: {
        DeleteAccount: { struct: { beneficiaryId: "string" } },
      },
    },
  ],
};

const TRANSACTION_SCHEMA: borsh.Schema = {
  struct: {
    signerId: "string",
    publicKey: PUBLIC_KEY_SCHEMA,
    nonce: "u64",
    receiverId: "string",
    blockHash: { array: { type: "u8", len: 32 } },
    actions: { array: { type: ACTION_SCHEMA } },
  },
};

const SIGNED_TRANSACTION_SCHEMA: borsh.Schema = {
  struct: {
    transaction: TRANSACTION_SCHEMA,
    signature: SIGNATURE_SCHEMA,
  },
};

// ──────── Action constructors ────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type NearAction = any;

export function transferAction(yoctoNear: bigint): NearAction {
  return { Transfer: { deposit: yoctoNear } };
}

export function functionCallAction(opts: {
  methodName: string;
  args: object;
  gas: bigint;
  deposit: bigint;
}): NearAction {
  const argsJson = JSON.stringify(opts.args);
  return {
    FunctionCall: {
      methodName: opts.methodName,
      args: Array.from(new TextEncoder().encode(argsJson)),
      gas: opts.gas,
      deposit: opts.deposit,
    },
  };
}

/**
 * AddKey action для выдачи функционального (FCAK) или полного ключа.
 * Используется при connect-flow от dapp'a: dapp получает свой keypair,
 * мы добавляем publicKey on-chain с указанными правами.
 *
 * FCAK (default): только конкретный контракт + опц. methods + allowance.
 *   После исчерпания allowance ключ перестаёт работать сам по себе.
 * FullAccess: ключ может делать что угодно (НЕ выдавать без явного апрува).
 */
export function addKeyAction(opts: {
  publicKey: Uint8Array;
  // Если задано — FCAK с этими ограничениями. Иначе FullAccess.
  fcak?: {
    receiverId: string;
    methodNames?: string[]; // [] = все методы
    allowanceYocto?: bigint | null; // null = unlimited
  };
}): NearAction {
  const permission = opts.fcak
    ? {
        FunctionCall: {
          allowance: opts.fcak.allowanceYocto ?? null,
          receiverId: opts.fcak.receiverId,
          methodNames: opts.fcak.methodNames ?? [],
        },
      }
    : { FullAccess: {} };
  return {
    AddKey: {
      publicKey: { keyType: 0, data: opts.publicKey },
      accessKey: { nonce: 0n, permission },
    },
  };
}

/** DeleteKey — revoke выданного ключа. */
export function deleteKeyAction(publicKey: Uint8Array): NearAction {
  return {
    DeleteKey: {
      publicKey: { keyType: 0, data: publicKey },
    },
  };
}

// ──────── RPC helpers ────────

async function rpc<T>(method: string, params: unknown): Promise<T> {
  const r = await fetch(NEAR_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: "1", method, params }),
  });
  const j = (await r.json()) as { result?: T; error?: { data?: unknown; message?: string } };
  if (j.error) {
    const msg =
      typeof j.error.data === "string"
        ? j.error.data
        : j.error.message ?? "RPC error";
    throw new Error(msg);
  }
  return j.result as T;
}

export async function getAccessKey(
  accountId: string,
  publicKeyStr: string,
  finality: "final" | "optimistic" = "final"
): Promise<{ nonce: bigint; blockHash: Uint8Array }> {
  const res = await rpc<{ nonce: number | string; block_hash: string }>(
    "query",
    {
      request_type: "view_access_key",
      finality,
      account_id: accountId,
      public_key: publicKeyStr,
    }
  );
  return {
    nonce: BigInt(res.nonce) + 1n,
    blockHash: base58.decode(res.block_hash),
  };
}

export async function broadcastTx(signedBase64: string): Promise<string> {
  const res = await rpc<{
    transaction?: { hash?: string };
    transaction_outcome?: { id?: string };
    status?: { Failure?: unknown };
  }>("broadcast_tx_commit", [signedBase64]);
  const hash = res.transaction?.hash ?? res.transaction_outcome?.id;
  if (!hash) throw new Error("RPC: tx hash missing");
  // tx могла быть ВКЛЮЧЕНА, но FunctionCall упасть при исполнении — это НЕ успех
  // (раньше любой возвращённый hash считался успехом → ложные «отправлено»).
  if (res.status && typeof res.status === "object" && "Failure" in res.status) {
    throw new Error(
      `tx ${hash.slice(0, 8)} failed: ${JSON.stringify(res.status.Failure).slice(0, 250)}`
    );
  }
  return hash;
}

// ──────── Sign + send ────────

function encodePublicKeyBorsh(rawPubKey: Uint8Array): { keyType: number; data: Uint8Array } {
  return { keyType: 0, data: rawPubKey }; // 0 = ed25519
}

function parsePublicKeyStr(publicKeyStr: string): Uint8Array {
  const s = publicKeyStr.startsWith("ed25519:")
    ? publicKeyStr.slice("ed25519:".length)
    : publicKeyStr;
  return base58.decode(s);
}

function uint8ToBase64(u: Uint8Array): string {
  let s = "";
  for (const b of u) s += String.fromCharCode(b);
  return btoa(s);
}

export interface SignAndSendArgs {
  signerId: string;
  // Либо сырой приватный ключ (legacy), либо колбэк подписи (secureWallet:
  // неизвлекаемый ключ — байты приватника в JS не появляются). Один из двух
  // обязателен.
  privateKey?: Uint8Array; // 32 bytes ed25519 private key
  sign?: (message: Uint8Array) => Promise<Uint8Array>;
  publicKeyStr: string; // "ed25519:<base58>"
  receiverId: string;
  actions: NearAction[];
}

export async function signAndSendNearTx(
  args: SignAndSendArgs
): Promise<{ txHash: string }> {
  const publicKeyRaw = parsePublicKeyStr(args.publicKeyStr);
  const { nonce, blockHash } = await getAccessKey(
    args.signerId,
    args.publicKeyStr
  );

  const transaction = {
    signerId: args.signerId,
    publicKey: encodePublicKeyBorsh(publicKeyRaw),
    nonce,
    receiverId: args.receiverId,
    blockHash,
    actions: args.actions,
  };

  const serializedTx = borsh.serialize(TRANSACTION_SCHEMA, transaction);
  const txHashBytes = sha256(serializedTx);
  const signature = args.sign
    ? await args.sign(txHashBytes)
    : await ed25519.signAsync(txHashBytes, args.privateKey!);
  if (signature.length !== 64) throw new Error("Подпись tx: ожидалось 64 байта");

  const signedTx = {
    transaction,
    signature: { keyType: 0, data: signature },
  };
  const serializedSigned = borsh.serialize(
    SIGNED_TRANSACTION_SCHEMA,
    signedTx
  );

  const txHash = await broadcastTx(uint8ToBase64(serializedSigned));
  return { txHash };
}

export interface SignAndSendManyArgs {
  signerId: string;
  privateKey?: Uint8Array;
  sign?: (message: Uint8Array) => Promise<Uint8Array>;
  publicKeyStr: string;
  // Несколько транзакций одним подписантом. Каждая — свой receiverId+actions.
  txs: Array<{ receiverId: string; actions: NearAction[] }>;
  // Колбэк после успешной отправки каждой tx (для прогресса в UI).
  onTx?: (index: number, txHash: string) => void;
}

/**
 * Батч из N транзакций ОДНИМ ключом. Критично для серий переводов: nonce
 * запрашиваем ОДИН раз и инкрементируем вручную (base, base+1, …), а blockHash
 * переиспользуем. Если бы каждую tx гоняли через signAndSendNearTx, повторный
 * `view_access_key` с finality:"final" между tx мог бы вернуть ещё не
 * обновлённый nonce → коллизия "InvalidNonce". Тот же blockHash валиден часами,
 * так что для серии в секунды — безопасно. Отправляем последовательно
 * (broadcast_tx_commit ждёт включения), чтобы порядок nonce сохранялся.
 */
export async function signAndSendManyNearTx(
  args: SignAndSendManyArgs
): Promise<{ txHashes: string[] }> {
  const publicKeyRaw = parsePublicKeyStr(args.publicKeyStr);
  const { nonce: baseNonce, blockHash } = await getAccessKey(
    args.signerId,
    args.publicKeyStr
  );

  const txHashes: string[] = [];
  for (let i = 0; i < args.txs.length; i++) {
    const transaction = {
      signerId: args.signerId,
      publicKey: encodePublicKeyBorsh(publicKeyRaw),
      nonce: baseNonce + BigInt(i),
      receiverId: args.txs[i].receiverId,
      blockHash,
      actions: args.txs[i].actions,
    };
    const serializedTx = borsh.serialize(TRANSACTION_SCHEMA, transaction);
    const txHashBytes = sha256(serializedTx);
    const signature = args.sign
      ? await args.sign(txHashBytes)
      : await ed25519.signAsync(txHashBytes, args.privateKey!);
    if (signature.length !== 64)
      throw new Error("Подпись tx: ожидалось 64 байта");
    const signedTx = {
      transaction,
      signature: { keyType: 0, data: signature },
    };
    const serializedSigned = borsh.serialize(
      SIGNED_TRANSACTION_SCHEMA,
      signedTx
    );
    const txHash = await broadcastTx(uint8ToBase64(serializedSigned));
    txHashes.push(txHash);
    args.onTx?.(i, txHash);
  }
  return { txHashes };
}

export interface SeqTx {
  receiverId: string;
  actions: NearAction[];
}
export interface SeqResult {
  txHash?: string;
  error?: string;
  attempts: number;
}

const RETRYABLE_RE =
  /nonce|expired|InvalidTx|timed out|timeout|fetch failed|failed to fetch|network|ECONN|socket|50[234]\b|429|rate.?limit|Internal Server Error|Gateway/i;

function sleepMs(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Надёжная отправка СЕРИИ транзакций одним ключом — для батч-раздач из нескольких
 * заданий. Ключевое отличие от signAndSendManyNearTx:
 *   • nonce запрашивается ОДИН раз на весь прогон и инкрементируется локально
 *     после каждого успеха (НЕ перезапрашиваем через finality:"final" между tx —
 *     именно это ломало мульти-отправку: финальный nonce отстаёт от только что
 *     отправленных tx → следующая tx бралась со старым nonce → InvalidNonce);
 *   • при ошибке — ре-синк nonce+blockHash через finality:"optimistic" (видит
 *     только что включённые tx) и РЕТРАЙ (для nonce/expired/сетевых ошибок);
 *   • статус исполнения каждой tx проверяется в broadcastTx (Failure → ошибка).
 * Не бросает на ошибке отдельной tx — возвращает per-tx результат, прогон идёт
 * дальше (одно упавшее задание не валит остальные).
 */
export async function signAndSendSequential(args: {
  signerId: string;
  privateKey?: Uint8Array;
  sign?: (message: Uint8Array) => Promise<Uint8Array>;
  publicKeyStr: string;
  txs: SeqTx[];
  maxAttempts?: number;
  onResult?: (index: number, res: SeqResult) => void;
}): Promise<SeqResult[]> {
  const publicKeyRaw = parsePublicKeyStr(args.publicKeyStr);
  const maxAttempts = args.maxAttempts ?? 3;
  let { nonce, blockHash } = await getAccessKey(
    args.signerId,
    args.publicKeyStr,
    "final"
  );
  const resync = async () => {
    const r = await getAccessKey(args.signerId, args.publicKeyStr, "optimistic");
    nonce = r.nonce;
    blockHash = r.blockHash;
  };

  const results: SeqResult[] = [];
  for (let i = 0; i < args.txs.length; i++) {
    const tx = args.txs[i];
    const res: SeqResult = { attempts: 0 };
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      res.attempts = attempt;
      try {
        const transaction = {
          signerId: args.signerId,
          publicKey: encodePublicKeyBorsh(publicKeyRaw),
          nonce,
          receiverId: tx.receiverId,
          blockHash,
          actions: tx.actions,
        };
        const serializedTx = borsh.serialize(TRANSACTION_SCHEMA, transaction);
        const txHashBytes = sha256(serializedTx);
        const signature = args.sign
          ? await args.sign(txHashBytes)
          : await ed25519.signAsync(txHashBytes, args.privateKey!);
        const signedTx = {
          transaction,
          signature: { keyType: 0, data: signature },
        };
        const serialized = borsh.serialize(SIGNED_TRANSACTION_SCHEMA, signedTx);
        const txHash = await broadcastTx(uint8ToBase64(serialized));
        res.txHash = txHash;
        res.error = undefined;
        nonce = nonce + 1n; // успех → следующий свободный nonce
        break;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        res.error = msg;
        const retryable = RETRYABLE_RE.test(msg);
        if (attempt < maxAttempts && retryable) {
          await resync();
          await sleepMs(400 * attempt);
          continue;
        }
        // терминально или исчерпаны попытки → ре-синк (чтобы следующая tx
        // взяла актуальный nonce) и идём дальше
        await resync();
        break;
      }
    }
    results.push(res);
    args.onResult?.(i, res);
  }
  return results;
}
