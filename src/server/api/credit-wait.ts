// Ожидаемое зачисление: «деньги придут в течение минуты».
//
// Зачем вообще ждать. Раньше проверка перевода начиналась сразу после подписи —
// то есть в момент, когда индексер физически ещё не видит транзакцию. Проверка
// честно не находила её, игрок получал отказ и шёл искать хэш руками. Каждая
// такая проверка стоила пяти запросов к Sendler, и все пять были заведомо
// впустую.
//
// Теперь порядок обратный: перевод записывается как ожидаемый, игроку сразу
// говорят «минуту», и ровно ОДИН запрос уходит тогда, когда ответ уже есть.
//
// Строка живёт три жизни: очередь проверки (status=waiting), результат
// (status=done/failed) и почта уведомлений (notified_at IS NULL).
import { mcpExec } from "../db/mcpClient";
import { sqlStr } from "./chips-utils";

/** Столько ждём перед первой проверкой: сети хватает с запасом. */
export const WAIT_SEC = 60;
/** Дальше этого не догоняем сами — дальше только крон. */
const MAX_ATTEMPTS = 6;

export type CreditKind = "deposit" | "nft_input";

export type CreditRow = {
  id: string;
  kind: CreditKind;
  wallet: string;
  account_id: string | null;
  tx_hash: string | null;
  token: string | null;
  status: string;
  attempts: number;
  amount: string | null;
  detail: string | null;
  ready_at: string;
};

/**
 * Завести ожидание. Идемпотентно по ключу: повторная подпись той же квитанции
 * (перезагрузил страницу, нажал ещё раз) не плодит вторую очередь.
 */
export async function noteCreditWait(args: {
  id: string;
  kind: CreditKind;
  wallet: string;
  accountId?: string | null;
  txHash?: string | null;
  token?: string | null;
  waitSec?: number;
}): Promise<void> {
  const wait = args.waitSec ?? WAIT_SEC;
  await mcpExec(
    `INSERT INTO yuplink.credit_wait (id, kind, wallet, account_id, tx_hash, token, ready_at)
     VALUES (${sqlStr(args.id)}, ${sqlStr(args.kind)}, ${sqlStr(args.wallet)},
             ${args.accountId ? sqlStr(args.accountId) : "NULL"},
             ${args.txHash ? sqlStr(args.txHash) : "NULL"},
             ${args.token ? sqlStr(args.token) : "NULL"},
             now() + interval '${wait} seconds')
     ON CONFLICT (id) DO NOTHING;`,
  );
}

/** Что пора проверять. Для одного игрока — только его (ключ — аккаунт). */
export async function dueCredits(opts: {
  accountId?: string;
  limit?: number;
}): Promise<CreditRow[]> {
  const rows = (await mcpExec(
    `SELECT id, kind, wallet, account_id, tx_hash, token, status, attempts,
            amount::text AS amount, detail, ready_at
       FROM yuplink.credit_wait
      WHERE status = 'waiting' AND ready_at <= now() AND attempts < ${MAX_ATTEMPTS}
        ${opts.accountId ? `AND account_id = ${sqlStr(opts.accountId)}` : ""}
      ORDER BY ready_at
      LIMIT ${opts.limit ?? 20};`,
    { wrapJson: true },
  )) as CreditRow[];
  return rows ?? [];
}

/** Зачли. Строка становится письмом, которое ещё не прочитали. */
async function markDone(id: string, amount: number | null, detail: string): Promise<void> {
  await mcpExec(
    `UPDATE yuplink.credit_wait
        SET status = 'done', settled_at = now(),
            amount = ${amount == null ? "NULL" : amount},
            detail = ${sqlStr(detail)}
      WHERE id = ${sqlStr(id)} AND status = 'waiting';`,
  );
}

/**
 * Не вышло — но это НЕ отказ игроку.
 *
 * Попытку считаем и отодвигаем следующую: индексер мог просто ещё не догнать.
 * Насовсем сдаёмся только упершись в потолок попыток — и молча: дальше дело
 * крона, а игроку про внутренние неудачи знать незачем.
 */
async function markRetry(id: string, attempts: number, err: string): Promise<void> {
  const done = attempts + 1 >= MAX_ATTEMPTS;
  await mcpExec(
    `UPDATE yuplink.credit_wait
        SET attempts = attempts + 1,
            error = ${sqlStr(err.slice(0, 300))},
            ready_at = now() + interval '${Math.min(60 * (attempts + 1), 600)} seconds'
            ${done ? ", status = 'failed'" : ""}
      WHERE id = ${sqlStr(id)} AND status = 'waiting';`,
  );
}

/** Провести одно ожидание. Возвращает true, если зачли именно сейчас. */
export async function settleCredit(row: CreditRow): Promise<boolean> {
  try {
    if (row.kind === "deposit") {
      if (!row.tx_hash || !row.token) throw new Error("нет квитанции или токена");
      const { applyAccountDeposit } = await import("./currency/deposit-apply");
      const res = await applyAccountDeposit({
        wallet: row.wallet,
        txHash: row.tx_hash,
        token: row.token,
      });
      // `applied=false` значит «уже было зачтено раньше» — тоже успех, просто
      // сообщать не о чем: деньги на счету, повторять нечего.
      await markDone(row.id, res.amount, res.applied ? "" : "уже было зачтено");
      return res.applied;
    }

    // NFT: догон разбирает личную историю кошелька в Sendler и выдаёт всё, что
    // причитается. Мы не передаём ему то, что прислал клиент — см. шапку
    // nft-input-pending.
    const { chasePendingInput } = await import("./nft-input-pending");
    const granted = await chasePendingInput(row.wallet);
    if (granted <= 0) throw new Error("подтверждения ещё нет");
    await markDone(row.id, granted, granted === 1 ? "1" : String(granted));
    return true;
  } catch (e) {
    await markRetry(row.id, row.attempts, e instanceof Error ? e.message : String(e));
    return false;
  }
}

/**
 * Закрыть ожидание, зачтённое другим путём (игрок нажал «зачесть сейчас»).
 * Уведомлять не о чем: он и так только что видел результат на экране.
 */
export async function closeCreditWait(id: string): Promise<void> {
  await mcpExec(
    `UPDATE yuplink.credit_wait
        SET status = 'done', settled_at = now(), notified_at = now()
      WHERE id = ${sqlStr(id)} AND status = 'waiting';`,
  );
}

/** Прогон очереди — для крона и разбора. */
export async function settleDueCredits(limit = 20): Promise<{ checked: number; settled: number }> {
  const rows = await dueCredits({ limit });
  // Параллельный разбор: каждая запись независима (разные id, разные кошельки).
  const results = await Promise.all(rows.map((r) => settleCredit(r)));
  const settled = results.filter(Boolean).length;
  return { checked: rows.length, settled };
}
