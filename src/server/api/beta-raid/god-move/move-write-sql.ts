// Перенос здания (режим бога): хозяйство постройки — с её клетки на новую.
//
// Клетка постройки — ведущая клетка одиночного здания или клетка блока, где
// стоит постройка (в блоке она одна, move-unit). Каждая запись — подзапрос,
// подвешенный к строке `go` (move-check-sql): нет её — не пишется ничего. Все
// записи — один оператор, поэтому видят ОДИН снимок: строка не двигается
// дважды, а условия «есть ли на цели» смотрят состояние до переноса.
//
// Переезжает всё, что держит СОСТОЯНИЕ постройки по её клетке (сама постройка,
// облик и конфиг — колонки клетки, move-cells-sql):
//  • beta_raid_building_state — тир (на цели — переписывается, сирота без
//    постройки на цели — снимается);
//  • beta_raid_building_use — отметки «уже пользовался» (вышка, дерево уровней);
//    если у игрока такая же отметка уже есть на цели — лишняя снимается;
//  • raid_market_shop (+ привязка лавок к переезжающей ратуше town_q/town_r)
//    и raid_market_item — лавка и её позиции;
//  • raid_town, raid_town_stock, raid_town_stock_move — ратуша, склад города и
//    журнал склада; ключи суточного тика («tick:<день>:<карта>:<q>,<r>:…»)
//    переписываются на новую клетку, иначе второй тик в те же сутки съел бы и
//    произвёл заново;
//  • raid_town_cash, raid_town_cash_move — касса ратуши и её журнал (11.11: касса
//    оставалась на старой клетке); забытая касса на цели — отказ (move-target-sql);
//  • raid_warehouse_slot — склад (личные полки и общая);
//  • raid_field_worker — герои на грядке;
//  • raid_mine_state, raid_mine_guard, raid_mine_capture_log — шахта, её
//    охрана (если на клетке нет магического сундука — тогда охрана его),
//    журнал «шахту отбили» и замок шахтёра raid_mine_ward (11.11);
//  • hero_swap_log — заряды таверны (считаются по её клетке);
//  • trade_journal — сделки самой постройки (TRADE_MOVES): у склада по месту
//    «турнир → золото» узнаёт, чьё купленное лежит на полке;
//  • raid_hero_rite и raid_enchant_spell — обряды улучшения героев и заклинания
//    лавки зачарования (владелец 11.11: «чтобы переезжали вместе со зданием» —
//    оставались на старой клетке, окно писало «Обрядов нет»). Забытые на цели
//    от убранной там постройки снимаются, если едут свои — списки не смешиваются.
// На клетке остаётся то, что лежит на ЗЕМЛЕ, а не в постройке: сундуки,
// мешочки, ямка, объект с боевым состоянием, беглец, корабль, игроки, туман.
import { sqlStr } from "@/server/api/raid-shared";
import type { TradeSource } from "@/lib/econ/types";
import type { GodCell } from "@/lib/godMove";
import { atCell } from "@/server/api/beta-raid/god-move/move-where";

/** Откуда и куда едет хозяйство постройки: её клетка и та же клетка + вектор. */
export type BuildingHop = { mapId: string; from: GodCell; to: GodCell };

/**
 * Чья строка журнала сделок на клетке: true — постройки (едет с ней), false —
 * того, что лежит на земле (сундук, мешочек), или вовсе без клетки. Record —
 * чтобы новый источник сделок без решения не собрался (tsc).
 */
export const TRADE_MOVES: Record<TradeSource, boolean> = {
  market: true,
  market_sell: true,
  town: true,
  wh_take: true,
  wh_put: true,
  gate: true,
  portal: true,
  // Плата за запись — на клетке Арены: едет вместе с постройкой.
  tour: true,
  field: true,
  chip_market: false,
  chest: false,
  chest_plunder: false,
  loot_bag: false,
  plain_chest: false,
  // Приз бокса — без клетки.
  mystic: false,
  // Улов — на клетке рыбака (мешочек на земле), выпитое — без клетки.
  fish: false,
  drink: false,
};

const tradeSources = (): string =>
  (Object.keys(TRADE_MOVES) as TradeSource[])
    .filter((s) => TRADE_MOVES[s])
    .map((s) => sqlStr(s))
    .join(", ");

/** Перевезти строки таблицы с прежней клетки на новую. */
const shift = (name: string, table: string, o: BuildingHop, extra = ""): string =>
  `${name} AS (
       UPDATE yuplink.${table} x SET q = ${o.to.q}, r = ${o.to.r}
         FROM go
        WHERE ${atCell("x", o.mapId, o.from)}${extra}
       RETURNING 1
     )`;

/** Список настроек по клетке (обряды, заклинания): свои едут, сироты цели — снять. */
const listSql = (name: string, table: string, o: BuildingHop): string => {
  const own = `SELECT 1 FROM yuplink.${table} s WHERE ${atCell("s", o.mapId, o.from)}`;
  return `${name}_drop AS (
       DELETE FROM yuplink.${table} x USING go
        WHERE ${atCell("x", o.mapId, o.to)} AND EXISTS (${own})
       RETURNING 1
     ),
     ${shift(name, table, o)}`;
};

/** Тир: на цели — тир переезжающей (поверх сироты), прежний — снять. */
const tierSql = (o: BuildingHop): string => {
  const fromRow = `SELECT 1 FROM yuplink.beta_raid_building_state s WHERE ${atCell("s", o.mapId, o.from)}`;
  return `tier_up AS (
       INSERT INTO yuplink.beta_raid_building_state AS b (map_id, q, r, tier, updated_at, updated_by)
       SELECT s.map_id, ${o.to.q}, ${o.to.r}, s.tier, s.updated_at, s.updated_by
         FROM yuplink.beta_raid_building_state s, go
        WHERE ${atCell("s", o.mapId, o.from)}
       ON CONFLICT (map_id, q, r) DO UPDATE
          SET tier = EXCLUDED.tier, updated_at = EXCLUDED.updated_at, updated_by = EXCLUDED.updated_by
       RETURNING b.tier
     ),
     tier_del AS (
       DELETE FROM yuplink.beta_raid_building_state b USING go
        WHERE (${atCell("b", o.mapId, o.from)})
           OR (${atCell("b", o.mapId, o.to)} AND NOT EXISTS (${fromRow}))
       RETURNING 1
     )`;
};

/** Отметки «уже пользовался»: такая же на цели — лишнюю снять, иначе перевезти. */
const usesSql = (o: BuildingHop): string => {
  const twin = `EXISTS (SELECT 1 FROM yuplink.beta_raid_building_use t
                  WHERE ${atCell("t", o.mapId, o.to)} AND t.owner = u.owner AND t.kind = u.kind)`;
  return `use_dup AS (
       DELETE FROM yuplink.beta_raid_building_use u USING go
        WHERE ${atCell("u", o.mapId, o.from)} AND ${twin}
       RETURNING 1
     ),
     use_mv AS (
       UPDATE yuplink.beta_raid_building_use u SET q = ${o.to.q}, r = ${o.to.r}
         FROM go
        WHERE ${atCell("u", o.mapId, o.from)} AND NOT ${twin}
       RETURNING 1
     )`;
};

/** Лавка переезжает, а лавки, привязанные к переезжающей ратуше, — перепривязываются. */
const shopsSql = (o: BuildingHop): string => {
  const own = `s.q = ${o.from.q} AND s.r = ${o.from.r}`;
  const bound = `s.town_q = ${o.from.q} AND s.town_r = ${o.from.r}`;
  return `shops AS (
       UPDATE yuplink.raid_market_shop s
          SET q = CASE WHEN ${own} THEN ${o.to.q} ELSE s.q END,
              r = CASE WHEN ${own} THEN ${o.to.r} ELSE s.r END,
              town_q = CASE WHEN ${bound} THEN ${o.to.q} ELSE s.town_q END,
              town_r = CASE WHEN ${bound} THEN ${o.to.r} ELSE s.town_r END
         FROM go
        WHERE s.map_id = ${sqlStr(o.mapId)} AND ((${own}) OR (${bound}))
       RETURNING 1
     )`;
};

/** Журнал склада города: клетка и ключи суточного тика — на новое место. */
const stockLogSql = (o: BuildingHop): string => {
  const was = sqlStr(`:${o.mapId}:${o.from.q},${o.from.r}:`);
  const now = sqlStr(`:${o.mapId}:${o.to.q},${o.to.r}:`);
  return `stock_log AS (
       UPDATE yuplink.raid_town_stock_move x
          SET q = ${o.to.q}, r = ${o.to.r},
              ref = CASE WHEN x.ref LIKE 'tick:%' THEN replace(x.ref, ${was}, ${now}) ELSE x.ref END
         FROM go
        WHERE ${atCell("x", o.mapId, o.from)}
       RETURNING 1
     )`;
};

/** Подзапросы переноса хозяйства — по одному на таблицу. Без хвостовой запятой. */
export function writeCtes(o: BuildingHop): string {
  // Охрана на клетке с магическим сундуком — охрана сундука: остаётся с ним.
  const notChestGuard = `
          AND NOT EXISTS (SELECT 1 FROM yuplink.raid_magic_chest mc
                           WHERE ${atCell("mc", o.mapId, o.from)})`;
  return [
    tierSql(o),
    usesSql(o),
    shopsSql(o),
    shift("items", "raid_market_item", o),
    shift("towns", "raid_town", o),
    shift("stock", "raid_town_stock", o),
    stockLogSql(o),
    shift("cash", "raid_town_cash", o),
    shift("cash_log", "raid_town_cash_move", o),
    shift("wh", "raid_warehouse_slot", o),
    shift("workers", "raid_field_worker", o),
    shift("mines", "raid_mine_state", o),
    shift("guard", "raid_mine_guard", o, notChestGuard),
    shift("mine_log", "raid_mine_capture_log", o),
    shift("ward", "raid_mine_ward", o),
    shift("swaps", "hero_swap_log", o),
    shift("trades", "trade_journal", o, ` AND x.source IN (${tradeSources()})`),
    listSql("rites", "raid_hero_rite", o),
    listSql("spells", "raid_enchant_spell", o),
  ].join(",\n     ");
}

/**
 * Имена подзапросов хозяйства — для ответа (сколько строк переехало). Они же —
 * ключи JSON ответа рядом с reason и остатками (market, town, warehouse, field,
 * mine): совпадать с ними нельзя, иначе row_to_json отдаст два одинаковых ключа.
 */
export const WRITE_NAMES = [
  "tier_up",
  "tier_del",
  "use_dup",
  "use_mv",
  "shops",
  "items",
  "towns",
  "stock",
  "stock_log",
  "cash",
  "cash_log",
  "wh",
  "workers",
  "mines",
  "guard",
  "mine_log",
  "ward",
  "swaps",
  "trades",
  "rites_drop",
  "rites",
  "spells_drop",
  "spells",
] as const;
