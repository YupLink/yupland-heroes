// Групповая покупка на Рынке замка («Выбрать» и «Откуп по флору»).
//
// Вся пачка — один вызов функции базы yuplink.market_buy_batch (market-buy-rpc.ts,
// migrations/chipmkt-gold-01.sql, с 21.10.2026 — за золото) в одной транзакции:
// для каждого лота то же, что у одиночной покупки (золото покупателя, захват,
// фишка на час отдыха, 91 % продавцу, 9 % сгорает, аудит). Владелец, 09.10.2026:
// «не даёт откупить больше 20 за раз + долгие отклики» — по одной фишке 100 штук
// шли десятки секунд, пачкой ~0,2 с.
//
// Контракт:
//   • сумма = показанной игроку, иначе «список устарел», не покупаем ничего;
//   • золота не хватает — «Не хватает золота: нужно N, у тебя M» до вызова базы;
//     не хватило внутри (гонка) — база откатывает всю пачку, отказ той же формы;
//   • снятый/проданный лот — «не куплен», остальные покупаются;
//   • повтор той же пачки (тот же opId) — купленное «уже твоё», без списания.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { goldShortError } from "./chips-market-gold";

export const MARKET_BATCH_MAX = 500;

export type BatchLotResult =
  | { id: string; status: "bought"; price: number }
  | { id: string; status: "mine"; price: number }
  | { id: string; status: "failed"; reason: string };

export const buyMarketListings = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        listingIds: z.array(z.string().min(1).max(64)).min(1).max(MARKET_BATCH_MAX),
        /** Сумма, которую игрок видел в подтверждении. */
        expectedTotal: z.number().nonnegative(),
        /** Один на нажатие: повтор той же пачки второй раз не спишет. */
        opId: z.string().min(8).max(40),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { getCurrentWallet } = await import("../auth");
    const { assertNotMaintenance } = await import("../maintenance");
    const { moneyGate } = await import("../rateGate");
    const { accountOf } = await import("./user-shared");
    const { goldOf } = await import("./gold-move");
    const { marketLockedFor, MARKET_LOCKED } = await import("./chips-market-lock");
    const { marketBuyRpc } = await import("./market-buy-rpc");

    const buyer = getCurrentWallet();
    if (!buyer) throw new Error("Подключи кошелёк");
    assertNotMaintenance(buyer);
    await moneyGate("market-batch", buyer);
    if (await marketLockedFor(buyer)) throw new Error(MARKET_LOCKED);

    const ids = [...new Set(data.listingIds)];
    const account = await accountOf(buyer);
    await (await import("./debt/debt-read")).assertNoDebt(account);
    // Нехватка — до любых движений.
    const have = await goldOf(account);
    if (data.expectedTotal > have + 1e-9) throw goldShortError(data.expectedTotal, have);

    const r = await marketBuyRpc({ account, wallet: buyer, ids, expected: data.expectedTotal, op: data.opId });

    const order = new Map(ids.map((id, i) => [id, i]));
    const results: BatchLotResult[] = [
      ...r.bought.map((b) => ({ id: b.id, status: "bought" as const, price: Number(b.price) })),
      ...r.mine.map((b) => ({ id: b.id, status: "mine" as const, price: Number(b.price) })),
      ...r.failed.map((b) => ({ id: b.id, status: "failed" as const, reason: b.reason })),
    ].sort((a, b) => order.get(a.id)! - order.get(b.id)!);
    return { results, spent: Math.round(Number(r.spent) * 100) / 100 };
  });
