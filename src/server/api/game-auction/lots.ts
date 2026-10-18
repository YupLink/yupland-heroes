// Расчёт для аукциона на N лотов: проходная ставка и минимум для зрителя.
// ЗЕРКАЛО правила из SQL-функции auction_place_bid (bid-fn.ts) — менять вместе,
// иначе экран покажет один минимум, а база примет другой.
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";

export type ActiveBid = { account_id: string; amount: number };

/** Ставки, занимающие лоты, по аукционам — в порядке «сумма ↓, раньше — выше». */
export async function activeBidsFor(ids: string[]): Promise<Map<string, ActiveBid[]>> {
  const out = new Map<string, ActiveBid[]>();
  if (ids.length === 0) return out;
  const rows = (await mcpExec(
    `SELECT auction_id, account_id, amount FROM yuplink.auction_bid
      WHERE active AND auction_id IN (${ids.map(sqlStr).join(",")})
      ORDER BY auction_id, amount DESC, created_at ASC, id ASC;`,
    { wrapJson: true },
  ).catch(() => [])) as Array<ActiveBid & { auction_id: string }>;
  for (const r of rows ?? []) {
    const list = out.get(r.auction_id) ?? [];
    list.push({ account_id: r.account_id, amount: Number(r.amount) });
    out.set(r.auction_id, list);
  }
  return out;
}

/** ceil(x·(100+шаг)/100), строго больше x; без дробных хвостов float. */
export function stepUp(x: number, stepPct: number): number {
  const raised = Math.ceil((x * (100 + stepPct)) / 100 - 1e-9);
  return Math.max(raised, Math.floor(x) + 1);
}

/**
 * active — ставки, занимающие лоты, по убыванию суммы (при равенстве раньше —
 * выше). me — аккаунт зрителя (null — не вошёл).
 */
export function lotState(opts: {
  startPrice: number;
  stepPct: number;
  winners: number;
  active: ActiveBid[];
  me: string | null;
}) {
  const { startPrice, stepPct, winners, active, me } = opts;
  const mine = me ? (active.find((b) => b.account_id === me) ?? null) : null;
  const others = active.filter((b) => b.account_id !== me);
  let nextMin =
    others.length >= winners ? stepUp(Number(others[winners - 1].amount), stepPct) : startPrice;
  if (mine) nextMin = Math.max(nextMin, stepUp(Number(mine.amount), stepPct));
  return {
    nextMin,
    mine: mine ? Number(mine.amount) : null,
    taken: active.length,
    // Проходная: сумма, с которой сейчас занимают последний лот.
    passing: active.length >= winners ? Number(active[winners - 1].amount) : startPrice,
    top: active[0] ? Number(active[0].amount) : null,
  };
}
