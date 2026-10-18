// Какие клетки зоны генератору трогать нельзя.
//
// Генератор перекрашивает местность и декор, но не должен подложить лес под
// постройку, залить водой стоящего игрока или спрятанного беглеца, тронуть
// блок из нескольких клеток или клетку под глухим куполом. Список занятых
// собирается ОДНИМ запросом по прямоугольнику зоны (не по 8 000 координат в
// SQL — мост режет длинные запросы), а точное совпадение с зоной делается
// уже здесь.
//
// Корабль тоже держит клетку: суша под бортом — это стоящее на лугу судно,
// которое ни уплыть, ни разобрать. Сундук игрока (магический и обычный) —
// тоже: он живёт своим слоем (raid_magic_chest, raid_plain_chest), а не
// постройкой клетки, и без этой строки поселение встало бы прямо на него. Дорога занятостью не считается — дорогу
// генератор не трогает по контракту (ZonePatch), а местность под ней менять
// можно; но воду и декор он на неё не кладёт (generate.ts), поэтому клетки с
// дорогой отдаём отдельным набором тем же запросом по прямоугольнику.
//
// Позиции игроков сверяем по карте как players-cache: map_id проставлен
// всем, но NULL (старые строки) считаем «на активной» — лучше лишняя занятая
// клетка, чем вода под ногами.
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import { POS_MAP_SQL } from "@/server/api/beta-raid/pos-map-sql";
import type { ZoneCell } from "@/lib/raid/zonegen/recipe";

type Box = { q0: number; q1: number; r0: number; r1: number };

const inBox = (alias: string, b: Box) =>
  `${alias}.q BETWEEN ${b.q0} AND ${b.q1} AND ${alias}.r BETWEEN ${b.r0} AND ${b.r1}`;

/** Текст запроса отдельно: что считается занятым — правило, и тест читает его. */
export function occupiedSql(mapId: string, b: Box): string {
  const m = sqlStr(mapId);
  return `SELECT c.q, c.r FROM yuplink.raid_map_cells c
    WHERE c.map_id = ${m} AND ${inBox("c", b)}
      AND (c.object_id IS NOT NULL OR c.building_id IS NOT NULL
           OR c.group_id IS NOT NULL OR c.void_fog IS TRUE)
    UNION
    SELECT p.q, p.r FROM yuplink.beta_raid_positions p
     WHERE ${POS_MAP_SQL("p")} = ${m} AND ${inBox("p", b)}
    UNION
    SELECT rr.q, rr.r FROM yuplink.beta_raid_runner rr
     WHERE rr.map_id = ${m} AND ${inBox("rr", b)}
    UNION
    SELECT s.q, s.r FROM yuplink.beta_raid_ship s
     WHERE s.map_id = ${m} AND ${inBox("s", b)}
    UNION
    SELECT mc.q, mc.r FROM yuplink.raid_magic_chest mc
     WHERE mc.map_id = ${m} AND ${inBox("mc", b)}
    UNION
    SELECT pc.q, pc.r FROM yuplink.raid_plain_chest pc
     WHERE pc.map_id = ${m} AND ${inBox("pc", b)};`;
}

export function boundingBox(cells: ZoneCell[]): Box {
  const b: Box = { q0: Infinity, q1: -Infinity, r0: Infinity, r1: -Infinity };
  for (const c of cells) {
    if (c.q < b.q0) b.q0 = c.q;
    if (c.q > b.q1) b.q1 = c.q;
    if (c.r < b.r0) b.r0 = c.r;
    if (c.r > b.r1) b.r1 = c.r;
  }
  return b;
}

/** Клетки с дорогой в прямоугольнике — тот же принцип, что occupiedSql. */
export function roadsSql(mapId: string, b: Box): string {
  return `SELECT c.q, c.r FROM yuplink.raid_map_cells c
    WHERE c.map_id = ${sqlStr(mapId)} AND ${inBox("c", b)} AND c.road_id IS NOT NULL;`;
}

async function keysInZone(sql: string, wanted: Set<string>): Promise<Set<string>> {
  const out = new Set<string>();
  const rows = ((await mcpExec(sql, { wrapJson: true })) ?? []) as Array<{
    q: number | string;
    r: number | string;
  }>;
  for (const row of rows) {
    const key = `${Number(row.q)},${Number(row.r)}`;
    if (wanted.has(key)) out.add(key);
  }
  return out;
}

/** Занятые клетки ИЗ ПЕРЕДАННЫХ, ключ «q,r» — как считает генератор. */
export async function loadOccupied(mapId: string, cells: ZoneCell[]): Promise<Set<string>> {
  if (cells.length === 0) return new Set();
  const wanted = new Set(cells.map((c) => `${c.q},${c.r}`));
  return keysInZone(occupiedSql(mapId, boundingBox(cells)), wanted);
}

/**
 * Добавить к занятым клетки НЕВЫГРУЖЕННЫХ правок очереди кисти.
 *
 * Владелец, 24.09.2026: «здание на здание прям закидывает, приходилось
 * удалять, удалять». Причина ровно здесь: база знает только то, что уже
 * выгружено, а дома первого прогона лежат в очереди у клиента. Второй прогон
 * их не видел и ставил свои дома поверх и вплотную.
 *
 * Сет мутируется намеренно: он только что собран этим же вызовом и дальше
 * едет в генератор с планировщиком одним объектом.
 */
export function addBusy(occupied: Set<string>, busy: ZoneCell[] | undefined): Set<string> {
  for (const c of busy ?? []) occupied.add(`${c.q},${c.r}`);
  return occupied;
}

/** Клетки с дорогой ИЗ ПЕРЕДАННЫХ — воде и декору туда нельзя. */
export async function loadRoads(mapId: string, cells: ZoneCell[]): Promise<Set<string>> {
  if (cells.length === 0) return new Set();
  const wanted = new Set(cells.map((c) => `${c.q},${c.r}`));
  return keysInZone(roadsSql(mapId, boundingBox(cells)), wanted);
}
