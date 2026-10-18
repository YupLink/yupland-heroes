// Строка рыбалки аккаунта и горизонт досчёта (ПРАВИЛА §8.35). Вынесено из
// fishing-settle: тем же разбором строки и тем же горизонтом пользуется хвост
// «Улова» на финише турнира (fishing-tail) — иначе очки хвоста и выданная
// потом рыба разошлись бы.
import { mcpExec } from "@/server/db/mcpClient";
import type { FishStop } from "@/lib/raid/fishing";
import { chanceAt, parseChanceSteps } from "@/lib/raid/fishChanceSteps";
import { readSql, type FishRow } from "@/server/api/beta-raid/fishing/fishing-sql";

const num = (v: unknown): number => Number(v) || 0;

/** Строка ответа rowsSql/readSql → FishRow (числа из текста, булевы строго). */
export function parseFishRow(r: FishRow): FishRow {
  return {
    ...r,
    q: num(r.q),
    r: num(r.r),
    tries: num(r.tries),
    planTries: Math.max(1, num(r.planTries)),
    chancePct: r.chancePct == null ? null : num(r.chancePct),
    chanceSteps: parseChanceSteps(r.chanceSteps),
    salt: typeof r.salt === "string" && r.salt ? r.salt : null,
    caught: num(r.caught),
    nextMs: num(r.nextMs),
    seenMs: num(r.seenMs),
    actedMs: r.actedMs == null ? null : num(r.actedMs),
    nowMs: num(r.nowMs),
    stopped: r.stopped === true,
    samePlace: r.samePlace === true,
    actedHere: r.actedHere === true,
    heroOn: r.heroOn === true,
  };
}

/** Рыбалка аккаунта с позицией героя; строки нет — null. Сбой базы — бросок. */
export async function readFishing(account: string): Promise<FishRow | null> {
  const rows = (await mcpExec(readSql(account), { wrapJson: true })) as FishRow[];
  const r = rows?.[0];
  return r ? parseFishRow(r) : null;
}

/** До какого мига герой точно рыбачил и чем рыбалка кончается (null — идёт). */
export type FishHorizon = {
  horizon: number;
  end: FishStop | null;
  /** Герой на месте и всё ещё выбранный. */
  valid: boolean;
};

/**
 * Горизонт досчёта:
 *  • было другое действие с той же версией позиции — до него, и конец;
 *  • сошёл с клетки или сменился герой — до последнего «видели на месте»;
 *  • иначе — до «сейчас» (часы базы в строке).
 * stop — конец, заказанный вызывающим («Хватит», смена инструмента).
 */
export function fishHorizon(row: FishRow, stop?: FishStop): FishHorizon {
  const valid = row.samePlace && row.heroOn;
  let horizon = row.nowMs;
  let end: FishStop | null = stop ?? null;
  if (row.actedMs !== null) {
    horizon = row.actedHere && row.heroOn ? row.actedMs : row.seenMs;
    end = "action";
  } else if (!valid) {
    horizon = row.seenMs;
    end = row.samePlace ? "hero" : "moved";
  }
  return { horizon: Math.min(horizon, row.nowMs), end, valid };
}

/**
 * Шанс попытки номер n заброса (с 1): по её мигу — первая в next_at минус шаг
 * за каждую отыгранную, дальше через шаг. До первой ступени — шанс заброса,
 * дальше — ступени (истёк бафф удачи, fishChanceSteps). У старых строк шанса
 * нет — настройка мира worldPct; ступеней нет — шанс один на весь заброс.
 */
export function tryChance(row: FishRow, worldPct: number, stepMs: number): (n: number) => number {
  const start = row.chancePct ?? worldPct;
  const steps = row.chanceSteps ?? [];
  if (steps.length === 0) return () => start;
  const first = row.nextMs - row.tries * stepMs;
  return (n) => chanceAt(start, steps, first + (n - 1) * stepMs);
}
