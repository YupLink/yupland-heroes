// Перемещение в режиме бога: общий договор сервера и окна админа.
//
// Сервер (server/api/beta-raid/god-move) переносит сущность клетки со всем,
// что к ней привязано: здание (в блоке — весь блок), объект, декор, сундук,
// мешочки. Отвечает либо «перенесено» (что теперь на клетках — окно сразу
// перерисует), либо причиной отказа. Отказ всегда ДО любых изменений:
// проверка и перенос — один оператор.
import type { CellPatch } from "@/lib/raid/mapDelta";

/** Клетка карты. */
export type GodCell = { q: number; r: number };

/** Что переносим. Корабли, игроки и беглецы ходят сами — их не двигаем. */
export const GOD_MOVE_KINDS = ["building", "decor", "object", "chest", "bags"] as const;

export type GodMoveKind = (typeof GOD_MOVE_KINDS)[number];

/** Почему не перенесли. Тексты — ключи `godmove.<причина>` в словаре. */
export type GodMoveReason =
  | "same_cell"
  | "other_map"
  | "gone"
  | "changed"
  | "dead"
  | "block_many"
  | "chest_guard"
  | "target_missing"
  | "target_block"
  | "target_water"
  | "target_dome"
  | "target_building"
  | "target_object"
  | "target_runner"
  | "target_player"
  | "target_chest"
  | "target_bag"
  | "target_guard"
  | "target_decor"
  | "target_ship"
  | "target_leftovers";

/** Что осталось на целевой клетке от убранного (держит её). */
export type GodMoveLeftover = "market" | "town" | "warehouse" | "field" | "mine" | "object";

export const GOD_MOVE_REASONS: readonly GodMoveReason[] = [
  "same_cell",
  "other_map",
  "gone",
  "changed",
  "dead",
  "block_many",
  "chest_guard",
  "target_missing",
  "target_block",
  "target_water",
  "target_dome",
  "target_building",
  "target_object",
  "target_runner",
  "target_player",
  "target_chest",
  "target_bag",
  "target_guard",
  "target_decor",
  "target_ship",
  "target_leftovers",
];

export const GOD_MOVE_LEFTOVERS: readonly GodMoveLeftover[] = [
  "market",
  "town",
  "warehouse",
  "field",
  "mine",
  "object",
];

/** Клетка карты после переноса здания, блока или декора — как её видит база. */
export type GodMovedCell = {
  q: number;
  r: number;
  buildingId: string | null;
  skinId: string | null;
  /** Тир постройки на клетке (0 — нет или первый). */
  tier: number;
  decorationId: string | null;
  groupId: string | null;
  iconScale: number | null;
};

/** Что переехало. cells — клетки карты (здание, блок, декор); object — объект. */
export type GodMoved = {
  cells: GodMovedCell[];
  object: { id: string; alive: boolean } | null;
};

export type GodMoveResult =
  /** already — повтор того же переноса (мост, двойной тап): уже стоит там. */
  | { ok: true; already: boolean; moved: GodMoved }
  | { ok: false; reason: GodMoveReason; leftovers: GodMoveLeftover[] };

/**
 * Остаться в режиме переноса после отказа? Да — если не подошла целевая
 * клетка: админ тут же выберет другую. Нет — если дело в самой сущности
 * (сменилась, ушла, блок не переносится): выбирать цель больше незачем.
 */
export function keepsMoving(reason: GodMoveReason): boolean {
  return reason.startsWith("target_") || reason === "same_cell";
}

/** Слои клетки, что едут: блок — всё сразу; вне блока — только свой слой. */
export type GodMoveParts = { building: boolean; decor: boolean; group: boolean };

/** Что едет у здания и декора (у остальных видов клетки карты не едут). */
export function godMoveParts(kind: GodMoveKind, block: boolean): GodMoveParts {
  return {
    building: block || kind === "building",
    decor: block || kind === "decor",
    group: block,
  };
}

/** Клетки после переноса → правки карты: только то, что ехало (облик, тир — с постройкой). */
export function cellPatches(cells: GodMovedCell[], parts: GodMoveParts): CellPatch[] {
  return cells.map((c) => ({
    q: c.q,
    r: c.r,
    ...(parts.building ? { buildingId: c.buildingId, tier: c.tier } : {}),
    ...(parts.building && c.skinId ? { buildingSkinId: c.skinId } : {}),
    ...(parts.decor ? { decorationId: c.decorationId } : {}),
    ...(parts.group ? { groupId: c.groupId, iconScale: c.iconScale } : {}),
  }));
}
