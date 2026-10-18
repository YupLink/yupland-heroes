// Дельта карты: что изменилось в клетках и какие словари к этому нужны.
//
// Общая форма для сервера (журнал, живой канал) и клиента (правка кэша):
// CellPatch — та самая правка, которой кисть режима бога уже правит карту в
// кэше (components/beta-raid/patchMapCache), assets — записи словарей для id,
// которых у клиента ещё нет (новый объект, новая постройка). Ничего нового
// клиенту учить не надо: дельта с сервера накладывается тем же кодом.
export type CellPatch = {
  q: number;
  r: number;
  terrainId?: string | null;
  /** Дорога поверх местности: id справочника или null — снять. */
  roadId?: string | null;
  decorationId?: string | null;
  objectId?: string | null;
  buildingId?: string | null;
  /**
   * Облик клетки: id картинки (без префикса) или null — вернуть базовый вид. В
   * колонке карты bld он показывается как «skin:<id>»; настоящий building_id при
   * этом остаётся (в этом же патче — buildingId базовой постройки).
   */
  buildingSkinId?: string | null;
  /** Новый тир постройки на этой клетке. */
  tier?: number;
  /** Жив ли объект на клетке: false — «добыт». */
  alive?: boolean;
  /** Объект на клетке — беглец (server runners.ts): показан, но клетку не запирает. */
  runner?: boolean;
  /** Настройки постройки на клетке: текст таблички и прочее своё. */
  buildingConfig?: Record<string, unknown> | null;
  /** Настройки объекта на клетке: HP, цена входа, награды. */
  objectConfig?: Record<string, unknown> | null;
  /** Купол глухого тумана: true — накрыть, false — снять. */
  voidFog?: boolean;
  /**
   * Объединённый блок (режим бога): id блока или null — вывести клетку из
   * блока. Постройка блока стоит на одной его клетке, картинка — на весь блок.
   */
  groupId?: string | null;
  /** Масштаб картинки блока 1.00 … 2.00 (шаг 0.05); null — как есть. */
  iconScale?: number | null;
};

/** Записи словарей карты для id, которых у клиента ещё нет. */
export type MapDeltaAssets = {
  terrains?: Record<string, unknown>;
  roads?: Record<string, unknown>;
  objects?: Record<string, unknown>;
  decorations?: Record<string, unknown>;
  buildings?: Record<string, unknown>;
};

/** Ответ /api/beta-raid/map-delta и событие «map» живого канала. */
export type MapDelta =
  | { rev: number; full: true }
  | { rev: number; full?: false; patches: CellPatch[]; assets?: MapDeltaAssets };

/**
 * Дельта глазами игрока: клетки под глухим туманом уезжают пустыми — только
 * координаты и сам признак купола (то же правило, что у voidSanitize для
 * снимка). Словари режем до id, которые остались в видимых правках.
 */
export function sanitizeDeltaForPlayer<T extends object>(delta: T): T {
  const d = delta as T & { patches?: CellPatch[]; assets?: MapDeltaAssets };
  if (!d.patches) return delta;
  const patches = d.patches.map((p) =>
    p.voidFog === true ? { q: p.q, r: p.r, voidFog: true as const } : p,
  );
  if (!d.assets) return { ...delta, patches };
  const keep = (dict: Record<string, unknown> | undefined, ids: Set<string>) => {
    if (!dict) return undefined;
    const out: Record<string, unknown> = {};
    for (const id of Object.keys(dict)) if (ids.has(id)) out[id] = dict[id];
    return Object.keys(out).length ? out : undefined;
  };
  const ids = (pick: (p: CellPatch) => string | null | undefined) =>
    new Set(patches.map(pick).filter((v): v is string => !!v));
  const assets: MapDeltaAssets = {
    terrains: keep(
      d.assets.terrains,
      ids((p) => p.terrainId),
    ),
    roads: keep(
      d.assets.roads,
      ids((p) => p.roadId),
    ),
    objects: keep(
      d.assets.objects,
      ids((p) => p.objectId),
    ),
    decorations: keep(
      d.assets.decorations,
      ids((p) => p.decorationId),
    ),
    buildings: keep(
      d.assets.buildings,
      new Set([
        ...ids((p) => p.buildingId),
        ...ids((p) => (p.buildingSkinId ? `skin:${p.buildingSkinId}` : null)),
      ]),
    ),
  };
  return { ...delta, patches, assets };
}
