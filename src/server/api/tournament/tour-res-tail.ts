// Финиш «Дерева» и «Камня»: добытое ВНУТРИ турнира, но не собранное к концу.
//
// Очко ложится по строке журнала (сбор шахты, «Забрать»), а окно подтяжки
// закрывается концом турнира. Часы шахты, отработанные до конца, и «Добыча»,
// поднятая до конца, но собранные позже, иначе пропали бы. На финише (турнир
// уже на выплате, конец наступил) досчитываем их очками — без зачисления
// ресурса: ресурс игрок соберёт сам, как всегда.
//  • Шахта — часы после последнего сбора ДО конца, отработанные в [порог,
//    конец], × выработка постройки. Последний сбор — по журналу до конца, а
//    не по raid_mine_state: сбор через секунду после конца уже сдвинул
//    claimed_hours, а в окно подтяжки не попал. Шахты, отбитые уже после
//    конца, находим по их строке cap в журнале.
//    Шахта — отрезок (аккаунт, карта, эпоха): перенос режимом бога меняет
//    клетку, а эпоху и уровень оставляет. Нижняя граница часов — последний
//    сбор отрезка на ЛЮБОЙ клетке (mineLastSql): собранное на старой клетке
//    (и после возврата на неё) второй раз не ляжет, а до порога игрока не
//    считается ничего. Клетка различает только живые шахты одного игрока с
//    одной эпохой до секунды (два отрезка начались в одну секунду): клетки
//    живых соседок из поиска исключены — их сборы чужие часы не срезают.
//    Строка после конца нужна, только если живой шахты с этим отрезком нет:
//    иначе шахта, собранная после конца на A и перенесённая на B, легла бы
//    дважды. Соседку, закрытую после конца при живой соседке, это теряет —
//    недосчёт, не пересчёт.
//    Шахта v2 (§8.59): эпоха — начало отрезка добычи (accrue_from), выход —
//    стандарт × режим, часы — не дальше поломки. Отрезок, закрытый уже после
//    конца (сбор, перехват, поломка, починка, смена режима), берём по первой
//    его строке после конца: её уровень — потолок часов, а выход — её delta
//    на её часы (режим отрезка мог смениться, в настройке клетки его нет).
//    Делитель этой delta — от уровня прошлого сбора на СВОЕЙ клетке, если он
//    ниже последнего на любой: соседка с той же эпохой, закрытая до конца,
//    из поиска не исключена, и её поздний сбор раздул бы выход (delta с
//    часами до порога легла бы на один час). Любая клетка сужает только
//    часы, своя — только выход: каждое сомнение — в сторону недосчёта. Цена:
//    перенос туда и обратно со сбором на чужой клетке даёт выход ниже
//    настоящего.
//    Хвост часа (…:tail) — доход в момент записи (его считает подтяжка), не
//    уровень часов: ни отрезок, ни границу по нему не ищем.
//  • «Добыча» — строки raid_reward этого ресурса, добытые в [порог, конец), без
//    начисления в журнале до конца. ref 'loot:<id строки>'.
// Сбор после конца в подтяжку не попадает (till = ends_at) — задвоения нет.
// Повтор финиша (тикер подхватывает зависшую выплату) даёт те же ref, и PK
// очка не засчитает их второй раз. ref шахты 'minetail:<карта>:<q>:<r>:
// <эпоха>:<аккаунт>' — клетка в нём меняется при переносе между прогонами,
// поэтому отрезок, у которого minetail уже есть на любой клетке, пропускаем.
// Ключ без клетки склеил бы соседок с одной эпохой.
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import { TOUR_RESOURCE } from "@/lib/tournament/metricSources";
import type { TourMetric } from "@/lib/tournament/types";
import { scoreSql } from "@/server/api/tournament/tour-sql";
import {
  mineHourAt,
  mineHoursSql,
  mineLastSql,
  minePrevSql,
  mineRefSql,
  thrSql,
} from "@/server/api/tournament/tour-res-sql";
import { breakAtSql } from "@/server/api/beta-raid/mine-v2-sql";

/** Число из building_config без риска уронить оператор кривым значением. */
const numSql = (txt: string): string =>
  `CASE WHEN ${txt} ~ '^[0-9]+([.][0-9]+)?$' THEN (${txt})::numeric END`;

/** Оператор досчёта несобранного; только турнир на выплате, конец наступил. */
export function resTailSql(id: string, resource: string): string {
  const res = sqlStr(resource);
  // Уровень прошлого сбора на своей клетке — для выхода отрезка после конца;
  // база ищет его, только дойдя до этой ветки CASE.
  const own = minePrevSql({
    acc: "pa.acc",
    map: "pa.map",
    q: "pa.q",
    r: "pa.r",
    ep: "pa.ep",
    before: "pe.ends_at",
  });
  const pre = `tw AS (
  SELECT t.id, t.started_at, t.ends_at FROM yuplink.tournament t
   WHERE t.id = ${sqlStr(id)} AND t.status = 'paying' AND t.started_at IS NOT NULL
     AND t.ends_at <= now()
),
pe AS (
  SELECT tw.id, tw.ends_at, e.account_id, ${thrSql("tw", "e")} AS thr
    FROM tw JOIN yuplink.tournament_entry e ON e.tournament_id = tw.id AND e.paid
),
done AS MATERIALIZED (
  SELECT m[1] AS map, m[2] AS ep, m[3] AS acc
    FROM tw JOIN yuplink.tournament_point t ON t.tournament_id = tw.id
   CROSS JOIN LATERAL regexp_match(t.ref, '^minetail:([^:]+):(?:-?[0-9]+:-?[0-9]+:)?([0-9]+):(.+)$') m
   WHERE left(t.ref, 9) = 'minetail:'
),
lv AS (
  SELECT s.map_id AS map, s.q, s.r, extract(epoch from COALESCE(s.accrue_from, s.captured_at))::bigint AS ep,
         s.owner_account AS acc, yuplink.raid_mine_mode_mult(s.mode) AS mult,
         CASE WHEN s.accrue_from IS NOT NULL THEN ${breakAtSql("s")} END AS brk
    FROM pe JOIN yuplink.raid_mine_state s
      ON s.owner_account = pe.account_id AND COALESCE(s.accrue_from, s.captured_at) < pe.ends_at
),
parts AS (
  SELECT 0 AS pri, lv.map, lv.q, lv.r, lv.ep, lv.acc, NULL::numeric AS n, NULL::numeric AS delta,
         lv.mult, lv.brk,
         ARRAY(SELECT o.q || ':' || o.r FROM lv o
                WHERE o.map = lv.map AND o.ep = lv.ep AND o.acc = lv.acc
                  AND (o.q, o.r) <> (lv.q, lv.r)) AS sib
    FROM lv
  UNION ALL
  (SELECT DISTINCT ON (mr.map, mr.ep, l.account_id) 1, mr.map, mr.q::int, mr.r::int, mr.ep,
          l.account_id, mr.n, l.delta, NULL::numeric, NULL::timestamptz, '{}'::text[]
     FROM pe JOIN yuplink.res_ledger l
       ON l.account_id = pe.account_id AND l.kind = 'mine' AND l.created_at >= pe.ends_at
     CROSS JOIN LATERAL (${mineRefSql("l.ref")}) mr
    WHERE NOT EXISTS (SELECT 1 FROM lv WHERE lv.map = mr.map AND lv.ep = mr.ep AND lv.acc = l.account_id)
    ORDER BY mr.map, mr.ep, l.account_id, l.created_at)
),
mt AS (
  SELECT pe.id AS tournament_id,
         'minetail:' || pa.map || ':' || pa.q || ':' || pa.r || ':' || pa.ep || ':' || pa.acc AS ref,
         pa.acc AS account_id, h.cnt * y.yld AS qty, ${mineHourAt("pa.ep", "pv.pn", "h.hi")} AS at
    FROM parts pa
    JOIN pe ON pe.account_id = pa.acc
    JOIN yuplink.raid_map_cells c ON c.map_id = pa.map AND c.q = pa.q AND c.r = pa.r
    LEFT JOIN LATERAL (${mineLastSql({ acc: "pa.acc", map: "pa.map", ep: "pa.ep", before: "pe.ends_at", skip: "pa.sib" })}) pl ON true
    CROSS JOIN LATERAL (
      SELECT COALESCE(pl.pn, 0) AS pn, pl.lat,
             (pa.pri = 1 OR pa.brk IS NOT NULL)
               AND yuplink.raid_mine_v2_std(c.building_config) IS NOT NULL AS is_v2
      OFFSET 0
    ) pv
    CROSS JOIN LATERAL (
      SELECT CASE WHEN NOT pv.is_v2 THEN ${numSql("c.building_config->>'yield'")}
                  WHEN pa.pri = 0 THEN yuplink.raid_mine_v2_std(c.building_config) * pa.mult
                  WHEN pa.n > pv.pn THEN round(pa.delta / (pa.n - LEAST(pv.pn, ${own})), 4) END AS yld
      OFFSET 0
    ) y
    CROSS JOIN LATERAL (${mineHoursSql({
      ep: "pa.ep",
      pn: "pv.pn",
      thr: "GREATEST(pe.thr, pv.lat)",
      ends: "LEAST(pe.ends_at, CASE WHEN pv.is_v2 THEN pa.brk END)",
      top: "CASE WHEN pv.is_v2 THEN pa.n - pv.pn END",
    })} OFFSET 0) h
   WHERE c.building_config->>'resource' = ${res} AND y.yld > 0 AND h.cnt > 0
     AND NOT EXISTS (SELECT 1 FROM done d
                      WHERE d.map = pa.map AND d.ep = pa.ep::text AND d.acc = pa.acc)
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
