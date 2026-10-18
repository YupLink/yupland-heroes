// Финиш «Дерева» и «Камня»: добытое ВНУТРИ турнира, но не собранное к концу.
//
// Очко ложится по строке журнала (сбор шахты, «Забрать»), а окно подтяжки
// закрывается концом турнира. Часы шахты, отработанные до конца, и «Добыча»,
// поднятая до конца, но собранные позже, иначе пропали бы. На финише (турнир
// уже на выплате, конец наступил) досчитываем их очками — без зачисления
// ресурса: ресурс игрок соберёт сам, как всегда.
//  • Шахта — часы после последнего сбора ДО конца, отработанные в [порог,
//    конец], × выработка постройки. Уровень последнего сбора — по журналу до
//    конца, а не по raid_mine_state: сбор через секунду после конца уже сдвинул
//    claimed_hours, а в окно подтяжки не попал. Шахты, отбитые уже после конца,
//    находим по их строке cap в журнале. ref 'minetail:<карта>:<эпоха>:<аккаунт>'.
//  • «Добыча» — строки raid_reward этого ресурса, добытые в [порог, конец), без
//    начисления в журнале до конца. ref 'loot:<id строки>'.
// Сбор после конца в подтяжку не попадает (till = ends_at) — задвоения нет.
// Повтор финиша даёт те же ref, и PK очка не засчитает их второй раз.
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import { TOUR_RESOURCE } from "@/lib/tournament/metricSources";
import type { TourMetric } from "@/lib/tournament/types";
import { scoreSql } from "@/server/api/tournament/tour-sql";
import {
  mineHourAt,
  mineHoursSql,
  minePrevSql,
  thrSql,
} from "@/server/api/tournament/tour-res-sql";

/** Начало ref сбора шахты: [1] карта, [2] q, [3] r, [4] эпоха захвата. */
const MINE_PART_RE = "^mine:([^:]+):(-?[0-9]+):(-?[0-9]+):([0-9]+):";

/** Число из building_config без риска уронить оператор кривым значением. */
const numSql = (txt: string): string =>
  `CASE WHEN ${txt} ~ '^[0-9]+([.][0-9]+)?$' THEN (${txt})::numeric END`;

/** Оператор досчёта несобранного; только турнир на выплате, конец наступил. */
export function resTailSql(id: string, resource: string): string {
  const res = sqlStr(resource);
  const pre = `tw AS (
  SELECT t.id, t.started_at, t.ends_at FROM yuplink.tournament t
   WHERE t.id = ${sqlStr(id)} AND t.status = 'paying' AND t.started_at IS NOT NULL
     AND t.ends_at <= now()
),
pe AS (
  SELECT tw.id, tw.ends_at, e.account_id, ${thrSql("tw", "e")} AS thr
    FROM tw JOIN yuplink.tournament_entry e ON e.tournament_id = tw.id AND e.paid
),
parts AS (
  SELECT DISTINCT ON (x.map, x.ep, x.acc) x.* FROM (
    SELECT 0 AS pri, s.map_id AS map, s.q, s.r,
           extract(epoch from s.captured_at)::bigint AS ep, s.owner_account AS acc
      FROM pe JOIN yuplink.raid_mine_state s
        ON s.owner_account = pe.account_id AND s.captured_at < pe.ends_at
    UNION ALL
    SELECT 1, lr.m[1], lr.m[2]::int, lr.m[3]::int, lr.m[4]::bigint, lr.account_id
      FROM (SELECT l.account_id, regexp_match(l.ref, ${sqlStr(MINE_PART_RE)}) AS m
              FROM pe JOIN yuplink.res_ledger l
                ON l.account_id = pe.account_id AND l.kind = 'mine' AND l.created_at >= pe.ends_at) lr
     WHERE lr.m IS NOT NULL
  ) x ORDER BY x.map, x.ep, x.acc, x.pri
),
mt AS (
  SELECT pe.id AS tournament_id, 'minetail:' || pa.map || ':' || pa.ep || ':' || pa.acc AS ref,
         pa.acc AS account_id, h.cnt * y.yld AS qty, ${mineHourAt("pa.ep", "pv.pn", "h.hi")} AS at
    FROM parts pa
    JOIN pe ON pe.account_id = pa.acc
    JOIN yuplink.raid_map_cells c ON c.map_id = pa.map AND c.q = pa.q AND c.r = pa.r
    CROSS JOIN LATERAL (SELECT ${numSql("c.building_config->>'yield'")} AS yld) y
    CROSS JOIN LATERAL (
      SELECT ${minePrevSql({ acc: "pa.acc", map: "pa.map", ep: "pa.ep", before: "pe.ends_at" })} AS pn
    ) pv
    CROSS JOIN LATERAL (${mineHoursSql({ ep: "pa.ep", pn: "pv.pn", thr: "pe.thr", ends: "pe.ends_at" })}) h
   WHERE c.building_config->>'resource' = ${res} AND y.yld > 0 AND h.cnt > 0
),
lt AS (
  SELECT pe.id AS tournament_id, 'loot:' || rr.id AS ref, rr.account_id,
         rr.reward_amount::numeric AS qty, rr.created_at AS at
    FROM pe JOIN yuplink.raid_reward rr ON rr.account_id = pe.account_id
   WHERE rr.reward_kind = 'resource' AND rr.pack_id = ${res} AND rr.reward_amount > 0
     AND rr.created_at >= pe.thr AND rr.created_at < pe.ends_at
     AND NOT EXISTS (
       SELECT 1 FROM yuplink.res_ledger l
        WHERE l.kind IN ('mine', 'mob', 'reward') AND l.created_at < pe.ends_at
          AND l.ref = 'raidtour:' || rr.location_id || ':c' || rr.cycle_no || ':' || rr.id)
)`;
  return scoreSql({
    pre,
    src: `SELECT tournament_id, ref, account_id, qty, at FROM mt
          UNION ALL SELECT tournament_id, ref, account_id, qty, at FROM lt`,
  });
}

/** Досчитать несобранное ресурсной категории перед итогами (финиш). */
export async function settleResourceTail(t: { id: string; metric: TourMetric }): Promise<void> {
  const resource = TOUR_RESOURCE[t.metric];
  if (!resource) return;
  await mcpExec(resTailSql(t.id, resource));
}
