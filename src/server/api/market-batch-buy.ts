// Групповая покупка на Рынке замка («Выбрать» и «Откуп по флору»).
//
// Вся пачка — один вызов функции базы yuplink.market_buy_batch
// (migrations/market-batch-01.sql) в одной транзакции: для каждого лота то же,
// что у одиночной покупки (списание, комиссия, выплата продавцу, фишка на час
// отдыха, аудит). Владелец, 09.10.2026: «не даёт откупить больше 20 за раз +
// долгие отклики» — по одной фишке 100 штук шли десятки секунд, пачкой ~0,2 с.
//
// Контракт:
//   • сумма = показанной игроку, иначе «список устарел», не покупаем ничего;
//   • билетов не хватило на любом лоте — откатывается вся пачка;
//   • снятый/проданный лот — «не куплен», остальные покупаются;
//   • повтор той же пачки (тот же opId) — купленное «уже твоё», без списания.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const MARKET_BATCH_MAX = 500;

export type BatchLotResult =
  | { id: string; status: "bought"; price: number }
  | { id: string; status: "mine"; price: number }
  | { id: string; status: "failed"; reason: string };

type Bought = {
  id: string;
  price: number;
  chipId: string;
  seller: string;
  sellerWallet: string;
  sellerGot: number;
};
type BatchRow = {
  bought: Bought[];
  mine: Array<{ id: string; price: number }>;
  failed: Array<{ id: string; reason: string }>;
  spent: number;
};

function humanBatchError(msg: string): string {
  if (msg.includes("market_batch_stale"))
    return "Список на экране устарел — обнови рынок и выбери заново";
  const m = msg.match(/not_enough_tickets:([\d.]+):([\d.]+)/);
  if (m)
    return `Не хватает билетов: нужно ${Number(m[2]).toFixed(2)}, есть ${Number(m[1]).toFixed(2)}`;
  return msg || "Не удалось купить выбранные фишки";
}

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
    const { sb, MARKET_FEES_WALLET } = await import("../db/pg");
    const { accountOf, getSisterWallets } = await import("./user-shared");
    const { computeTickets, invalidateTicketsCache } = await import("./user");
    const { marketLockedFor } = await import("./chipsMarket");
    const { CHIP_REST_MS } = await import("../chipRest");
    const { noteChipMarketSale } = await import("./beta-raid/econ/trade-hooks");

    const buyer = getCurrentWallet();
    if (!buyer) throw new Error("Подключи кошелёк");
    assertNotMaintenance(buyer);
    await moneyGate("market-batch", buyer);
    if (await marketLockedFor(buyer))
      throw new Error("Купи хотя бы 1 пак в Магазине, чтобы открыть Маркет");

    const ids = [...new Set(data.listingIds)];
    const account = await accountOf(buyer);
    const have = (await computeTickets(buyer)).availableRaw;
    if (data.expectedTotal > have + 1e-9) {
      throw new Error(`Нужно ${data.expectedTotal.toFixed(2)} билетов, у тебя ${have.toFixed(2)}`);
    }

    const { data: rows, error } = await sb.rpc("market_buy_batch", {
      p_buyer_account: account,
      p_buyer_wallet: buyer,
      p_ids: ids,
      p_expected: data.expectedTotal,
      p_op: data.opId,
      p_fee_pct: 9,
      p_fees_wallet: MARKET_FEES_WALLET,
      p_rest_seconds: Math.round(CHIP_REST_MS / 1000),
    });
    if (error) throw new Error(humanBatchError(String(error.message ?? "")));
    const r = (rows as Array<{ result: BatchRow }> | null)?.[0]?.result;
    if (!r) throw new Error("Покупка не вернула итог — проверь рынок и баланс");

    // Журнал сделок и сброс кэша билетов — после покупки, на неё не влияют.
    for (const b of r.bought) {
      void noteChipMarketSale({
        listingId: b.id,
        chipId: b.chipId,
        buyer: account,
        seller: b.seller,
        price: Number(b.price),
        sellerGot: Number(b.sellerGot),
      });
    }
    const sellers = [...new Set(r.bought.map((b) => b.sellerWallet))];
    invalidateTicketsCache([...(await getSisterWallets(buyer)), ...sellers]);

    const order = new Map(ids.map((id, i) => [id, i]));
    const results: BatchLotResult[] = [
      ...r.bought.map((b) => ({ id: b.id, status: "bought" as const, price: Number(b.price) })),
      ...r.mine.map((b) => ({ id: b.id, status: "mine" as const, price: Number(b.price) })),
      ...r.failed.map((b) => ({ id: b.id, status: "failed" as const, reason: b.reason })),
    ].sort((a, b) => order.get(a.id)! - order.get(b.id)!);
    return { results, spent: Math.round(Number(r.spent) * 100) / 100 };
  });
