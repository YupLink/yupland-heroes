// Выдача рецепта лавки (ПРАВИЛА §8.104): на каждую купленную штуку — свой
// бросок по шансам (lib/marketRecipe), выпавшее кладём той же выдачей, что и
// обычный товар (market-deliver) — ресурс на счёт, товар в рюкзак, арт/герой
// в инвентарь, пак в паки.
//
// Бросок — случайный на сервере (crypto), не от ключа запроса: повтор покупки
// с тем же ключом не должен давать «перебросить» неудачу.
//
// Контракт — как у паков: выдано не всё → delivered < qty, и покупка вернёт
// цену за невыданное. Ничего не выдано (и «Ничего» не выпало) → бросок, полный
// откат наверху. Место в рюкзаке под ЛЮБОЙ исход проверено ДО денег
// (market-buy-room), поэтому отказ выдачи не зависит от того, что выпало.
import { randomInt } from "node:crypto";
import type { MarketItem } from "@/lib/marketItem";
import { parseRecipe, pickRecipe, type RecipeOutcome, type RecipePrize } from "@/lib/marketRecipe";
import type { DeliveryResult } from "./market-deliver";

export type { RecipePrize } from "@/lib/marketRecipe";

type Opts = {
  wallet: string;
  account: string;
  item: MarketItem;
  qty: number;
  payRef: string;
  nonce: string;
};

/** Исход как обычный товар витрины — его и кладёт общая выдача. */
export function outcomeItem(item: MarketItem, o: RecipeOutcome): MarketItem {
  const res = o.kind === "resource";
  return {
    ...item,
    kind: o.kind as MarketItem["kind"],
    refId: o.refId,
    giveAmount: res ? o.amount : 1,
    giveToken: null,
    name: o.name,
    image: o.image,
    outcomes: null,
  };
}

/** Сколько раз выпала каждая строка за qty бросков. */
export function rollRecipe(list: readonly RecipeOutcome[], qty: number): Map<string, number> {
  const hits = new Map<string, number>();
  for (let i = 0; i < qty; i++) {
    const o = pickRecipe(list, randomInt(1000));
    if (o) hits.set(o.id, (hits.get(o.id) ?? 0) + 1);
  }
  return hits;
}

export async function deliverRecipe(
  o: Opts,
  give: (o: Opts) => Promise<DeliveryResult>,
): Promise<DeliveryResult & { prizes: RecipePrize[] }> {
  const list = parseRecipe(o.item.outcomes);
  if (!list.some((x) => x.kind !== "none")) throw new Error("market.give_failed");
  const hits = rollRecipe(list, o.qty);
  const prizes: RecipePrize[] = [];
  let delivered = 0;
  let target: DeliveryResult["target"] = "account";
  let firstErr: unknown = null;
  // «Ничего» — выдано сразу: игрок заплатил за бросок, и бросок состоялся.
  const none = list.filter((x) => x.kind === "none").reduce((n, x) => n + (hits.get(x.id) ?? 0), 0);
  if (none > 0) {
    delivered += none;
    prizes.push({ kind: "none", refId: null, name: "", image: null, count: none });
  }
  for (const [i, out] of list.entries()) {
    const n = hits.get(out.id) ?? 0;
    if (n === 0 || out.kind === "none") continue;
    const res = out.kind === "resource";
    try {
      const r = await give({
        ...o,
        item: outcomeItem(o.item, out),
        // Предметы — штуками: N за бросок × сколько раз выпало.
        qty: res ? n : n * out.amount,
        payRef: `${o.payRef}:o${i}`,
        nonce: `${o.nonce}o${i}`,
      });
      const got = res ? r.delivered : Math.floor(r.delivered / out.amount);
      delivered += got;
      target = r.target;
      const count = res ? got * out.amount : r.delivered;
      if (count > 0) {
        prizes.push({ kind: out.kind, refId: out.refId, name: out.name, image: out.image, count });
      }
    } catch (e) {
      // Этот приз не лёг — его штуки вернутся ценой; остальные выдаём дальше.
      firstErr ??= e;
    }
  }
  if (delivered === 0 && firstErr) throw firstErr;
  return { target, delivered, prizes };
}
