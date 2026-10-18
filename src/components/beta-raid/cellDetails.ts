// Состав клетки по данным кэша карты: слои, тир, метки, блок.
//
// Вынесено из patchMapCache.ts (правило ≤250 строк): там остаётся наложение
// правок, здесь — чтение «что на клетке» для окна клетки, кисти и снимка отмены.
import type { PackedCells } from "./unpackMap";
import { buildGroupByIdx } from "./packedLookups";
import { cellIndex } from "./cellIndex";
import type { MapLike } from "./patchMapCache";
import type { CellPatch } from "@/lib/raid/mapDelta";

/** Полный состав клетки по данным кэша: слои, тир постройки, повержен ли объект. */
export type CellDetails = {
  terrainId: string | null;
  roadId: string | null;
  decorationId: string | null;
  objectId: string | null;
  buildingId: string | null;
  /** Текущий тир постройки на клетке (0 — только заложена). */
  tier: number;
  /** Объект на клетке уже добыт. */
  defeated: boolean;
  /** Показанный объект — беглец: он на клетке прячется, а не стоит в ней. */
  runner: boolean;
  /** Клетка накрыта куполом глухого тумана. */
  voidFog: boolean;
  /** Объединённый блок (режим бога): id блока, null — одиночная клетка. */
  groupId: string | null;
  /** Масштаб картинки блока (1 … 2); null — блока нет. */
  iconScale: number | null;
};

/** Невыгруженное: что положить на клетку и какой она была до правок. */
export type DraftState = {
  queue: Record<string, CellPatch>;
  base: Record<string, CellDetails>;
};

const EMPTY_CELL: CellDetails = {
  terrainId: null,
  roadId: null,
  decorationId: null,
  objectId: null,
  buildingId: null,
  tier: 0,
  defeated: false,
  runner: false,
  voidFog: false,
  groupId: null,
  iconScale: null,
};

const idAt = (pool: string[], at: number): string | null => (at >= 0 ? (pool[at] ?? null) : null);

function detailsAt(p: PackedCells, i: number, tier: number): CellDetails {
  // Блоков на карте единицы — тройки короткие, разбор на каждый вызов дёшев.
  const grp = buildGroupByIdx(p).get(i);
  return {
    terrainId: idAt(p.terrainIds, p.t[i]),
    // Та же дорога, что нарисована: колонка `road` — индекс в roadIds, и окно
    // клетки снимает ровно её (см. AdminCellState).
    roadId: idAt(p.roadIds, p.road[i]),
    decorationId: idAt(p.decorationIds, p.dec[i]),
    objectId: idAt(p.objectIds, p.obj[i]),
    buildingId: idAt(p.buildingIds, p.bld[i]),
    tier,
    defeated: p.defeated.includes(i),
    runner: (p.runners ?? []).includes(i),
    voidFog: (p.voidFog ?? []).includes(i),
    groupId: grp?.id ?? null,
    iconScale: grp ? grp.scale : null,
  };
}

/**
 * Что на клетке ПО КЭШУ, а не по серверу. Кэш уже содержит невыгруженные
 * правки кисти — поэтому окно клетки видит только что поставленную табличку,
 * не дожидаясь кнопки «Выгрузить».
 *
 * Клетка ищется индексом (cellIndex), а не перебором колонок: окно клетки
 * зовёт это на каждый свой рендер, и каждый такой рендер стоил прохода по
 * всем 16 384 клеткам.
 */
export function readCellDetails(old: MapLike, q: number, r: number): CellDetails {
  if (!old?.packed) return EMPTY_CELL;
  const p = old.packed;
  const tier = old.buildingTiers?.[`${q},${r}`] ?? 0;
  const i = cellIndex(p).get(`${q},${r}`);
  return i === undefined ? { ...EMPTY_CELL, tier } : detailsAt(p, i, tier);
}

/** Состав сразу многих клеток — по тому же индексу, без прохода по колонкам. */
export function readManyCells(old: MapLike, keys: string[]): Record<string, CellDetails> {
  const out: Record<string, CellDetails> = {};
  const p = old?.packed;
  const at = p ? cellIndex(p) : null;
  for (const key of keys) {
    const tier = old?.buildingTiers?.[key] ?? 0;
    const i = at?.get(key);
    out[key] = p && i !== undefined ? detailsAt(p, i, tier) : { ...EMPTY_CELL, tier };
  }
  return out;
}
