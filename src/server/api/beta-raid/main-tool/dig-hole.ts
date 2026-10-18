// Ямки от лопаты и мои бугорки — запись ямки и чтение для слоя мешочков
// (владелец, 02.10.2026; ПРАВИЛА §8.24 п. 6а, контракт — src/lib/digHole.ts).
//
// Ямка — только картинка на земле: ничего не держит и ни во что не вмешивается,
// поэтому пишется вслед за состоявшимся делом и без отката — сбой записи
// оставит клетку без ямки, а не сорвёт копание.
// Комментарии внутри SQL — только блочные.
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import { LOOT_BAG_SEE } from "@/lib/lootBag";
import { CHEST_MOUND_LEFT_MS } from "@/lib/plainChest";
import { DIG_HOLE_MINUTES } from "@/lib/digHole";
import { livePortion } from "@/server/api/beta-raid/loot-bag/bag-sql";
import {
  distSql,
  hiddenSql,
  lifeSql,
  msLeftSql,
  type Near,
} from "@/server/api/beta-raid/loot-bag/bag-read-sql";

type At = { mapId: string; q: number; r: number };

const LIFE = `interval '${DIG_HOLE_MINUTES} minutes'`;

/**
 * Ямка на клетке: новая или прежняя с часом заново. Тем же оператором уходят
 * просроченные ямки — кроме этой клетки (одну строку дважды в операторе не
 * трогают). Повтор моста безвреден: час просто начнётся на миг позже.
 */
export function holeMarkSql(o: At): string {
  const [map, q, r] = [sqlStr(o.mapId), Math.floor(o.q), Math.floor(o.r)];
  return `WITH gone AS (
       DELETE FROM yuplink.raid_dig_hole
        WHERE dug_at < now() - ${LIFE}
          AND NOT (map_id = ${map} AND q = ${q} AND r = ${r})
     )
     INSERT INTO yuplink.raid_dig_hole (map_id, q, r, dug_at)
     VALUES (${map}, ${q}, ${r}, now())
     ON CONFLICT (map_id, q, r) DO UPDATE SET dug_at = now();`;
}

/** Оставить ямку после состоявшегося «Копать» / «Выкопать». Не бросает. */
export async function markDigHole(o: At): Promise<void> {
  await mcpExec(holeMarkSql(o)).catch((e: unknown) => {
    console.warn("[dig-hole] ямка не записалась:", e instanceof Error ? e.message : e);
  });
}

/**
 * Ямки «второго обзора» — тот же круг, разведанное и купол, что у мешочков.
 * На клетке что-то стоит (мешочек с живой порцией или бугорок, сундук —
 * стоящий или закопанный), вырос декор или стоит постройка — ямки не видно.
 */
export function holesNearSql(o: Near): string {
  const d = LOOT_BAG_SEE;
  const acc = sqlStr(o.account);
  const on = (a: string) => `${a}.map_id = h.map_id AND ${a}.q = h.q AND ${a}.r = h.r`;
  return `SELECT h.q, h.r, ${msLeftSql(`h.dug_at + ${LIFE}`)} AS "leftMs"
       FROM yuplink.beta_raid_positions p
       JOIN yuplink.raid_dig_hole h
         ON h.map_id = COALESCE(p.map_id, ${sqlStr(o.activeMapId)})
        AND h.q BETWEEN p.q - ${d} AND p.q + ${d} AND h.r BETWEEN p.r - ${d} AND p.r + ${d}
       LEFT JOIN yuplink.raid_map_cells c ON ${on("c")}
      WHERE p.account_id = ${acc}
        AND h.dug_at > now() - ${LIFE}
        AND ${distSql("h")} <= ${d}
        AND c.decoration_id IS NULL
        AND c.building_id IS NULL
        AND NOT EXISTS (SELECT 1 FROM yuplink.raid_loot_bag b
                         WHERE ${on("b")}
                           AND EXISTS (SELECT 1 FROM yuplink.raid_loot_bag_item x
                                        WHERE x.bag_id = b.id AND ${livePortion("x")}))
        AND NOT EXISTS (SELECT 1 FROM yuplink.raid_plain_chest x WHERE ${on("x")})
        AND NOT EXISTS (SELECT 1 FROM yuplink.raid_magic_chest x WHERE ${on("x")})
        ${hiddenSql("h", o)}
      LIMIT 300`;
}

/**
 * Мои бугорки на карте героя — с любого расстояния: что закопал я сам
 * (buried_by), мешочки с живыми порциями и сундуки. Строки как у слоя
 * мешочков (id мешочка или «cm_q_r» сундука) — слой сводит их по id.
 */
export function myMoundsSql(o: Pick<Near, "account" | "activeMapId">): string {
  const acc = sqlStr(o.account);
  const map = `COALESCE(p.map_id, ${sqlStr(o.activeMapId)})`;
  const chest = (table: string) =>
    `SELECT 'cm_' || x.q || '_' || x.r AS id, x.q, x.r,
            ${CHEST_MOUND_LEFT_MS}::bigint AS "leftMs"
       FROM yuplink.beta_raid_positions p
       JOIN ${table} x ON x.map_id = ${map} AND x.buried_by = ${acc} AND x.buried_at IS NOT NULL
      WHERE p.account_id = ${acc}`;
  return `SELECT m.id, m.q, m.r, true AS buried, m."leftMs" FROM (
       SELECT b.id, b.q, b.r, ${msLeftSql("life.last")} AS "leftMs"
         FROM yuplink.beta_raid_positions p
         JOIN yuplink.raid_loot_bag b
           ON b.map_id = ${map} AND b.buried_by = ${acc} AND b.buried_at IS NOT NULL
         ${lifeSql("b")}
        WHERE p.account_id = ${acc} AND life.last IS NOT NULL
       UNION ALL ${chest("yuplink.raid_plain_chest")}
       UNION ALL ${chest("yuplink.raid_magic_chest")}
     ) m
     LIMIT 200`;
}
