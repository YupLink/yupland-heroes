// Журнал сделок: выпил/съел товар-буст из рюкзака (зелье, рыба, еда) — строка
// «use» с источником 'drink' (12.10.2026, турнир рыбаков). Нужна турнирам:
// «Зелья скорости» считают выпитое своё (lib/tournament/pieceFlow), а «Продажа
// рыбы» и «Золото» видят, что штуки ушли со счёта и продать их уже нельзя.
//
// Ключ товара — по имени из справочника, как у стека рюкзака (stackItemKey):
// под ним зелье и куплено в маркете, и лежит на полках. Ключ повтора — аккаунт
// и ключ нажатия: повтор моста строку не задвоит. Best-effort, как весь журнал:
// ничего не бросает, буст не ломает.
import { goodKey } from "@/server/api/beta-raid/admin-economy-keys";
import { noteTrade, type TradeNote } from "@/server/api/beta-raid/econ/trade-journal";

/** Строка «выпил»: кто, что (имя товара), сколько, ключ нажатия. null — товара без имени. */
export function drinkTrade(o: {
  account: string;
  name: string;
  qty: number;
  op: string;
}): TradeNote | null {
  const itemKey = goodKey("custom", null, o.name);
  if (!itemKey) return null;
  return {
    accountId: o.account,
    counterparty: "sink",
    source: "drink",
    side: "use",
    itemKey,
    itemName: o.name,
    qty: o.qty,
    ref: `drink:${o.account}:${o.op}`,
  };
}

/** Выпил qty штук своего товара canon (cst_…). Никогда не бросает. */
export async function noteDrink(o: {
  wallet: string;
  canon: string | null;
  qty: number;
  op: string;
}): Promise<void> {
  try {
    const [{ raidOwner }, { canonCustomMeta }] = await Promise.all([
      import("@/server/api/beta-raid/owner"),
      import("@/server/api/beta-raid/item-alias"),
    ]);
    const [account, meta] = await Promise.all([raidOwner(o.wallet), canonCustomMeta(o.canon)]);
    const row =
      account && meta ? drinkTrade({ account, name: meta.name, qty: o.qty, op: o.op }) : null;
    if (row) await noteTrade(row);
  } catch (e) {
    console.warn("trade-journal", "drink", e instanceof Error ? e.message : String(e));
  }
}
