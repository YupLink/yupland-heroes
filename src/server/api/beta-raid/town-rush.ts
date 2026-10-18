// Особый спрос (владелец, 09.10.2026): с какого момента товар лежит на НЗ и ниже.
//
// Отдельной отметки не храним — считаем по журналу склада raid_town_stock_move:
// последнее движение, после которого запас был ВЫШЕ НЗ, и первое движение после
// него — момент, когда запас опустился до НЗ. Так время точное (сделка, суточный
// тик), а правка НЗ в пульте сразу меряется по новой границе. Движений нет —
// время последней записи склада.
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import type { TownKey } from "./town-stock";

const num = (x: number): string => (Number.isFinite(x) ? x : 0).toFixed(8);
const EPS = "0.00000100";

/** good_id → с какого момента запас на НЗ и ниже (null — выше НЗ). */
export async function readLowSince(
  town: TownKey,
  reserves: Record<string, number>,
): Promise<Record<string, string | null>> {
  const ids = Object.keys(reserves);
  if (ids.length === 0) return {};
  const at = (a: string) =>
    `${a}.map_id = ${sqlStr(town.mapId)} AND ${a}.q = ${Math.trunc(town.q)} AND ${a}.r = ${Math.trunc(town.r)}`;
  const values = ids.map((id) => `(${sqlStr(id)}, ${num(reserves[id])}::numeric)`).join(", ");
  const rows = (await mcpExec(
    `WITH lim(good_id, reserve) AS (VALUES ${values})
     SELECT lim.good_id,
            CASE WHEN s.amount <= lim.reserve + ${EPS} THEN COALESCE(
              (SELECT min(m.created_at) FROM yuplink.raid_town_stock_move m
                WHERE ${at("m")} AND m.good_id = lim.good_id
                  AND m.created_at > COALESCE(
                    (SELECT h.created_at FROM yuplink.raid_town_stock_move h
                      WHERE ${at("h")} AND h.good_id = lim.good_id AND h.after > lim.reserve + ${EPS}
                      ORDER BY h.created_at DESC LIMIT 1),
                    '-infinity'::timestamptz)),
              s.updated_at) END AS low_since
       FROM lim JOIN yuplink.raid_town_stock s ON ${at("s")} AND s.good_id = lim.good_id;`,
    { wrapJson: true },
  )) as Array<{ good_id: string; low_since: string | null }>;
  const out: Record<string, string | null> = {};
  for (const r of rows ?? []) out[String(r.good_id)] = r.low_since ?? null;
  return out;
}
