// Карта, разложенная под поиск пути: клетка → номер в плоской сетке.
//
// Поиск ходит по клеткам десятками тысяч раз за тап, и раньше на каждый шаг
// собирал строку "q,r", лез с ней в объект клеток, в словарь местности и в
// карту причалов. Замер на «Мире Альфа»: перебор компоненты — 27 мс на строках
// против 1.5 мс на числах. Поэтому всё, что не меняется от тапа к тапу,
// раскладывается сюда один раз: проходимость, вода и цена клетки лежат
// массивами, а клетка адресуется числом.
//
// Кэш живёт на ссылке объекта клеток: unpackCells отдаёт НОВЫЙ объект на каждое
// изменение карты (правка админа, чужая добыча объекта), поэтому устареть
// раскладке не на чем.
import { isWaterName, isOceanName } from "@/lib/shipRules";
import { walkable } from "./hexPassable";
import { cellBaseCost, type CellInfo, type TerrainInfo } from "./hexStepCost";
import { storeOf } from "./mapStore";
import { fillFromColumns } from "./pathGridColumns";
import { bridgeAxes } from "@/lib/raid/bridgeTransit";

export type PathGrid = {
  /** Размер сетки: она накрывает все клетки карты с запасом в ноль. */
  cols: number;
  rows: number;
  size: number;
  /** Левый верхний угол сетки в координатах карты. */
  minQ: number;
  minR: number;
  /** Проходима сама по себе: есть местность, нет декора, объекта и купола. */
  walk: Uint8Array;
  /** Вода — в неё входят только гребком или посадкой. */
  water: Uint8Array;
  /** Океан — глубокая вода: пройдёт только большой корабль. */
  ocean: Uint8Array;
  bridgeDeck: Uint8Array;
  bridgeChannel: Uint8Array;
  /** Цена самой клетки (дорога или местность) — ДО скидок и надбавок. */
  base: Float64Array;
  /** Самая дешёвая клетка карты — нижняя граница для оценки остатка. */
  minBase: number;
  /** Номер клетки в сетке; −1 — за её краем (там карты нет). */
  slot(q: number, r: number): number;
  /** Обратно из номера в координаты. */
  q(slot: number): number;
  r(slot: number): number;
};

type Entry = { terrains: object; roads: object | undefined; decorations: object | undefined; grid: PathGrid };

const cache = new WeakMap<object, Entry>();

export function pathGrid(
  cells: Record<string, CellInfo>,
  terrains: Record<string, TerrainInfo>,
  roads: Record<string, TerrainInfo> | undefined,
  decorations?: Record<string, { bridge?: unknown }>,
): PathGrid {
  const hit = cache.get(cells);
  if (hit && hit.terrains === terrains && hit.roads === roads && hit.decorations === decorations) return hit.grid;
  const grid = build(cells, terrains, roads, decorations);
  cache.set(cells, { terrains, roads, decorations, grid });
  return grid;
}

function build(
  cells: Record<string, CellInfo>,
  terrains: Record<string, TerrainInfo>,
  roads: Record<string, TerrainInfo> | undefined,
  decorations?: Record<string, { bridge?: unknown }>,
): PathGrid {
  // Имена местности прогоняем через регулярку ОДИН раз на словарь, а не на
  // каждую из 16 384 клеток.
  const waterIds = new Set<string>();
  const oceanIds = new Set<string>();
  for (const id in terrains) {
    if (isWaterName(terrains[id].name)) waterIds.add(id);
    if (isOceanName(terrains[id].name)) oceanIds.add(id);
  }

  // Карта колонками (mapStore): координаты и клетки читаются по номеру, без
  // 82 тысяч строк-ключей и объектов на каждую пересборку. Старый путь по
  // словарю оставлен для карт, собранных не из снимка (тесты, редактор).
  const store = storeOf(cells);
  const n = store ? store.n : 0;
  const keys = store ? null : Object.keys(cells);
  const count = store ? n : keys!.length;
  const qs = new Int32Array(count);
  const rs = new Int32Array(count);
  let minQ = 0;
  let minR = 0;
  let maxQ = 0;
  let maxR = 0;
  for (let i = 0; i < count; i++) {
    let q: number;
    let r: number;
    if (store) {
      q = store.packed.q[i];
      r = store.packed.r[i];
    } else {
      const key = keys![i];
      const comma = key.indexOf(",");
      q = Number(key.slice(0, comma));
      r = Number(key.slice(comma + 1));
    }
    qs[i] = q;
    rs[i] = r;
    if (i === 0 || q < minQ) minQ = q;
    if (i === 0 || q > maxQ) maxQ = q;
    if (i === 0 || r < minR) minR = r;
    if (i === 0 || r > maxR) maxR = r;
  }

  const cols = count ? maxQ - minQ + 1 : 1;
  const rows = count ? maxR - minR + 1 : 1;
  const size = cols * rows;
  const slots = {
    slot: (q: number, r: number) => {
      const x = q - minQ;
      const y = r - minR;
      return x < 0 || y < 0 || x >= cols || y >= rows ? -1 : x * rows + y;
    },
    q: (slot: number) => ((slot / rows) | 0) + minQ,
    r: (slot: number) => (slot % rows) + minR,
  };
  // Снимок карты — по колонкам, без объекта клетки на каждую (pathGridColumns).
  if (store) {
    const filled = fillFromColumns(store, terrains, roads, waterIds, oceanIds, decorations, { minQ, minR, rows, size });
    const minBase = Number.isFinite(filled.minBase) ? filled.minBase : 1;
    return { cols, rows, size, minQ, minR, ...filled, minBase, ...slots };
  }
  const walk = new Uint8Array(size);
  const water = new Uint8Array(size);
  const ocean = new Uint8Array(size);
  const bridgeDeck = new Uint8Array(size);
  const bridgeChannel = new Uint8Array(size);
  const base = new Float64Array(size);
  let minBase = Infinity;
  // Словарь без снимка (тесты, редактор) — по объектам клеток.
  for (let i = 0; i < count; i++) {
    const idx = (qs[i] - minQ) * rows + (rs[i] - minR);
    const cell: CellInfo = cells[keys![i]];
    const isWater = waterIds.has(cell.terrainId ?? "");
    const bridge = isWater && bridgeAxes(cell.decorationId ? decorations?.[cell.decorationId]?.bridge : null);
    if (walkable(bridge ? { ...cell, decorationId: undefined } : cell)) walk[idx] = 1;
    if (bridge) {
      bridgeDeck[idx] = bridge.deckAxis + 1;
      bridgeChannel[idx] = bridge.channelAxis + 1;
    }
    if (isWater) water[idx] = 1;
    if (oceanIds.has(cell.terrainId ?? "")) ocean[idx] = 1;
    const cost = cellBaseCost(cell, terrains, roads);
    base[idx] = cost;
    // Вода в минимум не идёт: её цена — не цена клетки, а гребок, и он
    // учитывается отдельно (pathBounds).
    if ((!isWater || bridge) && cost < minBase) minBase = cost;
  }

  return {
    cols,
    rows,
    size,
    minQ,
    minR,
    walk,
    water,
    ocean,
    bridgeDeck,
    bridgeChannel,
    base,
    minBase: Number.isFinite(minBase) ? minBase : 1,
    ...slots,
  };
}
