// Ингредиенты цены товара лавки (владелец, 04.11.2026; ПРАВИЛА §8.104 п. 1а):
// «возможность добавлять и другие ингредиенты — самому — до 5 точно, причём
// любых». Первая и вторая цена («алхимия») живут своими колонками, как и
// раньше; ещё до трёх — списком price_more. Платят ВСЕМИ разом.
//
// Только витрина покупки: в скупке цена — это выплата магазина, и пятью
// выплатами её никто не просил делать.
import type { MarketPriceResource } from "./marketItem";

/** Одна строка цены: чем и сколько платят за штуку. */
export type PriceLine = { resource: MarketPriceResource; token: string | null; amount: number };

/** Строк сверх первой и второй — не больше: всего ингредиентов до пяти. */
export const PRICE_MORE_MAX = 3;
export const PRICE_LINES_MAX = 2 + PRICE_MORE_MAX;

const RESOURCES: readonly MarketPriceResource[] = [
  "gold",
  "stone",
  "wood",
  "diamonds",
  "likes",
  "tickets",
  "energy",
  "token",
  "pack",
  "hero",
  "art",
  "boss",
  "custom",
];

/** Ресурс с символом: токен — по символу, предмет — по шаблону. */
export const needsPriceToken = (r: MarketPriceResource): boolean =>
  r === "token" || r === "pack" || r === "hero" || r === "art" || r === "boss" || r === "custom";

/** Список доп. ингредиентов из колонки/ввода; негодные строки отсеиваются. */
export function parsePriceMore(raw: unknown): PriceLine[] {
  let v: unknown = raw;
  if (typeof raw === "string") {
    try {
      v = JSON.parse(raw);
    } catch {
      v = null;
    }
  }
  const out: PriceLine[] = [];
  for (const x of Array.isArray(v) ? v : []) {
    const o = x && typeof x === "object" ? (x as Record<string, unknown>) : null;
    const resource = o?.resource as MarketPriceResource;
    if (!o || !RESOURCES.includes(resource)) continue;
    const amount = Number(o.amount);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const token = needsPriceToken(resource) && o.token ? String(o.token).slice(0, 80) : null;
    if (needsPriceToken(resource) && !token) continue;
    out.push({ resource, token, amount });
    if (out.length >= PRICE_MORE_MAX) break;
  }
  return out;
}

type Priced = {
  priceResource: MarketPriceResource;
  priceToken: string | null;
  priceAmount: number;
  price2Resource: MarketPriceResource | null;
  price2Token: string | null;
  price2Amount: number | null;
  priceMore?: readonly PriceLine[] | null;
};

/** Все строки цены позиции по порядку: первая, вторая (если есть), остальные. */
export function allPrices(it: Priced): PriceLine[] {
  const out: PriceLine[] = [
    { resource: it.priceResource, token: it.priceToken, amount: it.priceAmount },
  ];
  if (it.price2Resource && it.price2Amount) {
    out.push({ resource: it.price2Resource, token: it.price2Token, amount: it.price2Amount });
  }
  for (const l of it.priceMore ?? []) if (l.amount > 0) out.push(l);
  return out;
}
