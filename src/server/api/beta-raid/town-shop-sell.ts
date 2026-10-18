// Игрок продаёт лавке города: отдаёт товар, получает золото по кривой ратуши. Золото —
// из ниоткуда, кассы у ратуши нет (владелец, 16.10.2026: «золото из ниоткуда для
// торговли — норма»). Порядок — как у покупки (town-shop-common).
import { credit, spend } from "./market-money";
import { goodAsPrice } from "./market-sell-good";
import { noteTownTrade } from "./econ/trade-hooks";
import { publishRaid } from "../../raidLive";
import { moveStock, readTownStock, type StockMove } from "./town-stock";
import { setStarving, townFed } from "./town-state";
import { isUpkeep } from "@/lib/townConfig";
import { listingUnits, quoteSell } from "@/lib/townPricing";
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

/** Игрок ПРОДАЁТ лавке города: отдаёт товар, получает золото по кривой. */
export async function citySell(t: Trade & { pick?: { templateId: string } }) {
  const line = lineOf(t);
  const units = listingUnits(t.item) * t.qty;
  const expect = t.expect as number;
  const { town } = t.city;
  const ref = t.payRef;

  // Цена хуже показанной — отказ ДО того, как у игрока что-то взяли.
  const check = (stock: number) => {
    const q = quoteSell(line.curve, stock, units);
    if (!q.ok) throw new Error(q.reason);
    if (q.total + EXPECT_EPS < expect) throw new Error("market.price_changed");
    return q.total;
  };
  check(line.stock);

  const good = goodAsPrice(t.item);
  const receipt = await spend(t.wallet, t.account, good.res, good.token, units, ref, {
    artTemplateId: t.pick?.templateId ?? null,
  });
  const returnGood = () => giveBack(t, "sell", good.res, good.token, units, ref, receipt);

  let mv: StockMove | null = null;
  let pay = 0;
  try {
    for (let i = 1; i <= ATTEMPTS && !mv; i++) {
      const stock = i === 1 ? line.stock : await stockNow(t, line);
      pay = check(stock);
      mv = await moveStock(town, line.good.id, `${ref}:stock`, { kind: "put", units, at: stock });
    }
    if (!mv) throw new Error("market.price_changed");
  } catch (e) {
    await returnGood();
    throw e;
  }

  const undoStock = () =>
    moveStock(town, line.good.id, `${ref}:stock:undo`, { kind: "undo", delta: -units }).catch(
      warn("возврат склада", ref),
    );
  try {
    await credit(t.wallet, t.account, GOLD, null, pay, `${ref}:pay`);
  } catch (e) {
    await returnGood();
    await undoStock();
    throw e;
  }

  // Город голодал, а привезли еду — проверяем, не наелся ли он до порога.
  let fedNow = false;
  if (t.city.starving && isUpkeep(line.good)) {
    fedNow = townFed(t.city.cfg, await readTownStock(town).catch(() => ({})));
    if (fedNow) await setStarving(town, false).catch(warn("снятие голода", ref));
  }

  void noteTownTrade({
    good: line.good,
    account: t.account,
    mapId: t.mapId,
    q: t.item.q,
    r: t.item.r,
    side: "sell",
    qty: units,
    unit: pay / units,
    total: pay,
    ref,
    name: t.item.name,
  });
  // Голод снят — открываются все постройки города: перечитать все окна.
  publishRaid({
    mapId: t.mapId,
    type: "built",
    cells: fedNow ? [] : [`${t.item.q},${t.item.r}`, `${town.q},${town.r}`],
  });
  return { ok: true as const, sold: t.qty, name: t.item.name };
}
