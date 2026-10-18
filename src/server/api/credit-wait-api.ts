// Что из ожидаемых зачислений видит клиент.
//
// Ровно две ручки — и обе дешёвые. `registerAccountDeposit` не ходит в сеть
// вообще: она только записывает намерение и возвращает, сколько ждать.
// `pollMyCredits` проводит СВОИ созревшие ожидания и отдаёт то, о чём игроку
// ещё не сказали. Клиент дёргает её один раз при входе и один раз через
// минуту после подписи — этого достаточно, чтобы не остаться без новостей.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mcpExec } from "../db/mcpClient";
import { assertNotMaintenance } from "../maintenance";
import { moneyGate, actionGate } from "../rateGate";
import { requireAccountUser } from "./account-rollout";
import { getCurrentWallet } from "../auth";
import { sqlStr } from "./chips-utils";
import { WAIT_SEC, noteCreditWait, dueCredits, settleCredit } from "./credit-wait";
import { accAccountId } from "./currency/move";

/**
 * Записать подписанный перевод как ожидаемый.
 *
 * Здесь НЕТ проверки в сети — и это главное. В момент подписи транзакции в
 * индексе ещё нет: прежняя проверка гарантированно промахивалась, жгла пять
 * запросов и отправляла игрока искать хэш руками.
 */
export const registerAccountDeposit = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ txHash: z.string().min(20).max(64), token: z.string().min(1).max(32) }).parse(d),
  )
  .handler(async ({ data }) => {
    assertNotMaintenance();
    const wallet = await requireAccountUser();
    await moneyGate("deposit-note", wallet);
    const account = await accAccountId(wallet);
    await noteCreditWait({
      id: `dep:${data.txHash.trim()}`,
      kind: "deposit",
      wallet,
      accountId: account,
      txHash: data.txHash.trim(),
      token: data.token.trim(),
    });
    return { ok: true as const, waitSec: WAIT_SEC };
  });

type Notice = {
  id: string;
  kind: string;
  token: string | null;
  amount: string | null;
  detail: string | null;
};

/**
 * Провести свои созревшие ожидания и забрать новости.
 *
 * Уведомляем ТОЛЬКО об удаче: «не получилось» игроку не показываем — он всё
 * равно ничего не может сделать, а догон и крон продолжают работу сами.
 */
export const pollMyCredits = createServerFn({ method: "POST" }).handler(async () => {
  const wallet = getCurrentWallet();
  if (!wallet) return { notices: [] as Notice[], waiting: 0 };
  await actionGate("credit-poll", wallet);

  // Ключ — аккаунт: перевод мог быть подписан одним адресом, а в игру человек
  // зашёл другим — новость о зачислении всё равно его.
  const { accountIdOf } = await import("./user-shared");
  const account = await accountIdOf(wallet);
  if (!account) return { notices: [] as Notice[], waiting: 0 };

  // Свои и только созревшие: чужие ожидания проводит крон.
  const due = await dueCredits({ accountId: account, limit: 5 });
  for (const r of due) await settleCredit(r);

  // ⚠️ Выбираем и помечаем ОДНИМ запросом (UPDATE ... RETURNING). Опрос теперь
  // идёт из двух мест сразу — глобальный сторож в корне и сама форма, — и два
  // раздельных запроса (сначала SELECT непоказанных, потом UPDATE) дали бы
  // обоим одну и ту же строку и, значит, двойной тост. Атомарная пометка
  // отдаёт каждое письмо ровно одному опросу.
  //
  // Свойство на границе: мост ретраит писавший запрос вслепую, и на повторе
  // после обрыва `notified_at IS NULL` уже ложно → вернётся 0 строк. Значит в
  // редкий момент обрыва ровно на этом POST один тост может не показаться.
  // Это осознанный размен: ДЕНЬГИ при этом целы (их зачислил settleCredit
  // выше), теряется лишь всплывашка. Показать пропущенное дважды хуже, чем
  // не показать один раз при сетевом сбое.
  const rows = (await mcpExec(
    `UPDATE yuplink.credit_wait
        SET notified_at = now()
      WHERE account_id = ${sqlStr(account)} AND status = 'done' AND notified_at IS NULL
      RETURNING id, kind, token, amount::text AS amount, detail;`,
    { wrapJsonCte: true },
  )) as Notice[];

  const notices = (rows ?? []).filter((r) => r.detail !== "уже было зачтено");

  const left = (await mcpExec(
    `SELECT count(*)::int AS n FROM yuplink.credit_wait
      WHERE account_id = ${sqlStr(account)} AND status = 'waiting';`,
    { wrapJson: true },
  )) as Array<{ n: number }>;

  return { notices, waiting: Number(left?.[0]?.n ?? 0) };
});
