// «Дерево» и «Камень» из журнала ресурсов: только добытое ВНУТРИ турнира.
//
// Слово владельца (06.10.2026): «выработка шахт — не засчитывать накопленное до
// начала турнира»; «Добыча», поднятая до записи, — тоже нет. Порог игрока —
// max(старт турнира, его запись): всё, что выработано или добыто раньше, не
// засчитывается и потом, когда его соберут.
//
//  • Шахта (ref mine:<карта>:<q>:<r>:<эпоха захвата>:[cap]<N>). Шахта копит
//    ЦЕЛЫЕ часы от захвата (raid_mine_claim): час j после прошлого сбора на
//    уровне pn «капает» в момент эпоха + (pn + j) ч. Строка сбора несёт часы
//    (pn, N] разом — засчитываем только те, что отработаны в [порог, конец],
//    той же долей от delta. pn — уровень прошлого сбора по (карта, эпоха,
//    аккаунт), а не по клетке: перенос в режиме бога двигает шахту вместе с
//    часами. Хвост прежнему владельцу при захвате (cap) — та же формула.
//  • «Добыча» (ref raidtour:<локация>:c<цикл>:<id raid_reward>): момент — когда
//    добыто (raid_reward.created_at), а не когда нажали «Забрать».
//  • Прочие доходы (моб, грядка) — момент строки журнала, как раньше.
import { sqlStr } from "@/server/api/raid-shared";

/** ref сбора шахты: [1] карта, [2] эпоха захвата (сек), [3] уровень часов N. */
export const MINE_REF_RE =
  "^mine:([^:]+):-?[0-9]+:-?[0-9]+:([0-9]+):(?:cap)?([0-9]+(?:[.][0-9]+)?)$";

/** Разбор ref сбора шахты (LATERAL): map, ep, n — или ни одной строки. */
export const mineRefSql = (ref: string): string =>
  `SELECT x.m[1] AS map, x.m[2]::bigint AS ep, x.m[3]::numeric AS n
     FROM (SELECT regexp_match(${ref}, ${sqlStr(MINE_REF_RE)}) AS m) x
    WHERE x.m IS NOT NULL`;

/**
 * Уровень часов прошлого сбора той же шахты (карта + эпоха) у аккаунта до
 * момента before; сборов не было — 0. Ищем по индексу (аккаунт, время) и не
 * раньше захвата (эпоха округлена до секунды — с запасом): без нижней границы
 * полная подтяжка дерева шла 16 с, с ней — 3 с.
 */
export const minePrevSql = (o: { acc: string; map: string; ep: string; before: string }): string =>
  `COALESCE((SELECT substring(split_part(p.ref, ':', 6) from '^(?:cap)?([0-9]+(?:[.][0-9]+)?)$')::numeric
       FROM yuplink.res_ledger p
      WHERE p.account_id = ${o.acc} AND p.kind = 'mine'
        AND p.created_at < ${o.before} AND p.created_at >= to_timestamp(${o.ep} - 1)
        AND left(p.ref, 5) = 'mine:' AND split_part(p.ref, ':', 2) = ${o.map}
        AND split_part(p.ref, ':', 5) = (${o.ep})::text
      ORDER BY p.created_at DESC LIMIT 1), 0)`;

/**
 * Сколько часов после уровня pn отработано в [thr, ends] (LATERAL): cnt — их
 * число, hi — номер последнего (час hi «капнул» в ep + (pn + hi) ч). top —
 * сколько часов несёт строка сбора; без него — хвост, не собранный к концу.
 */
export function mineHoursSql(o: {
  ep: string;
  pn: string;
  thr: string;
  ends: string;
  top?: string;
}): string {
  const at = (ts: string) => `(extract(epoch from ${ts}) - ${o.ep}) / 3600.0 - ${o.pn}`;
  const hi = o.top ? `LEAST(${o.top}, floor(${at(o.ends)}))` : `floor(${at(o.ends)})`;
  return `SELECT GREATEST(0, j.hi - j.lo + 1) AS cnt, j.hi
     FROM (SELECT GREATEST(1, ceil(${at(o.thr)})) AS lo, ${hi} AS hi) j`;
}

/** Момент, когда «капнул» час hi после уровня pn. */
export const mineHourAt = (ep: string, pn: string, hi: string): string =>
  `to_timestamp(${ep} + (${pn} + ${hi}) * 3600)`;

/** Порог игрока: старт турнира или запись — что позже. */
export const thrSql = (w: string, e: string): string => `GREATEST(${w}.started_at, ${e}.joined_at)`;

/**
 * SELECT очков ресурса из окна журнала (tournament_id, ref, account_id, qty,
 * at). w — окно (id, started_at, ends_at, since, till); income — условие
 * «доход, не покупка» по строке l. Только записавшиеся (paid): порог нужен
 * каждому свой, а чужие строки scoreSql всё равно отбросит.
 */
export function resSrcSql(resource: string, income: string): string {
  const thr = thrSql("w", "e");
  const hrs = "(mr.n - mp.pn)";
  return `SELECT w.id AS tournament_id, 'res:' || l.id AS ref, l.account_id,
            (CASE WHEN mr.ep IS NULL THEN l.delta
                  WHEN ${hrs} > 0 THEN round(l.delta * mh.cnt / ${hrs}, 4)
                  ELSE 0 END)::numeric AS qty,
            CASE WHEN mh.cnt > 0 THEN LEAST(l.created_at, ${mineHourAt("mr.ep", "mp.pn", "mh.hi")})
                 ELSE COALESCE(rr.created_at, l.created_at) END AS at
       FROM w
       JOIN yuplink.res_ledger l ON l.created_at >= w.since AND l.created_at < w.till
       JOIN yuplink.tournament_entry e
         ON e.tournament_id = w.id AND e.account_id = l.account_id AND e.paid
       LEFT JOIN yuplink.raid_reward rr
         ON left(l.ref, 9) = 'raidtour:' AND rr.id = split_part(l.ref, ':', 4)
       LEFT JOIN LATERAL (${mineRefSql("l.ref")}) mr ON true
       LEFT JOIN LATERAL (
         SELECT ${minePrevSql({ acc: "l.account_id", map: "mr.map", ep: "mr.ep", before: "l.created_at" })} AS pn
          WHERE mr.ep IS NOT NULL
       ) mp ON true
       LEFT JOIN LATERAL (
         ${mineHoursSql({ ep: "mr.ep", pn: "mp.pn", thr, ends: "w.ends_at", top: hrs })}
          WHERE mr.ep IS NOT NULL
       ) mh ON true
      WHERE l.resource = ${sqlStr(resource)} AND ${income}
        AND (rr.id IS NULL OR rr.created_at >= ${thr})`;
}
