// SQL шахт v2 (ПРАВИЛА §8.59): куски для читателей и вызовы функций базы.
//
// Формулы живут в базе (migrations/minev2-01..03): здесь только как их звать.
// Строка шахты — v2, когда вид клетки v2 (raid_mine_v2_std не NULL) И у строки
// задан accrue_from; строка без него ещё не переведена и копит по-старому.
// Чистые функции — без базы, покрыты mine-v2-sql.test.ts.
import { sqlStr } from "@/server/api/raid-shared";
import type { MineMode, MineV2Resource } from "@/lib/mineV2";

/** Стандарт в час строки s (настройка клетки cfg); NULL — шахта не v2. */
export const v2StdSql = (s: string, cfg: string): string =>
  `CASE WHEN ${s}.accrue_from IS NOT NULL THEN yuplink.raid_mine_v2_std(${cfg}) END`;

/** Момент поломки строки s. */
export const breakAtSql = (s: string): string =>
  `yuplink.raid_mine_break_at(${s}.mode, ${s}.life_left, ${s}.life_at)`;

/** Строка s — сломанная шахта v2 (сборщик её ещё не снял). */
export const brokenSql = (s: string, cfg: string): string =>
  `(${s}.accrue_from IS NOT NULL AND yuplink.raid_mine_v2_std(${cfg}) IS NOT NULL
     AND ${breakAtSql(s)} <= now())`;

/**
 * Колонки v2 строки s для ответа (времена — мс). Не v2 — v2_std NULL. v2_weather —
 * слоты погоды несобранной части отрезка (weather-02, raid_mine_weather_slots):
 * NULL, пока все коэффициенты 1 (влияние выключено, остров, нет погоды).
 */
export const v2ColsSql = (s: string, cfg: string): string =>
  `${v2StdSql(s, cfg)} AS v2_std, ${s}.mode AS v2_mode, ${s}.life_left AS v2_life_left,
   extract(epoch from ${s}.life_at) * 1000 AS v2_life_at,
   extract(epoch from ${s}.accrue_from) * 1000 AS v2_accrue,
   ${weatherSlotsSql(s, cfg)} AS v2_weather`;

/** Слоты погоды от первого несобранного часа строки s до сейчас (или поломки). */
export const weatherSlotsSql = (s: string, cfg: string): string =>
  `CASE WHEN ${s}.accrue_from IS NOT NULL AND yuplink.raid_mine_v2_std(${cfg}) IS NOT NULL
        THEN yuplink.raid_mine_weather_slots(${s}.map_id,
               ${s}.accrue_from + make_interval(secs => (COALESCE(${s}.claimed_hours, 0) * 3600)::float8),
               LEAST(now(), ${breakAtSql(s)})) END`;

/** Сырые колонки v2Cols в ответе базы. */
export type V2Cols = {
  v2_std: number | string | null;
  v2_mode: string | null;
  v2_life_left: number | string | null;
  v2_life_at: number | string | null;
  v2_accrue: number | string | null;
  /** Слоты погоды (jsonb [[мс, коэф], …]); нет влияния — null (lib/mineWeather). */
  v2_weather?: unknown;
};

/**
 * Секундомер строки s для livePendingAmount (мс): начало отрезка, от которого
 * база считает часы. Старые ветки сбора идут от COALESCE(accrue_from,
 * captured_at) — клетка, которую админ увёл из v2, иначе показала бы месяцы
 * от захвата, а собрала бы часы. У старых видов accrue_from пуст — захват.
 */
export const mineClockSql = (s: string): string =>
  `extract(epoch from COALESCE(${s}.accrue_from, ${s}.captured_at)) * 1000`;

/** Флаг шахты острова у настройки клетки cfg (как SQL raid_mine_is_island). */
export const islandSql = (cfg: string): string => `COALESCE(${cfg}->>'island' = 'true', false)`;

/**
 * Состояние одной клетки: вид v2, строка владения (или её нет), поломка.
 * Остров: island — флаг клетки, spent — клетку уже чинили (raid_mine_op):
 * вторая починка запрещена (minev2-30), выработанная шахта больше не встаёт.
 */
export function cellStateSql(mapId: string, q: number, r: number): string {
  return `SELECT yuplink.raid_mine_v2_std(c.building_config) AS cell_std,
            yuplink.raid_mine_level(c.building_config) AS level,
            -- Соседи (§8.80): своей — число обхода (по нему идёт ставка), ничьей — на лету
            -- теми же долями (дерево у k шахт — 1/k каждой, raid_nature_share).
            CASE WHEN c.building_config->>'resource' IN ('wood', 'stone')
                 THEN COALESCE(CASE WHEN s.owner_account IS NOT NULL
                                    THEN c.building_config->>'natureN' END,
                               yuplink.raid_nature_share(c.map_id, c.q, c.r,
                                                         c.building_config->>'resource')::text)
            END AS nature_n,
            ${islandSql("c.building_config")} AS island,
            (${islandSql("c.building_config")} AND EXISTS (SELECT 1 FROM yuplink.raid_mine_op o
               WHERE o.kind = 'repair' AND o.map_id = c.map_id AND o.q = c.q AND o.r = c.r)) AS spent,
            c.building_config->>'resource' AS resource,
            s.owner_account, s.claimed_hours,
            ${mineClockSql("s")} AS cap,
            ${v2ColsSql("s", "c.building_config")},
            yuplink.raid_mine_pending(c.map_id, c.q, c.r) AS pending
       FROM yuplink.raid_map_cells c
       LEFT JOIN yuplink.raid_mine_state s ON s.map_id = c.map_id AND s.q = c.q AND s.r = c.r
      WHERE c.map_id = ${sqlStr(mapId)} AND c.q = ${Math.trunc(q)} AND c.r = ${Math.trunc(r)};`;
}

/**
 * Починка: v2 вызов функции базы; cost — уже серверная цена. credited и
 * credited_to — кому и сколько начислено добычи с неполным часом (своя шахта
 * или поломка внутри починки — прежнему хозяину), для ачивки «Хозяин шахт».
 */
export function repairSql(o: {
  mapId: string;
  q: number;
  r: number;
  account: string;
  wallet: string;
  mode: MineMode;
  cost: Partial<Record<MineV2Resource, number>>;
  op: string;
}): string {
  return `SELECT x.captured, x.applied, x.credited, x.credited_to
       FROM yuplink.raid_mine_repair(${sqlStr(o.mapId)}, ${Math.trunc(o.q)}, ${Math.trunc(o.r)},
              ${sqlStr(o.account)}, ${sqlStr(o.wallet)}, ${sqlStr(o.mode)},
              ${sqlStr(JSON.stringify(o.cost))}::jsonb, ${sqlStr(o.op)}) x;`;
}

/**
 * Смена режима: changed — сменили (false — режим уже такой), credited —
 * начислено хозяину по старому режиму, с неполным часом (дробно).
 */
export function setModeSql(o: {
  mapId: string;
  q: number;
  r: number;
  account: string;
  mode: MineMode;
}): string {
  return `SELECT x.changed, x.credited
       FROM yuplink.raid_mine_set_mode(${sqlStr(o.mapId)}, ${Math.trunc(o.q)}, ${Math.trunc(o.r)},
              ${sqlStr(o.account)}, ${sqlStr(o.mode)}) x;`;
}

/**
 * Улучшение (§8.74, minev2-70): level — уровень, по которому сервер считал цену
 * (база сверяет), cost — уже серверная цена. credited — начислено по старому
 * уровню с неполным часом; applied false — повтор того же ключа.
 */
export function upgradeSql(o: {
  op: string;
  mapId: string;
  q: number;
  r: number;
  account: string;
  level: number;
  cost: Partial<Record<MineV2Resource, number>>;
}): string {
  return `SELECT x.applied, x.new_level, x.credited
       FROM yuplink.raid_mine_upgrade(${sqlStr(o.op)}, ${sqlStr(o.mapId)}, ${Math.trunc(o.q)},
              ${Math.trunc(o.r)}, ${sqlStr(o.account)}, ${Math.trunc(o.level)},
              ${sqlStr(JSON.stringify(o.cost))}::jsonb) x;`;
}

/**
 * Клетки, которые обход сломает (для рассылки). slackSec — запас вперёд:
 * список шире того, что сломает обход парой секунд позже, — лишняя клетка
 * получит безвредное обновление, а сломанная не останется без рассылки.
 */
export function dueCellsSql(limit: number, slackSec: number): string {
  const n = Math.max(0, Math.floor(limit));
  const slack = Math.max(0, Math.floor(slackSec));
  return `SELECT s.map_id, s.q, s.r
       FROM yuplink.raid_mine_state s
       JOIN yuplink.raid_map_cells c ON c.map_id = s.map_id AND c.q = s.q AND c.r = s.r
      WHERE s.accrue_from IS NOT NULL
        AND yuplink.raid_mine_v2_std(c.building_config) IS NOT NULL
        AND ${breakAtSql("s")} <= now() + interval '${slack} seconds'
      ORDER BY ${breakAtSql("s")}, s.map_id, s.q, s.r
      LIMIT ${n};`;
}

/** Обход поломок: строка на каждую сломанную — хозяин и начисленное ему (с хвостом часа). */
export const breakDueSql = (limit: number): string =>
  `SELECT b.b_owner AS owner, b.b_amount AS amount
     FROM yuplink.raid_mine_break_due(${Math.max(0, Math.floor(limit))}) b;`;
