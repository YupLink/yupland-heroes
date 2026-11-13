// Монеты в пул банка — с основного кошелька игры (владелец, 29.10.2026: «мои балансы
// не трожь — сказали пополнить, значит пополни пул! … с основного кошелька и учитывай
// всё»). Ни с чьего счёта не списываются (bank_pool_fund_main, миграция bank-13).
// Хватает ли — по «свободно» того же расчёта, что полоска над картой (token-free-pool:
// на кошельке − счета игроков − награды − карта − выводы − уже чьё-то, куда входят и
// запасы всех пулов банка). Ресурсы (золото, дерево…) выпускает игра — без проверки.
import { isBankResource, tokenLabel, type BankPool } from "@/lib/castleBank";
import { freeTokenPool } from "../token-free-pool";
import { OPERATING_WALLET } from "../currency/treasury";

/** Кошелёк-плательщик игры — тот же, от которого считается «свободно». */
export const FUND_WALLET = OPERATING_WALLET;
/** Счёт наполнения в журнале bank_pool_fund. */
export const FUND_ACCOUNT = `wallet:${FUND_WALLET}`;

/** Монетные стороны наполнения: символ и сколько кладём. */
export function coinSides(
  pool: Pick<BankPool, "tokenA" | "tokenB">,
  amountA: number,
  amountB: number,
): Array<{ token: string; amount: number }> {
  return [
    { token: pool.tokenA, amount: amountA },
    { token: pool.tokenB, amount: amountB },
  ].filter((s) => !isBankResource(s.token));
}

/** Отказ до записи, если свободных монет на основном кошельке меньше, чем кладём. */
export async function assertFundCovered(
  pool: Pick<BankPool, "tokenA" | "tokenB">,
  amountA: number,
  amountB: number,
): Promise<void> {
  const sides = coinSides(pool, amountA, amountB);
  const free = await Promise.all(sides.map((s) => freeTokenPool(s.token)));
  sides.forEach((s, i) => {
    const f = free[i].free;
    if (f === null) throw new Error("Остаток основного кошелька не прочитался — попробуй ещё раз");
    if (!(f >= s.amount))
      throw new Error(
        `На основном кошельке не хватает свободных ${tokenLabel(s.token, true)}: есть ${f.toLocaleString("ru-RU", { maximumFractionDigits: 6 })}`,
      );
  });
}
