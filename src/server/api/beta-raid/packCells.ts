// Упаковка клеток карты в колоночный вид.
//
// Карта «Мир Альфа» — 16 384 клетки. Объектами это ~2.5 МБ JSON на каждый
// вход в рейд; колонками индексов — примерно в десять раз меньше при том же
// смысле. Обратно разворачивает клиент (components/beta-raid/unpackMap.ts).

import { skinKey } from "./building-skins";
import { clampIconScale } from "@/lib/mergeScale";
export type PackedCells = {
  terrainIds: string[];
  /** Плоский словарь id дорог: по нему же строится словарь roads в ответе. */
  roadIds: string[];
  objectIds: string[];
  decorationIds: string[];
  buildingIds: string[];
  q: number[];
  r: number[];
  /** Индексы в соответствующих словарях; -1 — «ничего нет». */
  t: number[];
  /** Индекс дороги клетки в roadIds; -1 — дороги нет. Дорога ОДНА (map-roads). */
  road: number[];
  obj: number[];
  dec: number[];
  bld: number[];
  /** Индексы клеток (позиции в массивах выше) с уже поверженным объектом. */
  defeated: number[];
  /**
   * Индексы клеток, где показанный объект — БЕГЛЕЦ (server/api/beta-raid/
   * runners.ts). Списком, а не колонкой: беглецов на карте десятки, колонка на
   * все 16 384 клетки весила бы ~32 КБ на каждый вход в рейд.
   *
   * Клиенту он нужен ровно для двух вещей: клетку с беглецом можно ПРОЙТИ
   * (в самой клетке его нет), и админ должен видеть, что объект пришлый.
   */
  runners: number[];
  /**
   * Индексы клеток под глухим туманом. Колонка, а не признак типа местности:
   * купол лежит ПОВЕРХ клетки и ничего под собой не переписывает. Игроку
   * такая клетка приезжает пустой (см. voidSanitize) — стену на клиенте
   * держит сам этот список; админу — вместе со всем содержимым.
   */
  voidFog: number[];
  /**
   * Индексы клеток, на которых стоит РАТУША (см. server/api/beta-raid/
   * town-resolve.ts). Списком, не колонкой: ратуш на карте единицы. Клиенту
   * нужны, чтобы тап прямо по ратуше открывал окно города.
   */
  townHalls: number[];
  /** Словарь id объединённых блоков (режим бога: 2–10 клеток под одной картинкой). */
  groupIds: string[];
  /**
   * Клетка → блок: плоские тройки (индекс клетки, индекс в groupIds, масштаб
   * картинки в процентах 100..200). Списком, а не колонкой: блоков на карте
   * единицы, колонка на все клетки весила бы зря.
   */
  groups: number[];
};

export type RawCell = {
  q: number;
  r: number;
  terrain_id: string | null;
  road_id: string | null;
  object_id: string | null;
  decoration_id: string | null;
  building_id: string | null;
  /** Выбранный облик постройки: клиенту едет он, механика — по building_id. */
  building_skin_id?: string | null;
  /** Флаг купола прямо из SQL (raid_map_cells.void_fog). */
  void_fog?: boolean | string | number | null;
  /** Объединённый блок клетки и масштаб его картинки (numeric из pg — строкой). */
  group_id?: string | null;
  icon_scale?: number | string | null;
};

/**
 * Флаг из SQL булев, но читаем терпимо: ответ проезжает row_to_json и разбор
 * python-repr, где булево уже приезжало строкой. Строгое `=== true` в этом
 * месте не «строже», а тише — оно бы молча открыло зону.
 */
export function isVoidFlag(raw: unknown): boolean {
  return raw === true || raw === 1 || raw === "t" || raw === "true" || raw === "1";
}

export function packCells(
  rows: RawCell[],
  /** Дорога клетки из колонки road_id — общий разбор (map-roads.cellRoadId). */
  cellRoadId: (raw: string | null) => string | null,
  isDefeated: (key: string) => boolean,
  /** Показанный объект клетки — беглец из своего слоя (map-runners). */
  isRunner: (key: string) => boolean = () => false,
  /** Постройка клетки — ратуша: индекс уходит в townHalls (town-resolve). */
  isTownHall: (key: string) => boolean = () => false,
): PackedCells {
  const pools = {
    terrainIds: [] as string[],
    roadIds: [] as string[],
    objectIds: [] as string[],
    decorationIds: [] as string[],
    buildingIds: [] as string[],
    groupIds: [] as string[],
  };
  const seen = {
    terrainIds: new Map<string, number>(),
    roadIds: new Map<string, number>(),
    objectIds: new Map<string, number>(),
    decorationIds: new Map<string, number>(),
    buildingIds: new Map<string, number>(),
    groupIds: new Map<string, number>(),
  };
  type Pool = keyof typeof pools;
  const idx = (pool: Pool, id: string | null): number => {
    if (!id) return -1;
    const hit = seen[pool].get(id);
    if (hit != null) return hit;
    const n = pools[pool].length;
    pools[pool].push(id);
    seen[pool].set(id, n);
    return n;
  };

  const out: PackedCells = {
    ...pools,
    q: [],
    r: [],
    t: [],
    road: [],
    obj: [],
    dec: [],
    bld: [],
    defeated: [],
    runners: [],
    voidFog: [],
    townHalls: [],
    groups: [],
  };
  for (const c of rows) {
    const i = out.q.length;
    out.q.push(c.q);
    out.r.push(c.r);
    out.t.push(idx("terrainIds", c.terrain_id));
    out.road.push(idx("roadIds", cellRoadId(c.road_id)));
    out.obj.push(idx("objectIds", c.object_id));
    out.dec.push(idx("decorationIds", c.decoration_id));
    // В пул кладём ОБЛИК: у клетки со скином клиент рисует его картинку и имя,
    // а сервер по-прежнему решает всё по building_id.
    out.bld.push(
      idx("buildingIds", c.building_skin_id ? skinKey(c.building_skin_id) : c.building_id),
    );
    if (c.object_id && isDefeated(`${c.q},${c.r}`)) out.defeated.push(i);
    if (c.object_id && isRunner(`${c.q},${c.r}`)) out.runners.push(i);
    if (isVoidFlag(c.void_fog)) out.voidFog.push(i);
    if (c.building_id && isTownHall(`${c.q},${c.r}`)) out.townHalls.push(i);
    // Объединённый блок: id блока + масштаб картинки процентами (100 = как есть).
    if (c.group_id) {
      const pct = Math.round(clampIconScale(Number(c.icon_scale ?? 1)) * 100);
      out.groups.push(i, idx("groupIds", c.group_id), pct);
    }
  }
  return out;
}
