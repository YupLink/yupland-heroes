// Вспомогательные функции для бета-рейда (гекс-геометрия и валидация)
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { CELL_COST_JOIN, CELL_COST_SQL } from "./cell-sql";
import { loadStepFacts, stepBlockedReason } from "./step-facts";
import { cellRoadId } from "./map-roads";

// ─── Гекс-геометрия ───

/** Расстояние между двумя гекс-клетками (axial coordinates) */
export function hexDistance(q1: number, r1: number, q2: number, r2: number): number {
  return (Math.abs(q1 - q2) + Math.abs(r1 - r2) + Math.abs(q1 + r1 - q2 - r2)) / 2;
}

/** Получить 6 соседних клеток (flat-top hexagon) */
const HEX_DIRECTIONS = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

export function getNeighbors(q: number, r: number) {
  return HEX_DIRECTIONS.map((d) => ({ q: q + d.q, r: r + d.r }));
}

/** Проверка что клетки соседние */
export function areNeighbors(q1: number, r1: number, q2: number, r2: number): boolean {
  return hexDistance(q1, r1, q2, r2) === 1;
}

// ─── Валидация движения ───

interface ValidMoveResult {
  valid: boolean;
  reason?: string;
  moveCost?: number;
}

/**
 * Проверяет валидность хода. Пути (routes) больше НЕ участвуют — герой
 * ходит по всей карте, куда есть местность.
 *
 * Правила:
 * 1. Клетки соседние (расстояние = 1).
 * 2. У целевой клетки есть terrain (без местности идти нельзя).
 * 3. На целевой клетке НЕТ декора — декор непроходим (им и рисуют преграды).
 * 4. На целевой клетке нет ЖИВОГО объекта (повержённый не держит клетку).
 * 5. Клетка не накрыта глухим туманом — туда нельзя ИГРОКУ.
 *
 * Зону тумана спрашиваем живьём, без кэша: кэш здесь стоил бы дыры в стене
 * ровно на своё время жизни.
 *
 * Кошелёк — вместо прежнего размера карты: тот в проверке не участвовал
 * (лежал под `_mapSize`), а спрашивать «чей это ход» здесь теперь надо —
 * админ ходит по своей зоне сам (canIgnoreVoid). Новым параметром это было бы
 * седьмым аргументом подряд, а так их по-прежнему шесть.
 *
 * Сам снимок клетки живёт в step-facts.ts: шагу по карте нужны ещё и цена,
 * вода и причал этой же клетки, и спрашивать их четырьмя запросами подряд
 * было дороже всего остального шага вместе взятого. Здесь остался вход для
 * тех, кому нужна ТОЛЬКО проходимость (сход с корабля, ship-action).
 */
export async function isValidMove(
  fromQ: number,
  fromR: number,
  toQ: number,
  toR: number,
  mapId: string,
  wallet: string | null,
): Promise<ValidMoveResult> {
  if (!areNeighbors(fromQ, fromR, toQ, toR)) {
    return { valid: false, reason: "Можно ходить только на соседние клетки" };
  }
  const reason = stepBlockedReason(await loadStepFacts(mapId, toQ, toR), wallet);
  return reason ? { valid: false, reason } : { valid: true };
}

// ─── Стоимость хода ───

/**
 * Получить стоимость хода в энергии для клетки (q, r).
 *
 * ОДИН запрос: раньше их было два подряд — сперва клетка, потом шаблон её
 * дороги или местности, и оба ждали друг друга по сети. Правило выбора
 * (дорога приоритетнее местности, пусто — единица) не переехало в SQL заново,
 * а взято общим CELL_COST_SQL: им же считают цену схода на берег и цену
 * целевой клетки шага, так что разъехаться этим трём негде.
 */
export async function getMoveCost(q: number, r: number, mapId: string): Promise<number> {
  const rows = (await mcpExec(
    `SELECT ${CELL_COST_SQL} AS cost
       FROM yuplink.raid_map_cells c
       ${CELL_COST_JOIN}
      WHERE c.map_id = ${sqlStr(mapId)} AND c.q = ${q} AND c.r = ${r} LIMIT 1;`,
    { wrapJson: true },
  )) as Array<{ cost: number | string | null }>;
  return Number(rows?.[0]?.cost) || 1;
}

/**
 * Цена шага на клетку. Дорога ПРИОРИТЕТНЕЕ местности: если по клетке проложена
 * дорога, шаг стоит столько, сколько задано у дороги — даже если местность
 * дороже (болото за 10 с дорогой за 1 стоит 1).
 */
export async function cellMoveCost(
  terrainId: string | null,
  roadId: string | null,
): Promise<number> {
  // Дорога у клетки одна, и разбор общий (map-roads) — тот же, каким она
  // рисуется. Цену считает и SQL (cell-sql.CELL_COST_JOIN): на одной дороге
  // первый и последний id склейки совпадают, расходиться нечему.
  const id = cellRoadId(roadId) || terrainId;
  if (!id) return 1;
  const rows = (await mcpExec(
    `SELECT stat_amount FROM yuplink.mystic_item_template
     WHERE id = '${id}' LIMIT 1;`,
    { wrapJson: true },
  )) as Array<{ stat_amount: number | null }>;
  return Number(rows?.[0]?.stat_amount) || 1;
}

// ─── Центр карты (замок) ───

/**
 * Получить координаты центра карты (замок)
 */
export function getCastlePosition(mapSize: number): { q: number; r: number } {
  const center = Math.floor(mapSize / 2);
  // Преобразуем offset (center, center) в axial
  const q = center - Math.floor((center - (center & 1)) / 2);
  const r = center;
  return { q, r };
}
