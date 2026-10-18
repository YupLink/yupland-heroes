// Покупка подписки на энергию со счёта игрока (USDT / Darai / STARS).
//
// Порядок — правило проекта «сначала деньги, потом товар»:
//   1) списание со счёта (acc_move, ключ = аккаунт + тариф + нажатие);
//   2) ОДНИМ запросом: строка подписки + раскладка денег по корзинам (и доля
//      DARAI в пул карты). Разнести эти записи по разным запросам нельзя:
//      обрыв между ними оставил бы оплату без корзин или корзины без подписки;
//   3) не записалось — возврат на счёт тем же ключом с суффиксом «-undo».
// Повтор того же нажатия: списание отвечает «уже было», подписка находится
// по pay_ref — второй подписки и второго списания не будет. При повторе сумма
// подписки берётся из журнала счёта (фактически списанная, курс мог сдвинуться),
// а если то списание уже вернули — повтор отказывает: иначе подписка вышла бы
// даром. Валюта входит в ключ: повтор другой валютой — это новая оплата.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mcpExec } from "../../db/mcpClient";
import { assertNotMaintenance } from "../../maintenance";
import { moneyGate } from "../../rateGate";
import { requireAccountUser } from "../account-rollout";
import { accAccountId, accBalance } from "../currency/move";
import { payFromAccount, refundToAccount } from "../currency/spend";
import { priceIn, priceMovedUp, SUB_TOKENS } from "@/lib/energySub";
import { canUseSubs, loadTier } from "./tiers";
import { daraiPerUsd } from "./rate";
import { firstRow } from "./grant";

export const buyEnergySub = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        tierId: z.string().min(1).max(40),
        token: z.enum(SUB_TOKENS),
        /** Цена, которую игрок видел. Выросла сверх 2 % — просим подтвердить новую. */
        expected: z.number().positive(),
        /** Один на нажатие: ретрай того же нажатия не спишет дважды. */
        opId: z.string().min(8).max(40),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    assertNotMaintenance();
    const wallet = await requireAccountUser();
    if (!(await canUseSubs(wallet))) throw new Error("esub.unavailable");
    await moneyGate("esub", wallet);

    const account = await accAccountId(wallet);
    if (!account) throw new Error("Не найден аккаунт для кошелька");
    const tier = await loadTier(data.tierId);
    if (!tier || !tier.active) throw new Error("esub.no_tier");

    const rate = data.token === "Darai" ? ((await daraiPerUsd())?.rate ?? null) : null;
    const amount = priceIn(tier.priceUsd, data.token, rate);
    if (amount == null || !(amount > 0)) throw new Error("esub.no_rate");
    if (priceMovedUp(data.expected, amount)) throw new Error("esub.price_changed");

    const { createSubSql, prevPayment, settleEnergyBeforeShield, subExists, subIdOf } = await import("./buy-sql");
    const payRef = `esub:${account}:${tier.id}:${data.token}:${data.opId}`;
    const subId = subIdOf(payRef);
    const pay = await payFromAccount({ wallet, token: data.token, amount, ref: payRef, accountId: account });
    let paid = amount;
    if (!pay.applied) {
      const prev = await prevPayment(payRef, data.token);
      if (prev.undone || !(prev.paid > 0)) throw new Error("esub.retry");
      paid = prev.paid;
    }

    if (tier.noDecay) await settleEnergyBeforeShield(account);
    try {
      const res = firstRow<{ created: string | null; existing: string | null }>(
        await mcpExec(createSubSql({ subId, account, wallet, tier, token: data.token, amount: paid, rate, payRef })),
      );
      if (!res?.created && !res?.existing && !(await subExists(payRef))) {
        throw new Error("Подписка не записалась");
      }
    } catch (e) {
      // Деньги сняты ЭТИМ вызовом, а подписки нет — возвращаем. Если списание
      // было раньше (повтор), подписка либо есть, либо её допишет следующий повтор.
      if (pay.applied && !(await subExists(payRef).catch(() => true))) {
        await refundToAccount({ wallet, token: data.token, amount: paid, ref: payRef, accountId: account });
      }
      throw e;
    }

    // День 1 — сразу в «Подарки»; корзины — пачкой, если набрали порог.
    const { grantDueForAccount } = await import("./grant");
    await grantDueForAccount(account, { force: true }).catch((e) => console.warn("[esub] день 1:", subId, e));
    const { runDueBatches } = await import("./batch");
    void runDueBatches("auto").catch((e) => console.warn("[esub] пачки:", e));

    return {
      ok: true as const,
      subId,
      token: data.token,
      spent: paid,
      balance: await accBalance(wallet, data.token).catch(() => null),
    };
  });
