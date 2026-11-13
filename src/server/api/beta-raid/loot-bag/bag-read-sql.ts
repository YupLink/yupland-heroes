// SQL чтения мешочков и сборщика: мешочки во «втором обзоре», мешочки одной
// клетки для окна, лопата в рюкзаке героя, уборка сгоревшего и опустевшего.
// Запись — bag-sql.ts и соседи, здесь — чтение.
import { sightRadiusSql } from "@/server/api/beta-raid/sight/sight-sql";
import { sqlStr } from "@/server/api/raid-shared";
import { CHEST_MOUND_LEFT_MS } from "@/lib/plainChest";
import { voidSql } from "@/server/api/beta-raid/voidCells";
import { livePortion } from "@/server/api/beta-raid/loot-bag/bag-sql";
import { passAliveSql } from "@/server/api/beta-raid/open-pass/pass-sql";
import { FISH_BAG_SOURCE, FISH_BOOT_KEY } from "@/lib/raid/dynamiteFish";
import { DIG_EMPTY_KEY } from "@/lib/digHole";

/** Мешочек `b` — рыба от красного динамита (30.10.2026): слой и окно рисуют рыбу. */
const fishSql = (b: string): string => `(${b}.source = ${sqlStr(FISH_BAG_SOURCE)}) AS fish`;

/** Мешочек `b` — находка лопатой (31.10.2026): «Открыть» говорит «Выкопано: …». */
const digSql = (b: string): string => `(${b}.source = 'dig') AS dig`;

/** Миллисекунд до момента t — на часах сервера. */
export const msLeftSql = (t: string): string =>
  `GREATEST(0, floor(EXTRACT(EPOCH FROM (${t} - now())) * 1000))::bigint`;

/**
 * Последний срок живых порций мешочка b (life.last). Живых нет — NULL: мешочка
 * не видно (всё забрали или всё сгорело), его уберёт сборщик.
 */
export const lifeSql = (b: string): string =>
  `CROSS JOIN LATERAL (
         SELECT max(x.expires_at) AS last FROM yuplink.raid_loot_bag_item x
          WHERE x.bag_id = ${b}.id AND ${livePortion("x")}
       ) life`;

/**
 * Мешочки и бугорки во «втором обзоре» героя — ОДНИМ запросом: позиция героя
 * (строка по ключу аккаунта) и мешочки её карты в квадрате ±LOOT_BAG_SEE по
 * индексу (map_id, q, r), дальше — точное гекс-расстояние. Игроку — только на
 * разведанных им клетках (beta_raid_fog_seen, ключ владельца) и не под куполом;
 * админу — всё в круге, как и остальная карта. Под декором (дерево выросло
 * поверх, дополнение №5) — никому: декор перекрывает. Позиции нет — пусто. Позиция без
 * карты — на активной (activeMapId), как у playerMapId. Ближние — первыми: у
 * толпы (мешочки мест у босса) потолок срежет дальние, а не новые.
 */
export type Near = { account: string; activeMapId: string; admin: boolean };

/** Круг «второго обзора» вокруг позиции p: гекс-расстояние до строки `a`. */
export const distSql = (a: string): string =>
  `(abs(${a}.q - p.q) + abs(${a}.r - p.r) + abs(${a}.q + ${a}.r - p.q - p.r)) / 2`;

/** Игроку — только разведанное им и не под куполом (клетка — `c`); админу — всё. */
export const hiddenSql = (a: string, o: Near): string =>
  o.admin
    ? ""
    : `AND NOT COALESCE(${voidSql("c")}, false)
        AND EXISTS (SELECT 1 FROM yuplink.beta_raid_fog_seen s
                     WHERE s.owner = ${sqlStr(o.account)} AND s.map_id = ${a}.map_id
                       AND s.cell = ${a}.q || ',' || ${a}.r)`;

/**
 * Бугорки из-под сундуков (обычных и магических) — те же круг, разведанное и
 * купол, что у мешочков (ПРАВИЛА §8.22). id «cm_q_r»: сундук на клетке один.
 * Не сгорают — срок заведомо дальше любой сессии.
 */
function moundsNearSql(o: Near): string {
  // Радиус — 20, под биноклем 40 (lib/raid/sight.ts).
  const d = sightRadiusSql(sqlStr(o.account));
  const pick = (table: string) =>
    `SELECT 'cm_' || x.q || '_' || x.r AS id, x.map_id, x.q, x.r, x.buried_at
       FROM ${table} x WHERE x.buried_at IS NOT NULL`;
  return `SELECT m.id, m.q, m.r, true AS buried, ${CHEST_MOUND_LEFT_MS}::bigint AS "leftMs",
            false AS fish
       FROM yuplink.beta_raid_positions p
       JOIN (${pick("yuplink.raid_plain_chest")}
             UNION ALL ${pick("yuplink.raid_magic_chest")}) m
         ON m.map_id = COALESCE(p.map_id, ${sqlStr(o.activeMapId)})
        AND m.q BETWEEN p.q - ${d} AND p.q + ${d} AND m.r BETWEEN p.r - ${d} AND p.r + ${d}
       LEFT JOIN yuplink.raid_map_cells c ON c.map_id = m.map_id AND c.q = m.q AND c.r = m.r
      WHERE p.account_id = ${sqlStr(o.account)}
        AND ${distSql("m")} <= ${d}
        AND c.decoration_id IS NULL
        ${hiddenSql("m", o)}
      ORDER BY ${distSql("m")}, m.buried_at
      LIMIT 100`;
}

/** Мешочки и бугорки «второго обзора» — мешочки и бугорки сундуков одним запросом. */
export function nearSql(o: Near): string {
  return `(${bagsNearSql(o)})
     UNION ALL
     (${moundsNearSql(o)})`;
}

function bagsNearSql(o: Near): string {
  // Радиус — 20, под биноклем 40 (lib/raid/sight.ts).
  const d = sightRadiusSql(sqlStr(o.account));
  const acc = sqlStr(o.account);
  const dist = distSql("b");
  const hidden = hiddenSql("b", o);
  return `SELECT b.id, b.q, b.r, (b.buried_at IS NOT NULL) AS buried,
            ${msLeftSql("life.last")} AS "leftMs", ${fishSql("b")}
       FROM yuplink.beta_raid_positions p
       JOIN yuplink.raid_loot_bag b
         ON b.map_id = COALESCE(p.map_id, ${sqlStr(o.activeMapId)})
        AND b.q BETWEEN p.q - ${d} AND p.q + ${d} AND b.r BETWEEN p.r - ${d} AND p.r + ${d}
       ${lifeSql("b")}
       LEFT JOIN yuplink.raid_map_cells c ON c.map_id = b.map_id AND c.q = b.q AND c.r = b.r
      WHERE p.account_id = ${acc}
        AND ${dist} <= ${d}
        AND life.last IS NOT NULL
        AND c.decoration_id IS NULL
        ${hidden}
      ORDER BY ${dist}, b.created_at, b.id
      LIMIT 300`;
}

type Cell = { mapId: string; q: number; r: number; account: string };

/**
 * Мешочки одной клетки для окна: у мешочка — позиции (все живые порции вида:
 * сколько и когда сгорит ближайшая), у бугорка — ничего (содержимое закопанного
 * не видно). Старые — первыми. Бугорок сундука на клетке — тем же видом, в конце:
 * по окну не отличить, сундук под ним или мешочек (ПРАВИЛА §8.22). Содержимое
 * мешочка — только внутри оплаченного входа (open, §8.23), иначе пусто.
 */
export function cellSql(o: Cell): string {
  const at = (a: string) =>
    `${a}.map_id = ${sqlStr(o.mapId)} AND ${a}.q = ${Math.floor(o.q)} AND ${a}.r = ${Math.floor(o.r)}`;
  const mound = (table: string) =>
    `SELECT 'cm_' || x.q || '_' || x.r AS id, true AS buried,
            ${CHEST_MOUND_LEFT_MS}::bigint AS "leftMs", false AS fish, false AS dig,
            '[]'::json AS items, false AS open
       FROM ${table} x WHERE ${at("x")} AND x.buried_at IS NOT NULL`;
  return `(${bagsCellSql(o)})
     UNION ALL (${mound("yuplink.raid_plain_chest")})
     UNION ALL (${mound("yuplink.raid_magic_chest")})`;
}

function bagsCellSql(o: Cell): string {
  const open = passAliveSql(o.account, "'lb:' || b.id");
  return `SELECT b.id, (b.buried_at IS NOT NULL) AS buried, ${msLeftSql("life.last")} AS "leftMs",
            ${fishSql("b")}, ${digSql("b")},
            CASE WHEN b.buried_at IS NOT NULL OR NOT ${open} THEN '[]'::json ELSE COALESCE((
              SELECT json_agg(json_build_object(
                       'stackKey', s.stack_key, 'kind', s.kind, 'refId', s.ref_id, 'name', s.name,
                       'image', s.image, 'count', s.count, 'leftMs', ${msLeftSql("s.soon")})
                       ORDER BY s.name, s.stack_key)
                FROM (SELECT x.stack_key, min(x.kind) AS kind, min(x.ref_id) AS ref_id,
                             min(x.name) AS name, min(x.image) AS image, sum(x.count) AS count,
                             min(x.expires_at) AS soon
                        FROM yuplink.raid_loot_bag_item x
                       WHERE x.bag_id = b.id AND ${livePortion("x")}
                         AND x.stack_key NOT IN (${sqlStr(FISH_BOOT_KEY)}, ${sqlStr(DIG_EMPTY_KEY)})
                       GROUP BY x.stack_key) s), '[]'::json) END AS items,
            (b.buried_at IS NULL AND ${open}) AS open
       FROM yuplink.raid_loot_bag b
       ${lifeSql("b")}
      WHERE b.map_id = ${sqlStr(o.mapId)} AND b.q = ${Math.floor(o.q)} AND b.r = ${Math.floor(o.r)}
        AND life.last IS NOT NULL
      ORDER BY b.created_at, b.id
      LIMIT 100`;
}

/**
 * Лопата в рюкзаке героя: стопка своего товара с галочкой is_shovel и хотя бы
 * одной целой штукой. Видов бывает несколько — берём уже начатую (больший
 * износ), чтобы в рюкзаке не копились надбитые.
 */
export function shovelSql(heroId: string): string {
  return `SELECT ci.id AS "itemId", ci.name, ci.tool_wear AS "toolWear"
       FROM yuplink.raid_hero_backpack b
       JOIN yuplink.raid_custom_item ci
         ON b.kind = 'custom' AND ci.id = split_part(b.stack_key, ':', 2)
      WHERE b.hero_id = ${sqlStr(heroId)} AND ci.is_shovel AND b.count >= 1
      ORDER BY b.wear DESC, b.stack_key
      LIMIT 1`;
}

/** У мешочка есть снятие в полёте: его порции ждут возможного отката. */
const inFlight = (bag: string): string =>
  `EXISTS (SELECT 1 FROM yuplink.raid_loot_bag_op o WHERE o.bag_id = ${bag} AND o.state = 'taken')`;

/** Мешочек не менялся 10 минут. */
const quiet = (bag: string): string =>
  `EXISTS (SELECT 1 FROM yuplink.raid_loot_bag q
            WHERE q.id = ${bag} AND q.updated_at < now() - interval '10 minutes')`;

/**
 * Проход сборщика под общим локом (процессов бывает два), отдельными
 * операторами одной транзакции:
 *  1) сгоревшие порции и пустые (у мешочка, не менявшегося 10 минут) — если у
 *     мешочка нет снятий в полёте: откату нужны прежние порции;
 *  2) ключи нажатий старше двух суток (и у обычного сундука), входы (§8.23),
 *     истёкшие больше часа назад;
 *  3) мешочки без единой порции, не менявшиеся 10 минут, — опустевшие и
 *     сгоревшие целиком, и надгробия «забора» (dropFenceSql). Десять минут
 *     тишины держат «забор» честным: только что упавший мешочек, даже
 *     опустошённый соседом, остаётся с порциями, а опоздавший dropSql
 *     упирается в надгробие.
 * Отдаёт клетки убранных мешочков: игрокам рядом — событие, слой без F5.
 */
export function sweepSql(): string {
  return `SELECT pg_advisory_xact_lock(hashtext('lootbag-sweep')) AS l;
    DELETE FROM yuplink.raid_loot_bag_item i
     WHERE (i.bag_id, i.stack_key, i.expires_at) IN (
       SELECT x.bag_id, x.stack_key, x.expires_at FROM yuplink.raid_loot_bag_item x
        WHERE (x.expires_at <= now() OR (x.count <= 0 AND ${quiet("x.bag_id")}))
          AND NOT ${inFlight("x.bag_id")}
        LIMIT 2000);
    DELETE FROM yuplink.raid_loot_bag_op WHERE at < now() - interval '2 days';
    DELETE FROM yuplink.raid_plain_chest_op WHERE at < now() - interval '2 days';
    DELETE FROM yuplink.raid_open_pass WHERE until < now() - interval '1 hour';
    WITH gone AS (
      DELETE FROM yuplink.raid_loot_bag d
       WHERE d.updated_at < now() - interval '10 minutes'
         AND NOT EXISTS (SELECT 1 FROM yuplink.raid_loot_bag_item x WHERE x.bag_id = d.id)
         AND NOT ${inFlight("d.id")}
      RETURNING d.map_id, d.q, d.r
    )
    SELECT row_to_json(_t.*) AS _row FROM (
      SELECT DISTINCT map_id, q, r FROM gone
    ) _t;`;
}
