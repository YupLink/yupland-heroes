// Четыре эвристики лазеек — чистые функции над готовыми данными. Имена
// игроков подставляет вызывающий; здесь только числа, порог и подпись.
import type { ChainRow, DeltaRow, LoopholeRow } from "@/lib/econ/types";
import type { EnergyRow, ShelfRow } from "./loopholes-sql";

/** Подарков энергии за окно больше этого — смотрим, чем он живёт. */
export const ENERGY_MIN_GIFTED = 1000;
/** Подарки превышают всё честное (реген + покупки + награды) во столько раз. */
export const ENERGY_RATIO = 2;
export const REWARD_MIN_EARNED = 5000;
export const REWARD_SHARE = 0.95;
export const REWARD_SPENT_SHARE = 0.05;

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const r2 = (n: number): number => Math.round(n * 100) / 100;
const placeLabel = (p: ChainRow["buys"]["places"][number] | undefined): string =>
  p ? `${p.mapId ?? "?"} (${p.q ?? "?"},${p.r ?? "?"})` : "—";
const placeKey = (p: ChainRow["buys"]["places"][number]): string => `${p.mapId}|${p.q}|${p.r}`;

/** Купил дёшево в одном месте, продал дороже в другом. */
export function findArbitrage(chains: ChainRow[]): LoopholeRow[] {
  const out: LoopholeRow[] = [];
  for (const c of chains) {
    if (c.margin == null || c.margin <= 0) continue;
    const bought = new Set(c.buys.places.map(placeKey));
    if (!c.sells.places.some((p) => !bought.has(placeKey(p)))) continue;
    const buyAvg = r2(c.buys.total / Math.max(c.buys.qty, 1));
    const sellAvg = r2(c.sells.total / Math.max(c.sells.qty, 1));
    const from = placeLabel(c.buys.places[0]);
    const to = placeLabel(c.sells.places[0]);
    out.push({
      kind: "arbitrage",
      accountId: c.accountId,
      displayName: c.displayName,
      score: r2(c.margin),
      summary: `купил ${c.buys.qty} × ${c.itemName} по ${buyAvg} в ${from}, продал по ${sellAvg} в ${to}: навар ${r2(c.margin)} ${c.marginCur ?? ""}`,
      details: {
        itemName: c.itemName,
        buyQty: c.buys.qty,
        buyAvg,
        sellAvg,
        margin: r2(c.margin),
        from,
        to,
        // Числом — чтобы панель показала клетки кнопками «перейти».
        fromQ: c.buys.places[0]?.q ?? "",
        fromR: c.buys.places[0]?.r ?? "",
        toQ: c.sells.places[0]?.q ?? "",
        toR: c.sells.places[0]?.r ?? "",
      },
    });
  }
  return out;
}

/** Берёт с общих полок больше, чем кладёт. */
export function findShelfTakers(rows: ShelfRow[]): LoopholeRow[] {
  const byAcc = new Map<string, { took: number; put: number; items: Array<[string, number]> }>();
  for (const r of rows) {
    const a = byAcc.get(r.account_id) ?? { took: 0, put: 0, items: [] };
    a.took += num(r.took);
    a.put += num(r.put);
    if (num(r.took) > 0) a.items.push([r.item_name, num(r.took)]);
    byAcc.set(r.account_id, a);
  }
  const out: LoopholeRow[] = [];
  for (const [accountId, a] of byAcc) {
    const diff = a.took - a.put;
    if (diff <= 0) continue;
    const top = a.items.sort((x, y) => y[1] - x[1]).slice(0, 3);
    out.push({
      kind: "shelf_taker",
      accountId,
      displayName: "",
      score: r2(diff),
      summary: `взял с общих полок ${r2(a.took)}, положил ${r2(a.put)}; чаще всего: ${top.map(([n, q]) => `${n} ${r2(q)}`).join(", ") || "—"}`,
      details: {
        took: r2(a.took),
        put: r2(a.put),
        items: top.map(([n, q]) => `${n}: ${r2(q)}`).join("; "),
      },
    });
  }
  return out;
}

/** Сжёг энергии много больше, чем получил естественно и купил. */
export function findEnergyOutliers(rows: EnergyRow[]): LoopholeRow[] {
  // «Живёт на подарках»: энергия из админских начислений кратно больше, чем
  // реген, покупки и награды игры вместе. Сама трата — не лазейка: игрок мог
  // жечь запас прошлой недели; лазейка — откуда запас взялся.
  const out: LoopholeRow[] = [];
  for (const r of rows) {
    const gifted = num(r.gifted);
    const honest = num(r.regen) + num(r.bought) + num(r.rewards);
    if (gifted <= ENERGY_MIN_GIFTED || gifted <= ENERGY_RATIO * honest) continue;
    out.push({
      kind: "energy_outlier",
      accountId: r.account_id,
      displayName: "",
      score: r2(gifted - honest),
      summary: `подарками получил ${r2(gifted)} энергии при регене ${r2(num(r.regen))}, покупках ${r2(num(r.bought))} и наградах ${r2(num(r.rewards))}; сжёг ${r2(num(r.spend))}`,
      details: {
        gifted: r2(gifted),
        regen: r2(num(r.regen)),
        bought: r2(num(r.bought)),
        rewards: r2(num(r.rewards)),
        spend: r2(num(r.spend)),
      },
    });
  }
  return out;
}

/** Почти весь приход — награды и подарки, трат нет. По (игрок, валюта). */
export function findRewardHeavy(deltas: DeltaRow[]): LoopholeRow[] {
  const out: LoopholeRow[] = [];
  for (const d of deltas) {
    if (d.earned < REWARD_MIN_EARNED) continue;
    const rewardish = d.byKind
      .filter((k) => (k.group === "reward" || k.group === "gift") && k.amount > 0)
      .reduce((s, k) => s + k.amount, 0);
    const share = rewardish / d.earned;
    if (share < REWARD_SHARE || d.spent >= REWARD_SPENT_SHARE * d.earned) continue;
    out.push({
      kind: "reward_heavy",
      accountId: d.accountId,
      displayName: d.displayName,
      score: r2(d.earned),
      summary: `${d.currency}: пришло ${r2(d.earned)}, из них наград и подарков ${Math.round(share * 100)} %, потрачено ${r2(d.spent)}`,
      details: {
        currency: d.currency,
        earned: r2(d.earned),
        rewardShare: r2(share),
        spent: r2(d.spent),
      },
    });
  }
  return out;
}
