// Сделка в лавке города: цена по кривой ратуши, деньги/товар игрока, склад.
//
// ПОРЯДОК — против «фантомного» склада: сдвинь склад раньше цены и оплаты, и на
// миг отката чужие сделки видят запас, которого нет (проваленная покупка опускает
// склад — параллельная продажа идёт дороже). Поэтому:
//   1) цена — от прочитанного запаса; хуже показанной игроку (expect) — отказ
//      ДО любых движений;
//   2) сначала забираем у игрока (золото за покупку, товар за продажу);
//   3) склад двигаем, только если он РОВНО тот, по которому считали цену (at),
//      и не ниже НЗ; сдвинулся — вернуть взятое и пересчитать
//      (до трёх раз), цена ушла хуже показанной — отказ;
//   4) товар/выплата; сбой — откат всего выше.
// Склад не сдвигает сделка, которая сорвётся по вине игрока. Валюта — золото.
import { deliverGood, type DeliveryTarget } from "./market-deliver";
import { noteTownTrade } from "./econ/trade-hooks";
import { publishRaid } from "../../raidLive";
import { moveStock, type StockMove } from "./town-stock";
import { listingUnits, quoteBuy } from "@/lib/townPricing";
import { spend } from "./market-money";
import {
  ATTEMPTS,
  EXPECT_EPS,
  GOLD,
  giveBack,
  lineOf,
  stockNow,
  warn,
  type Trade,
} from "./town-shop-common";

export { citySell } from "./town-shop-sell";

/** Игрок ПОКУПАЕТ в лавке города. */
export async function cityBuy(t: Trade) {
  const line = lineOf(t);
  const units = listingUnits(t.item) * t.qty;
  const expect = t.expect as number;
  const { town } = t.city;
  const ref = t.payRef;

  let mv: StockMove | null = null;
  let paid = 0;
  let payRef = "";
  for (let i = 1; i <= ATTEMPTS && !mv; i++) {
    const stock = i === 1 ? line.stock : await stockNow(t, line);
    const q = quoteBuy(line.curve, stock, units);
    if (!q.ok) throw new Error(q.reason);
    if (q.total > expect + EXPECT_EPS) throw new Error("market.price_changed");
    payRef = `${ref}:p${i}`;
    await spend(t.wallet, t.account, GOLD, null, q.total, payRef);
    try {
      mv = await moveStock(town, line.good.id, `${ref}:stock`, {
        kind: "take",
        units,
        floor: line.curve.reserve,
        at: stock,
      });
    } catch (e) {
      await giveBack(t, "buy", GOLD, null, q.total, payRef);
      throw e;
    }
    if (mv) paid = q.total;
    else await giveBack(t, "buy", GOLD, null, q.total, payRef);
  }
  if (!mv) throw new Error("market.price_changed");
  const undoStock = (tag: string, n: number) =>
    moveStock(town, line.good.id, `${ref}:stock:${tag}`, { kind: "undo", delta: n }).catch(
      warn("возврат склада", ref),
    );

  let delivered = 0;
  let delivery: DeliveryTarget;
  try {
    const res = await deliverGood({
      wallet: t.wallet,
      account: t.account,
      item: t.item,
      qty: t.qty,
      payRef: ref,
      nonce: t.nonce,
    });
    delivered = res.delivered;
    delivery = res.target;
  } catch (e) {
    await giveBack(t, "buy", GOLD, null, paid, payRef);
    await undoStock("undo", units);
    throw e;
  }

  // Паки выдаются поштучно: недоданное — назад на склад, деньги — разницей
  // между ценой всего и ценой реально выданного (оно снято с верха склада).
  const per = listingUnits(t.item);
  const got = delivered < t.qty ? quoteBuy(line.curve, mv.before, delivered * per) : null;
  const kept = got ? (got.ok ? got.total : 0) : paid;
  if (delivered < t.qty) {
    await giveBack(t, "buy", GOLD, null, Math.max(0, paid - kept), `${payRef}:part`);
    await undoStock("undoPart", (t.qty - delivered) * per);
  }

  if (delivered > 0) {
    void noteTownTrade({
      good: line.good,
      account: t.account,
      mapId: t.mapId,
      q: t.item.q,
      r: t.item.r,
      side: "buy",
      qty: delivered * per,
      unit: kept / (delivered * per),
      total: kept,
      ref,
      name: t.item.name,
    });
  }
  publishRaid({
    mapId: t.mapId,
    type: "built",
    cells: [`${t.item.q},${t.item.r}`, `${town.q},${town.r}`],
  });
  return {
    ok: true as const,
    name: t.item.name,
    qty: delivered,
    delivery,
    toAccount: delivery === "account",
  };
}
