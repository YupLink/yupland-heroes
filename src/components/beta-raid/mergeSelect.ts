// Чистая арифметика объединения клеток на карте рейда (аксиальные координаты).
//
// Замок Ангелины считает соседство в odd-r сетке (castle-editor/hexGeom) —
// здесь карта аксиальная, соседи — ROAD_DIRS. Не импортировать одно в другое.
import { ROAD_DIRS } from "./hexGeometry";
import type { PackedCells } from "./unpackMap";
import { readCellDetails, type MapLike } from "./patchMapCache";
import type { CellPatch } from "@/lib/raid/mapDelta";

export const keyOf = (q: number, r: number): string => `${q},${r}`;

export function parseKey(key: string): [number, number] {
  const [q, r] = key.split(",").map(Number);
  return [q, r];
}

/** Все ли клетки набора связаны через соседей (один сплошной блок). */
export function isConnectedAxial(keys: string[]): boolean {
  if (keys.length === 0) return false;
  const set = new Set(keys);
  const seen = new Set<string>([keys[0]]);
  const stack = [keys[0]];
  while (stack.length) {
    const [q, r] = parseKey(stack.pop()!);
    for (const d of ROAD_DIRS) {
      const n = keyOf(q + d.q, r + d.r);
      if (set.has(n) && !seen.has(n)) {
        seen.add(n);
        stack.push(n);
      }
    }
  }
  return seen.size === set.size;
}

/** Клетки блока по id — из плоских троек колонок карты. */
export function membersOfGroup(packed: PackedCells, gid: string): string[] {
  const flat = packed.groups ?? [];
  const ids = packed.groupIds ?? [];
  const out: string[] = [];
  for (let k = 0; k + 2 < flat.length; k += 3) {
    if (ids[flat[k + 1]] === gid) out.push(keyOf(packed.q[flat[k]], packed.r[flat[k]]));
  }
  return out;
}

/** Масштаб блока по id (первая попавшаяся тройка); 1 — блока нет. */
export function scaleOfGroup(packed: PackedCells, gid: string): number {
  const flat = packed.groups ?? [];
  const ids = packed.groupIds ?? [];
  for (let k = 0; k + 2 < flat.length; k += 3) {
    if (ids[flat[k + 1]] === gid) return flat[k + 2] / 100;
  }
  return 1;
}

/**
 * Новый id блока. Без nanoid: на рейде он транзитивная зависимость, а
 * черновик (adminDraftStore) свои id тоже собирает из времени и случайности.
 */
export function newGroupId(): string {
  return `g_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** Слои, которых в блоке по одному: кисть этих видов по члену блока проверяется. */
export const BLOCK_ONE_PER: Partial<Record<string, "buildingId" | "decorationId">> = {
  building: "buildingId",
  decoration: "decorationId",
};

/** Есть ли у блока слой (постройка/декор) на ДРУГОЙ клетке — кисть по члену. */
export function blockHasOtherLayer(
  map: MapLike,
  q: number,
  r: number,
  gid: string,
  field: "buildingId" | "decorationId",
): boolean {
  if (!map?.packed) return false;
  const self = keyOf(q, r);
  return membersOfGroup(map.packed, gid).some((key) => {
    if (key === self) return false;
    const [mq, mr] = parseKey(key);
    return !!readCellDetails(map, mq, mr)[field];
  });
}

type Layer = "buildingId" | "decorationId";

/** Что едет вместе со слоем: постройка — с обликом, тиром и настройками. */
const WITH: Record<Layer, Array<keyof CellPatch>> = {
  buildingId: ["buildingId", "buildingSkinId", "tier", "buildingConfig"],
  decorationId: ["decorationId"],
};

/**
 * Убрать из правки постройку/декор, если у блока этот слой уже стоит на другой
 * клетке. null — в правке ничего не осталось (класть в очередь нечего).
 * Постройка уходит со своим обликом: облик без неё лёг бы на клетку
 * «призраком» — картинкой постройки, которой нет.
 */
export function stripBlockedLayers(map: MapLike, gid: string, patch: CellPatch): CellPatch | null {
  let p: Record<string, unknown> = { ...patch };
  for (const field of ["buildingId", "decorationId"] as const) {
    if (!p[field] || !blockHasOtherLayer(map, patch.q, patch.r, gid, field)) continue;
    for (const k of WITH[field]) p = { ...p, [k]: undefined };
  }
  const left = Object.keys(p).some((k) => k !== "q" && k !== "r" && p[k] !== undefined);
  return left ? (p as CellPatch) : null;
}

/** Клетка блока, где стоит его постройка/декор (картинка на весь блок — с неё). */
export function blockLayerHolder(
  map: MapLike,
  gid: string,
  field: Layer,
): { q: number; r: number } | null {
  if (!map?.packed) return null;
  for (const key of membersOfGroup(map.packed, gid)) {
    const [q, r] = parseKey(key);
    if (readCellDetails(map, q, r)[field]) return { q, r };
  }
  return null;
}

/**
 * Правка постройки/декора по ЛЮБОЙ клетке блока — туда, где этот слой стоит.
 * Картинка блока одна и «стоит» на нижней клетке, а постройка живёт на ведущей:
 * тап по картинке чаще попадает в соседку. Раньше ластик там ничего не стирал,
 * а кисть отказывала — «не удаляется и не меняется» (владелец, 05.10.2026).
 * Вернёт правки: перенаправленные слои и остаток по самой клетке.
 */
export function routeBlockPatch(
  map: MapLike,
  gid: string | null | undefined,
  patch: CellPatch,
): CellPatch[] {
  if (!gid) return [patch];
  const out: CellPatch[] = [];
  let own: Record<string, unknown> = { ...patch };
  for (const field of ["buildingId", "decorationId"] as const) {
    const moved = WITH[field].filter((k) => own[k] !== undefined);
    const h = moved.length ? blockLayerHolder(map, gid, field) : null;
    if (!h || (h.q === patch.q && h.r === patch.r)) continue;
    const to: Record<string, unknown> = { q: h.q, r: h.r };
    for (const k of moved) {
      to[k] = own[k];
      own = { ...own, [k]: undefined };
    }
    out.push(to as CellPatch);
  }
  const left = Object.keys(own).some((k) => k !== "q" && k !== "r" && own[k] !== undefined);
  return left ? [...out, own as CellPatch] : out;
}

/**
 * Окно клетки по члену блока без своего (объекта, декора, постройки) — окно
 * постройки блока, как и в игре (mergeBlocks.leadForTap): иначе админ видел
 * пустую соседку и не мог ни убрать, ни настроить то, что нарисовано. Нет
 * постройки — окно декора блока: его картинка тоже на весь блок.
 */
export function blockInspectCell(map: MapLike, q: number, r: number): { q: number; r: number } {
  const d = readCellDetails(map, q, r);
  if (!d.groupId || d.buildingId || d.objectId || d.decorationId) return { q, r };
  return (
    blockLayerHolder(map, d.groupId, "buildingId") ??
    blockLayerHolder(map, d.groupId, "decorationId") ?? { q, r }
  );
}
