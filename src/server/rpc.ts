// Общий NEAR RPC-клиент с пулом эндпоинтов и retry на 429.
//
// Проблема: FastNear (бесплатный) даёт 429 на бурст-нагрузках — особенно
// при выводе с 16+ клеймов + параллельных балансах + поллере. Решение:
// несколько публичных RPC + автоматический failover.
//
// Эндпоинты держим в порядке предпочтения. При 429/5xx — пробуем следующий.
// Кэшируем "last good" чтобы следующий запрос сразу шёл на работающий.
//
// ENV-переменные:
//   NEAR_RPC_URL — primary, ставится первым в пул (если задана)
//   NEAR_RPC_FALLBACKS — comma-separated дополнительные эндпоинты

// Список узлов — rpc-endpoints.ts (там же история, кого и почему выбросили).
import { buildEndpointPool } from "./rpc-endpoints";

const ENDPOINTS = buildEndpointPool();
// Индекс "last good" — следующий запрос стартует с него.
let preferredIdx = 0;

interface RpcOpts {
  // Таймаут на один HTTP-вызов (мс). Default 10000.
  timeoutMs?: number;
  // Доп. попытки сверх перебора пула (на каждый endpoint). Default 1.
  retries?: number;
}

interface RpcSuccess<T> {
  result?: T;
  error?: unknown;
}

/**
 * POST JSON-RPC с failover. Возвращает спарсенный JSON (как было до).
 * НЕ бросает на 429 — переключается на следующий эндпоинт.
 * Бросает только если ВСЕ эндпоинты упали.
 */
export async function nearRpc<T = unknown>(
  method: string,
  params: unknown,
  opts: RpcOpts = {}
): Promise<RpcSuccess<T>> {
  const timeoutMs = opts.timeoutMs ?? 10_000;
  const body = JSON.stringify({ jsonrpc: "2.0", id: "1", method, params });
  const lastErrors: string[] = [];

  // Перебираем endpoints начиная с preferredIdx, по кругу.
  for (let attempt = 0; attempt < ENDPOINTS.length; attempt++) {
    const idx = (preferredIdx + attempt) % ENDPOINTS.length;
    const url = ENDPOINTS[idx];
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        signal: ac.signal,
      });
      clearTimeout(t);

      // Любой не-2xx — это отказ узла, а не ответ ноды. Раньше проверялись
      // только 429 и 5xx, и 410 от выключенного эндпоинта проходил дальше как
      // «успех»: он же и застревал в preferredIdx.
      if (!r.ok) {
        lastErrors.push(`${url}: HTTP ${r.status}`);
        continue;
      }

      const j = (await r.json()) as RpcSuccess<T>;
      // Зафиксируем рабочий endpoint для следующего вызова.
      preferredIdx = idx;
      return j;
    } catch (err) {
      clearTimeout(t);
      const msg = err instanceof Error ? err.message : String(err);
      lastErrors.push(`${url}: ${msg}`);
      continue;
    }
  }
  throw new Error(
    `NEAR RPC: все эндпоинты упали. ${lastErrors.join(" | ")}`
  );
}

/**
 * Sugar: query view_access_key.
 */
export async function viewAccessKey(
  accountId: string,
  publicKeyStr: string
): Promise<{ nonce: number | string; block_hash: string }> {
  const r = await nearRpc<{ nonce: number | string; block_hash: string }>(
    "query",
    {
      request_type: "view_access_key",
      finality: "final",
      account_id: accountId,
      public_key: publicKeyStr,
    }
  );
  if (r.error) {
    const msg =
      typeof r.error === "object" && r.error && "message" in r.error
        ? String((r.error as { message: string }).message)
        : "RPC error";
    throw new Error(msg);
  }
  if (!r.result) throw new Error("RPC: пустой result для view_access_key");
  return r.result;
}

/**
 * Sugar: status конкретной транзакции. Возвращает result или null если
 * UNKNOWN_TRANSACTION (для resolver).
 */
export type TxStatusResult = {
  status?: { SuccessValue?: string; Failure?: unknown } | string;
  transaction?: { hash?: string };
};
export async function txStatus(
  txHash: string,
  signerAccount: string
): Promise<{ data: TxStatusResult | null; status: "ok" | "missing" | "pending" }> {
  // ── Шаг 1: Sendler (основной путь, нет rate-limit'ов) ──
  // ищем tx_hash в свежих transfers (FT и NFT) на signer'е.
  // Sendler индексирует ~1-5 сек после финализации → если нашли,
  // tx прошла. Если не нашли — может быть pending или ещё не индексирован.
  try {
    const { fetchAdminFtTransferHistory, fetchSendlerNftUserHistory } =
      await import("./sendler");
    const [ftHistory, nftHistory] = await Promise.all([
      fetchAdminFtTransferHistory({
        walletId: signerAccount,
        direction: "all",
        limit: 200,
      }).catch(() => []),
      fetchSendlerNftUserHistory({
        walletId: signerAccount,
        direction: "all",
        limit: 200,
      }).catch(() => []),
    ]);
    const ftMatch = ftHistory.find((t) => t.txHash === txHash);
    const nftMatch = nftHistory.find((t) => t.tx_hash === txHash);
    if (ftMatch || nftMatch) {
      // Sendler индексит только успешные tx → раз нашли, значит SuccessValue
      // (Failure'ы Sendler в indexed-стейте не держит).
      return {
        data: {
          status: { SuccessValue: "" },
          transaction: { hash: txHash },
        },
        status: "ok",
      };
    }
  } catch {
    /* индексер не ответил — ниже отвечаем «ещё в пути» */
  }

  // Статус транзакции спрашиваем ТОЛЬКО у Sendler. Прежний фолбэк на NEAR RPC
  // умел отвечать «missing» (UNKNOWN_TRANSACTION), а по этому ответу конвейер
  // выплат возвращает заявку в очередь — то есть падение публичного узла
  // превращалось в ВТОРУЮ выплату по уже отправленному переводу.
  //
  // Не нашли — говорим «ещё в пути», и заявка остаётся захваченной. Это
  // безопасная сторона: разобрать зависшую можно руками, отменить лишний
  // перевод — нельзя.
  return { data: null, status: "pending" };
}

/**
 * Транзакция ЯВНО отсутствует в цепочке? true — только если узел ответил
 * UNKNOWN_TRANSACTION («doesn't exist»), то есть перевод не долетел вовсе.
 *
 * Отдельно от txStatus: та ради защиты от двойной выплаты отвечает «pending»
 * на любое молчание индексера. Но у выплаты, залипшей в processing навсегда,
 * должен быть безопасный способ подтвердить «tx нет» — и это ПРЯМОЙ ответ ноды
 * «не знаю такую», а не сетевая ошибка. Сетевой сбой/таймаут/любой иной ответ
 * → false: молчание узла не повод считать перевод не ушедшим и возвращать
 * заявку (иначе выплатим второй раз). Вызывать только для СТАРЫХ строк —
 * свежая tx могла просто не проиндексироваться.
 */
export async function txAbsentOnChain(
  txHash: string,
  signerAccount: string,
): Promise<boolean> {
  try {
    // Именно EXPERIMENTAL_tx_status: метод «tx» на fastnear/1rpc не поддержан
    // (отдаёт «method does not exist»), и детект молча не срабатывал. wait_until
    // NONE — ответ сразу: у несуществующей это чистый UNKNOWN_TRANSACTION.
    const r = await nearRpc<unknown>(
      "EXPERIMENTAL_tx_status",
      { tx_hash: txHash, sender_account_id: signerAccount, wait_until: "NONE" },
      { timeoutMs: 12_000 },
    );
    const err = (r as { error?: unknown } | null)?.error as
      | { name?: string; cause?: { name?: string }; data?: unknown }
      | undefined;
    if (!err) return false; // есть result или пусто — не наш случай
    const name = err.cause?.name ?? err.name ?? "";
    const data = typeof err.data === "string" ? err.data : JSON.stringify(err.data ?? "");
    return name === "UNKNOWN_TRANSACTION" || /does\s?n[o']t exist|does not exist/i.test(data);
  } catch {
    // Все узлы упали — это НЕ доказательство отсутствия. Безопасная сторона.
    return false;
  }
}

/**
 * Broadcast pre-signed TX (base64). Если все эндпоинты упали — бросает.
 * Если broadcast вернул error — возвращаем как unknown.
 */
export async function broadcastTxCommit(
  signedTxBase64: string,
  timeoutMs = 12_000
): Promise<{
  ok: boolean;
  errorMsg?: string;
  /** Ошибка ноды целиком: по ней видно InvalidNonce / Expired. */
  errorData?: unknown;
  result?: TxStatusResult;
}> {
  try {
    const r = await nearRpc<TxStatusResult>(
      "broadcast_tx_commit",
      [signedTxBase64],
      { timeoutMs }
    );
    if (r.error) {
      const msg =
        typeof r.error === "object" && r.error && "message" in r.error
          ? String((r.error as { message: string }).message)
          : "RPC error";
      return { ok: false, errorMsg: msg, errorData: r.error };
    }
    return { ok: true, result: r.result };
  } catch (err) {
    return { ok: false, errorMsg: err instanceof Error ? err.message : String(err) };
  }
}
