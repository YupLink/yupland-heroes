// Общие для клиента и сервера константы редактора интерьера замка.
// Живут отдельно от server/api, чтобы клиентский бандл не тянул серверный модуль
// ради одной константы (см. knowledge.md про утечку серверного модуля в клиент).

export const CASTLE_KINDS = ["terrain", "building", "object", "decoration", "road"] as const;
export type CastleKind = (typeof CASTLE_KINDS)[number];

/** Слои клетки на клиенте ↔ колонки в базе. */
export type CastleCell = {
  terrainId: string | null;
  buildingId: string | null;
  objectId: string | null;
  decorationId: string | null;
  roadId: string | null;
  /** Общий id для объединённых клеток; null — одиночная. */
  groupId: string | null;
  /** Масштаб картинки блока (1 = как есть … 2); null = 1. Одинаков у всех клеток блока. */
  iconScale: number | null;
};

export const EMPTY_CASTLE_CELL: CastleCell = {
  terrainId: null,
  buildingId: null,
  objectId: null,
  decorationId: null,
  roadId: null,
  groupId: null,
  iconScale: null,
};

/** Есть ли в клетке хоть что-то (иначе её незачем хранить). */
export const castleCellHasContent = (c: CastleCell): boolean =>
  !!(c.terrainId || c.buildingId || c.objectId || c.decorationId || c.roadId || c.groupId);
