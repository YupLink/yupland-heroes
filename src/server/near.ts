// NEAR-выплаты через ft_transfer (NEP-141).
//
// near-api-js v7 API:
// - JsonRpcProvider — RPC-клиент (view + sendTx)
// - KeyPairSigner.fromSecretKey(...) — обёртка вокруг приватника, делает подписи
// - Account(accountId, provider, signer) — высокоуровневый враппер
// - account.callFunction(...) — изменяющий вызов (function_call action)
// - provider.callFunction(...) — read-only view
//
// NEP-141 ft_transfer требует ровно 1 yoctoNEAR attached deposit.
// storage_deposit нужен для каждого нового получателя (~0.00125 NEAR).

import {
  Account,
  FailoverRpcProvider,
  JsonRpcProvider,
  KeyPair,
  KeyPairSigner,
  type KeyPairString,
} from "near-api-js";
import { kmsDecryptString } from "./wallet/kms";
import secrets from "secrets.js-grempe";

const FT_TRANSFER_GAS = 30_000_000_000_000n; // 30 TGas
const STORAGE_DEPOSIT_GAS = 10_000_000_000_000n; // 10 TGas
const STORAGE_DEPOSIT_AMOUNT = 1_250_000_000_000_000_000_000n; // 0.00125 NEAR в yoctoNEAR
const FT_TRANSFER_DEPOSIT = 1n;

// Кеш на runtime — расшифрованный приват держим в RAM до перезапуска
// инстанса (Vercel = ~15 мин). Не платим KMS-decrypt на каждый запрос.
let cached: { account: Account; provider: FailoverRpcProvider } | null = null;

/**
 * Достать admin-приват. Приоритет:
 *  1. Shamir 2-of-3: SHARE1_ENCRYPTED (KMS) + SHARE2 → reconstruct
 *  2. NEAR_SIGNER_ENCRYPTED_KEY (legacy single-key через KMS)
 *  3. NEAR_SIGNER_PRIVATE_KEY (legacy plain)
 *
 * Shamir даёт защиту: компрометация только Vercel ИЛИ только KMS отдельно
 * не даёт сид. Нужны оба источника одновременно.
 */
async function resolveSignerKey(): Promise<string> {
  const share1Enc = process.env.NEAR_SIGNER_SHARE1_ENCRYPTED;
  const share2 = process.env.NEAR_SIGNER_SHARE2;
  if (share1Enc && share1Enc.length > 10 && share2 && share2.length > 10) {
    try {
      const share1 = await kmsDecryptString(share1Enc, "admin_signer_SHARE1");
      const hex = secrets.combine([share1, share2]);
      return secrets.hex2str(hex);
    } catch (err) {
      throw new Error(
        `Shamir reconstruct failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  const enc = process.env.NEAR_SIGNER_ENCRYPTED_KEY;
  if (enc && enc.length > 10) {
    try {
      return await kmsDecryptString(enc, "admin_signer_single");
    } catch (err) {
      throw new Error(
        `KMS Decrypt NEAR_SIGNER_ENCRYPTED_KEY failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
  const plain = process.env.NEAR_SIGNER_PRIVATE_KEY;
  if (plain && plain.length > 10) return plain;
  throw new Error(
    "Ни Shamir-shares, ни NEAR_SIGNER_ENCRYPTED_KEY, ни NEAR_SIGNER_PRIVATE_KEY не заданы",
  );
}

/**
 * Пул RPC для ОТПРАВКИ транзакций (тот же порядок, что в server/rpc.ts).
 *
 * Раньше здесь был один эндпоинт из NEAR_RPC_URL — и когда на проде им
 * оказался публичный rpc.mainnet.near.org (3+ сек на `status`, TIMEOUT_ERROR
 * на `tx`), выплаты перестали проходить: юзер жал «Вывести», tx до сети не
 * доезжала, строки откатывались в pending. Внешне — «кнопка не работает».
 */
function buildSendPool(): string[] {
  const out: string[] = [];
  const primary = process.env.NEAR_RPC_URL?.trim();
  if (primary) out.push(primary);
  for (const e of (process.env.NEAR_RPC_FALLBACKS ?? "").split(",")) {
    const v = e.trim();
    if (v && !out.includes(v)) out.push(v);
  }
  for (const e of [
    "https://rpc.mainnet.fastnear.com",
    "https://near.lava.build",
    "https://endpoints.omniatech.io/v1/near/mainnet/public",
  ]) {
    if (!out.includes(e)) out.push(e);
  }
  return out;
}

async function getNear(): Promise<{
  account: Account;
  provider: FailoverRpcProvider;
}> {
  if (cached) return cached;

  const accountId = process.env.NEAR_SIGNER_ACCOUNT_ID;
  if (!accountId) throw new Error("NEAR_SIGNER_ACCOUNT_ID не задан");

  const privateKey = await resolveSignerKey();

  const provider = new FailoverRpcProvider(
    buildSendPool().map((url) => new JsonRpcProvider({ url })),
  );
  const keyPair = KeyPair.fromString(privateKey as KeyPairString);
  const signer = new KeyPairSigner(keyPair);
  const account = new Account(accountId, provider, signer);

  cached = { account, provider };
  return cached;
}

export async function ensureStorageDeposit(ftContract: string, receiverId: string): Promise<void> {
  // Проверка через пул RPC (failover на 429/timeout)
  const { nearRpc } = await import("./rpc");
  const argsB64 = Buffer.from(JSON.stringify({ account_id: receiverId })).toString("base64");
  try {
    const j = await nearRpc<{ result?: number[] }>("query", {
      request_type: "call_function",
      finality: "final",
      account_id: ftContract,
      method_name: "storage_balance_of",
      args_base64: argsB64,
    });
    const bytes = j.result?.result;
    if (bytes && bytes.length > 0) {
      const text = Buffer.from(bytes).toString("utf-8");
      const parsed = JSON.parse(text) as { total?: string } | null;
      if (parsed && parsed.total) return;
    }
  } catch {
    // ignore — попробуем отправить storage_deposit; если он не нужен, контракт сам откажет
  }

  // storage_deposit идёт через near-api-js (нужна подпись)
  const { account } = await getNear();
  await account.callFunction({
    contractId: ftContract,
    methodName: "storage_deposit",
    args: { account_id: receiverId, registration_only: true },
    gas: STORAGE_DEPOSIT_GAS,
    deposit: STORAGE_DEPOSIT_AMOUNT,
  });
}

/**
 * Перевести `amountHuman` (число «человеческое», то что админ вводил —
 * например 5 для «5 HOPE») получателю. Внутри умножается на 10^decimals,
 * чтобы получить raw units по NEP-141.
 *
 * Возвращает строку tx_hash.
 */
/**
 * human → raw (×10^decimals) БЕЗ потери точности и БЕЗ краша на дробях.
 * `BigInt(amountHuman) * 10n**dec` падал на любом нецелом (10.5) и не годился
 * для реальных денег с дробями (USDT/NEAR). Здесь — строковое масштабирование:
 * фикс. представление до float-безопасных 9 знаков, добивка нулями до decimals.
 * Примеры: (10.5,6)=10500000 · (1.5,24)=1.5e24 · (0.000001,6)=1.
 */
export function humanToRaw(amountHuman: number, decimals: number): bigint {
  if (!(amountHuman > 0)) return 0n;
  const safe = Math.min(decimals, 9); // деньги не требуют >9 дробных знаков; float-safe
  const s = amountHuman.toFixed(safe); // "1.500000000"
  const [intPart, frac = ""] = s.split(".");
  const fracPadded = (frac + "0".repeat(decimals)).slice(0, decimals);
  const digits = (intPart + fracPadded).replace(/^0+(?=\d)/, "");
  return BigInt(digits || "0");
}

export async function ftTransfer(opts: {
  ftContract: string;
  decimals: number;
  receiverId: string;
  amountHuman: number;
}): Promise<string> {
  const { ftContract, decimals, receiverId, amountHuman } = opts;
  if (amountHuman <= 0) throw new Error("amount must be positive");

  await ensureStorageDeposit(ftContract, receiverId);

  const rawAmount = humanToRaw(amountHuman, decimals).toString();

  const { account } = await getNear();
  const outcome = await account.callFunctionRaw({
    contractId: ftContract,
    methodName: "ft_transfer",
    args: {
      receiver_id: receiverId,
      amount: rawAmount,
      memo: "yuplink redemption",
    },
    gas: FT_TRANSFER_GAS,
    deposit: FT_TRANSFER_DEPOSIT,
  });

  // tx_hash находится в outcome.transaction.hash для RpcTransactionResponse
  const hash =
    (outcome as { transaction?: { hash?: string } }).transaction?.hash ??
    (outcome as { transaction_outcome?: { id?: string } }).transaction_outcome?.id;
  if (!hash) throw new Error("ft_transfer: не удалось получить tx_hash");
  return hash;
}

/**
 * Подписанный function_call ПРОИЗВОЛЬНОГО метода с операционного кошелька.
 * Нужен для обмена на Ref (ft_transfer_call с msg-actions) и подобных вызовов,
 * которых нет отдельной обёрткой. Возвращает tx_hash и сырой outcome.
 */
export async function signCallRaw(opts: {
  contractId: string;
  methodName: string;
  args: Record<string, unknown>;
  gas: bigint;
  deposit: bigint;
}): Promise<{ hash: string; outcome: unknown }> {
  const { account } = await getNear();
  const outcome = await account.callFunctionRaw({
    contractId: opts.contractId,
    methodName: opts.methodName,
    args: opts.args,
    gas: opts.gas,
    deposit: opts.deposit,
  });
  const hash =
    (outcome as { transaction?: { hash?: string } }).transaction?.hash ??
    (outcome as { transaction_outcome?: { id?: string } }).transaction_outcome?.id;
  if (!hash) throw new Error(`${opts.methodName}: не удалось получить tx_hash`);
  return { hash, outcome };
}

/**
 * Сколько лежит данного токена на signer-аккаунте (raw NEP-141 units).
 */
// In-memory кэш балансов сервисного кошелька: при бурстах withdraw'ов
// (10+ юзеров жмут одновременно) не дёргаем RPC 10 раз — один раз в 10с.
// На Vercel инстанс короткоживущий → кэш сам инвалидируется при cold-start.
const balanceCache = new Map<string, { raw: string; expiresAt: number }>();
const BALANCE_TTL_MS = 10_000;

export async function getOperatingBalanceRaw(ftContract: string): Promise<string> {
  const accountId = process.env.NEAR_SIGNER_ACCOUNT_ID;
  if (!accountId) throw new Error("NEAR_SIGNER_ACCOUNT_ID не задан");
  const cacheKey = `${ftContract}::${accountId}`;
  const cached = balanceCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.raw;

  // Через пул с failover. На 429 fastnear переключается на lava/omniatech/1rpc.
  const { nearRpc } = await import("./rpc");
  const argsB64 = Buffer.from(JSON.stringify({ account_id: accountId })).toString("base64");
  const j = await nearRpc<{ result?: number[] }>("query", {
    request_type: "call_function",
    finality: "final",
    account_id: ftContract,
    method_name: "ft_balance_of",
    args_base64: argsB64,
  });
  const bytes = j.result?.result;
  if (!bytes || bytes.length === 0) {
    balanceCache.set(cacheKey, {
      raw: "0",
      expiresAt: Date.now() + BALANCE_TTL_MS,
    });
    return "0";
  }
  const text = Buffer.from(bytes).toString("utf-8");
  let result = "0";
  try {
    const parsed = JSON.parse(text);
    result = typeof parsed === "string" ? parsed : "0";
  } catch {
    result = "0";
  }
  balanceCache.set(cacheKey, {
    raw: result,
    expiresAt: Date.now() + BALANCE_TTL_MS,
  });
  return result;
}

/** Сбросить кэш баланса (вызывается после успешного withdraw, чтобы
 *  следующий запрос видел свежий баланс). */
export function invalidateBalanceCache(ftContract: string): void {
  const accountId = process.env.NEAR_SIGNER_ACCOUNT_ID;
  if (!accountId) return;
  balanceCache.delete(`${ftContract}::${accountId}`);
}

/**
 * Batch ft_transfer N получателям ОДНОЙ tx (chunked если actions > лимита).
 *
 * NEAR gas-лимит ~300 TGas на tx. ft_transfer ~10 TGas + storage_deposit
 * ~5 TGas, плюс конверт сетевой работы. Берём CHUNK=20 ft_transfer + 20
 * storage_deposit = 40 actions ≈ 240 TGas — safe.
 *
 * Каждому получателю кладём (storage_deposit, ft_transfer) парой.
 * storage_deposit идемпотентен — если получатель уже зарегистрирован
 * на этой FT-контракте, deposit вернётся обратно (стандарт NEP-145).
 *
 * Возвращает массив tx_hash в порядке выполнения чанков.
 */
export type BatchTransferResult = {
  /** Транзакции, которые сеть подтвердила. */
  txHashes: string[];
  /** Кому деньги ушли на самом деле. */
  paid: string[];
  /** Кому не ушло, и почему. */
  failed: Array<{ receivers: string[]; txHash: string; error: string }>;
};

/**
 * Рассылка пачкой: storage_deposit + ft_transfer на каждого получателя.
 *
 * ⚠️ ПРО ГАЗ. У транзакции NEAR жёсткий потолок 300 TGas, а пара действий на
 * одного получателя стоит 25 (5 на регистрацию + 20 на перевод). Кусок по
 * пятнадцать человек — это 375 TGas, и сеть такую транзакцию не принимает
 * ВООБЩЕ: 11.09.2026 из трёх кусков долетел только последний (остаток в шесть
 * человек), тридцать получателей остались без денег, а отчёт сказал «выполнено».
 * Поэтому кусок считается от газа, а не берётся на глазок.
 *
 * И второе: `signAndSendSafe` возвращает хэш даже когда транзакция не ушла.
 * Раньше хэши складывались в отчёт не глядя на статус — отсюда и «3
 * транзакции» при одной реальной. Теперь неподтверждённый кусок попадает в
 * `failed` вместе со списком тех, кому не досталось.
 */
const PAIR_GAS_TGAS = 25;
const TX_GAS_BUDGET_TGAS = 250; // 300 минус запас на исполнение
export const BATCH_CHUNK_PAIRS = Math.floor(TX_GAS_BUDGET_TGAS / PAIR_GAS_TGAS);

export async function ftTransferBatched(opts: {
  ftContract: string;
  decimals: number;
  items: Array<{ receiverId: string; amountHuman: number }>;
  /** Перед отправкой куска: хэш, nonce и подписанные байты — записать, чтобы потом найти. */
  onSigned?: (txHash: string, meta: import("./nearSafe").SignedMeta) => Promise<void>;
}): Promise<BatchTransferResult> {
  const out: BatchTransferResult = { txHashes: [], paid: [], failed: [] };
  if (opts.items.length === 0) return out;
  const { signAndSendSafe, functionCallAction } = await import("./nearSafe");

  type Pair = { receiver: string; sd: unknown; ft: unknown };
  const pairs: Pair[] = [];
  for (const it of opts.items) {
    if (it.amountHuman < 0.01) continue;
    const rawAmount = humanToRaw(it.amountHuman, opts.decimals).toString();
    pairs.push({
      receiver: it.receiverId,
      sd: functionCallAction({
        methodName: "storage_deposit",
        args: { account_id: it.receiverId },
        gas: 5_000_000_000_000n,
        deposit: 1_250_000_000_000_000_000_000n, // 0.00125 NEAR
      }),
      ft: functionCallAction({
        methodName: "ft_transfer",
        args: {
          receiver_id: it.receiverId,
          amount: rawAmount,
          memo: "yuplink batch distribute",
        },
        gas: 20_000_000_000_000n,
        deposit: 1n,
      }),
    });
  }
  if (pairs.length === 0) return out;

  for (let i = 0; i < pairs.length; i += BATCH_CHUNK_PAIRS) {
    const slice = pairs.slice(i, i + BATCH_CHUNK_PAIRS);
    const receivers = slice.map((p) => p.receiver);
    const actions = slice.flatMap((p) => [p.sd, p.ft]);
    try {
      const r = await signAndSendSafe({
        receiverId: opts.ftContract,
        actions,
        onSigned: opts.onSigned ?? (async () => {}),
      });
      if (r.status === "confirmed") {
        out.txHashes.push(r.txHash);
        out.paid.push(...receivers);
      } else {
        const why = r.errorData ? ` ${JSON.stringify(r.errorData).slice(0, 200)}` : "";
        out.failed.push({ receivers, txHash: r.txHash, error: (r.errorMsg ?? "не подтверждено") + why });
      }
    } catch (e) {
      out.failed.push({
        receivers,
        txHash: "",
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return out;
}

/**
 * Batch nft_transfer с нашего сервисного коша. Multi-action TX
 * (несколько nft_transfer в одной транзакции). Gas-limit ~300 TGas
 * на TX, один nft_transfer ~10 TGas → до ~10 NFT за раз.
 */
export async function ftTransferNftBatch(opts: {
  nftContract: string;
  receiverId: string;
  tokenIds: string[];
  onSigned?: (txHash: string) => Promise<void>;
}): Promise<{ txHash: string; status: "confirmed" | "unknown" }> {
  if (opts.tokenIds.length === 0) throw new Error("Нет tokenIds");
  if (opts.tokenIds.length > 10) throw new Error("Максимум 10 NFT за один batch");
  // У near-api-js v7 формат Action — borsh-структура {FunctionCall:{...}},
  // а не v8-стиль {type:"FunctionCall",params:{...}}. Используем готовый
  // signAndSendSafe из nearSafe.ts — он же даёт идемпотентность через
  // onSigned (tx_hash сохраняется ДО broadcast).
  const { signAndSendSafe, functionCallAction } = await import("./nearSafe");
  const actions = opts.tokenIds.map((tid) =>
    functionCallAction({
      methodName: "nft_transfer",
      args: { receiver_id: opts.receiverId, token_id: tid },
      gas: 20_000_000_000_000n,
      deposit: 1n,
    }),
  );
  const r = await signAndSendSafe({
    receiverId: opts.nftContract,
    actions,
    onSigned: opts.onSigned ?? (async () => {}),
  });
  return {
    txHash: r.txHash,
    status: r.status === "confirmed" ? "confirmed" : "unknown",
  };
}

/** Yocto-NEAR баланс самого аккаунта (для отображения). */
export async function getOperatingNearBalance(): Promise<string> {
  const accountId = process.env.NEAR_SIGNER_ACCOUNT_ID;
  if (!accountId) throw new Error("NEAR_SIGNER_ACCOUNT_ID не задан");
  const { nearRpc } = await import("./rpc");
  try {
    const j = await nearRpc<{ amount?: string }>("query", {
      request_type: "view_account",
      finality: "final",
      account_id: accountId,
    });
    return j.result?.amount ?? "0";
  } catch {
    return "0";
  }
}

/** Конвертация raw → читаемое число. Дробную часть тримит трейлинг-нули. */
export function rawToHuman(raw: string, decimals: number): string {
  if (decimals === 0) return raw;
  const r = BigInt(raw);
  const divisor = 10n ** BigInt(decimals);
  const whole = r / divisor;
  const remainder = r % divisor;
  if (remainder === 0n) return whole.toString();
  const frac = remainder.toString().padStart(decimals, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole.toString();
}

/** Сравнение «достаточно ли raw-баланса для humanAmount * 10^decimals». */
export function hasEnough(rawBalance: string, humanAmount: number, decimals: number): boolean {
  const need = humanToRaw(humanAmount, decimals);
  return BigInt(rawBalance) >= need;
}

interface FtTransferVerifyArgs {
  txHash: string;
  // Кто допустим как отправитель транзакции. Можно массив (для юзеров с
  // несколькими кошельками на одном TG — подпись принимается с ЛЮБОГО).
  senderAccount: string | string[];
  // ft_contract на которой ожидаем ft_transfer (например yupland.tkn.near).
  ftContract: string;
  // Получатель ft_transfer (например darai_duplo.near).
  expectedReceiver: string;
  // Минимальная сумма в HUMAN-форме. На chain'е лежит amount * 10^decimals.
  minAmountHuman: number;
  decimals: number;
  // Символ токена, если известен. Нужен, когда индексер называет символ, но не
  // контракт: без сверки любой другой токен на тот же приёмник сойдёт за нужный.
  expectedSymbol?: string;
  // Это САМО пополнение ресурсного счёта. Только ему можно потратить квитанцию,
  // которая ложится в acc_deposit_tx; всем остальным она уже съедена.
  forAccountDeposit?: boolean;
  // Что покупают этой квитанцией. Своя таблица из сверки исключается — у неё
  // своя идемпотентность, и повтор там штатный. Не указан — считаем «билеты»
  // (исторический путь по умолчанию).
  receiptPurpose?: import("./api/receipt-guard").ReceiptPurpose;
}

interface RpcTxResult {
  transaction?: {
    signer_id?: string;
    receiver_id?: string;
    actions?: Array<unknown>;
  };
  status?: { SuccessValue?: string } | string;
  receipts_outcome?: Array<{
    outcome?: {
      status?: { SuccessValue?: string; Failure?: unknown } | string;
      executor_id?: string;
    };
  }>;
}

/**
 * Проверка on-chain что юзер реально подписал ft_transfer:
 *   from = senderAccount
 *   contract = ftContract
 *   action.method_name = "ft_transfer"
 *   args.receiver_id = expectedReceiver
 *   args.amount >= minAmountHuman * 10^decimals
 *   status = SuccessValue
 *
 * Возвращает реально переведённое amount в HUMAN-форме (если 0 — отказ).
 * Кидает Error при невалидном tx — caller'у показывать как причину отказа.
 *
 * Внутри — retry-цикл: tx может быть ещё не финализирован к моменту
 * нашего вызова (юзер только что подписал → сервер сразу проверяет).
 * Ждём до 30 сек с шагом 2 сек.
 */
async function fetchTxStatus(txHash: string, senderAccount: string): Promise<RpcTxResult | null> {
  // Используем единый RPC-пул с failover (см. ./rpc.ts) — на 429/timeout
  // переключаемся на следующий эндпоинт автоматически.
  const { nearRpc } = await import("./rpc");
  try {
    const r = await nearRpc<RpcTxResult>("EXPERIMENTAL_tx_status", {
      tx_hash: txHash,
      sender_account_id: senderAccount,
      wait_until: "FINAL",
    });
    if (r.result) return r.result;
  } catch {
    // продолжаем — попробуем классический tx
  }
  try {
    const r = await nearRpc<RpcTxResult>("tx", [txHash, senderAccount]);
    return r.result ?? null;
  } catch {
    return null;
  }
}

/** Символ токена по ft-контракту из реестра наград. Null — контракт не наш. */
async function symbolOfContract(ftContract: string): Promise<string | null> {
  try {
    const { pg } = await import("./db/pg");
    const row = (await pg.rewardTokens.findFirst({ ft_contract: ftContract })) as {
      symbol?: string;
    } | null;
    return row?.symbol ?? null;
  } catch {
    return null;
  }
}

export async function verifyFtTransfer(
  args: FtTransferVerifyArgs,
): Promise<{ paidHuman: number; paidRaw: string; actualSender: string }> {
  // Допустимые отправители (одиночный или массив — нормализуем к массиву).
  // Юзер с несколькими TG-кошельками может подписать ЛЮБЫМ из них.
  const senders = Array.isArray(args.senderAccount)
    ? args.senderAccount.filter(Boolean)
    : [args.senderAccount];
  if (senders.length === 0) throw new Error("Не задан отправитель");

  // Квитанция, уже превращённая в товар, второй раз не тратится. Проверка
  // стоит ЗДЕСЬ, а не в каждом обработчике: через эту функцию проходят все
  // пути, где перевод становится товаром, и следующий такой путь получит
  // защиту, ничего про неё не зная. Обратная сверка (счёт не берёт квитанцию,
  // по которой уже выдан товар) живёт в acc_deposit_apply.
  {
    const { assertReceiptFree } = await import("./api/receipt-guard");
    await assertReceiptFree(
      args.txHash,
      args.forAccountDeposit ? "account" : (args.receiptPurpose ?? "tickets"),
    );
  }

  // Проверяем ТОЛЬКО через Sendler — так решил владелец. Публичные RPC NEAR
  // регулярно падают всей пачкой (429/410), и любая проверка, которая на них
  // опирается, вместе с ними отказывает игрокам в их же деньгах.
  //
  // Ищем среди ВХОДЯЩИХ на наш приёмник: он один и известен, а отправителей
  // пришлось бы перебирать по всем sister-кошелькам — это и лишние запросы, и
  // промах, если подписал кошелёк не из списка.
  const { findFtTransferToReceiver } = await import("./sendler");
  const wantSymbol = args.expectedSymbol ?? (await symbolOfContract(args.ftContract));
  const needRawBig = humanToRaw(args.minAmountHuman, args.decimals);

  // Индексер отстаёт от финализации на 1-5 секунд — ждём.
  //
  // ЗАПРОСОВ ДОЛЖНО БЫТЬ МАЛО. Sendler режет ключ при частых обращениях и
  // отвечает «неверный ключ»; жадный поиск (шесть попыток по десять страниц)
  // сам себя и заваливал — так не зачлось пополнение на 1 USDT 29.08. Свежий
  // перевод лежит в САМОМ НАЧАЛЕ ленты, поэтому первые попытки читают ровно
  // одну страницу, и только последняя листает глубже.
  let hit: Awaited<ReturnType<typeof findFtTransferToReceiver>> = null;
  let indexerError: Error | null = null;
  for (let attempt = 0; attempt < 5 && !hit; attempt++) {
    const deep = attempt === 4;
    try {
      hit = await findFtTransferToReceiver({
        txHash: args.txHash,
        receiver: args.expectedReceiver,
        // Фильтр по токену сужает ленту; на последней попытке снимаем его —
        // символ в индексе может писаться иначе (USDT у нас, USDt у Sendler).
        symbol: deep ? undefined : (wantSymbol ?? undefined),
        maxPages: deep ? 3 : 1,
      });
      indexerError = null;
    } catch (e) {
      // Индексер не ответил — это НЕ «перевода не было». Сказать игроку
      // «не найдено» здесь значит списать его деньги в никуда.
      indexerError = e instanceof Error ? e : new Error(String(e));
      console.warn(
        `[verifyFt] индексер не ответил (попытка ${attempt + 1}) tx=${args.txHash.slice(0, 12)}:`,
        indexerError.message,
      );
    }
    if (!hit && attempt < 4) await new Promise((r) => setTimeout(r, 2500));
  }
  if (!hit) {
    console.warn(
      `[verifyFt] не нашли tx=${args.txHash.slice(0, 12)} получатель=${args.expectedReceiver} токен=${wantSymbol ?? "?"}` +
        (indexerError ? ` (последняя ошибка: ${indexerError.message})` : ""),
    );
  }

  if (!hit) {
    if (indexerError) {
      throw new Error(
        "Не удалось проверить перевод: индексер сейчас недоступен. Деньги на месте — повтори через минуту.",
      );
    }
    throw new Error(
      "Транзакция не найдена. Подожди минуту и нажми ещё раз — она ещё не финализирована.",
    );
  }

  // Отправитель обязан быть своим: иначе чужим переводом на наш приёмник
  // можно было бы пополнить свой счёт.
  const gotSender = String(hit.sender ?? "");
  if (!senders.includes(gotSender)) {
    throw new Error("Перевод подписан не твоим кошельком");
  }
  if (String(hit.receiver ?? "") !== args.expectedReceiver) {
    throw new Error("ft_transfer в транзакции направлен не на нужный аккаунт");
  }
  // КАКОЙ токен приехал. Сверяем КОНТРАКТ, а не символ: символ пишет сам
  // токен, и любой желающий мог выпустить свой контракт с symbol «Darai» и
  // теми же знаками после запятой — сервер зачёл бы его как настоящий.
  // Контракт в ответе индексера есть (поле ft_contract/contract_id в raw).
  const rawRow = (hit.raw ?? {}) as Record<string, unknown>;
  const gotContract = String(
    rawRow.ft_contract ?? rawRow.contract_id ?? rawRow.token_contract ?? "",
  ).trim();
  if (gotContract) {
    if (gotContract !== args.ftContract) {
      throw new Error("В транзакции переведён другой токен");
    }
  } else {
    // Контракта в записи нет — тогда символ остаётся единственной приметой,
    // но одного символа мало: без контракта перевод не засчитываем.
    throw new Error("Индексер не назвал контракт токена — повтори через минуту");
  }
  const gotSymbol = String(hit.symbol ?? "");
  if (wantSymbol && gotSymbol && gotSymbol.toLowerCase() !== wantSymbol.toLowerCase()) {
    throw new Error("В транзакции переведён другой токен");
  }
  const amountStr = String(hit.amount ?? "");
  if (!/^\d+$/.test(amountStr)) {
    throw new Error("Индексер не назвал сумму перевода — повтори через минуту");
  }
  const paid = BigInt(amountStr);
  if (paid < needRawBig) {
    throw new Error("Недостаточная сумма в транзакции (нужно больше)");
  }
  return {
    paidHuman: Number(rawToHuman(paid.toString(), args.decimals)),
    paidRaw: paid.toString(),
    actualSender: gotSender,
  };
}
