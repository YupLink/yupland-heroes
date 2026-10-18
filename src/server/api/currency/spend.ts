// Оплата со счёта и возврат, если выдача не состоялась.
//
// Порядок обязателен и он же правило проекта: сначала деньги, потом товар.
// Отдельной проверки «хватает ли» перед списанием НЕ делаем — она читает
// устаревшее число и пропускает два параллельных запроса разом. Гард живёт
// внутри acc_move: он блокирует аккаунт и не пускает баланс в минус.
import { accMove, type AccMoveResult } from "./move";

/**
 * Списать со счёта под конкретную операцию.
 *
 * ref обязан однозначно опознавать операцию И включать плательщика, если на
 * одну сущность претендуют несколько игроков (иначе проигравший в гонке
 * получит возврат за то, чего не списывал).
 *
 * applied=false означает «уже оплачено раньше» — это не ошибка, товар в таком
 * случае надо выдать, а не отказать.
 */
export function payFromAccount(opts: {
  wallet: string;
  token: string;
  amount: number;
  ref: string;
  accountId?: string;
}): Promise<AccMoveResult> {
  if (!(opts.amount > 0)) throw new Error("Сумма списания должна быть больше нуля");
  return accMove({
    wallet: opts.wallet,
    token: opts.token,
    delta: -opts.amount,
    kind: "acc_spend",
    ref: opts.ref,
    accountId: opts.accountId,
  });
}

/**
 * Вернуть на счёт, если выдача сорвалась после списания.
 * Ключ возврата — исходный ключ с суффиксом, поэтому вернуть дважды нельзя.
 */
export function refundToAccount(opts: {
  wallet: string;
  token: string;
  amount: number;
  ref: string;
  accountId?: string;
}): Promise<AccMoveResult> {
  if (!(opts.amount > 0)) throw new Error("Сумма возврата должна быть больше нуля");
  return accMove({
    wallet: opts.wallet,
    token: opts.token,
    delta: opts.amount,
    kind: "acc_refund",
    ref: `${opts.ref}-undo`,
    accountId: opts.accountId,
  });
}
