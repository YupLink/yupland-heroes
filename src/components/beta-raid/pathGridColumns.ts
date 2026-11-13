// Раскладка карты под поиск пути — прямо по колонкам снимка (mapStore).
//
// Сетка пути пересобирается на каждое событие живой карты (чужой бой, беглец:
// новый store — новая сетка), а первый тап после события ждал её целиком. Через
// объект клетки (cellInto: десять полей и поиск по наборам на каждую из 82 тыс.
// клеток) и строковые словари местности это было ~75 мс на тап при CPU ×12
// (замер на проде 23.10.2026) — на телефоне тап по карте «подвисал».
// Здесь те же правила (hexPassable.walkable, hexStepCost.cellBaseCost), но
// по номерам: что значит каждый номер словаря, считается один раз на словарь.
import type { MapStore } from "./mapStore";
import type { TerrainInfo } from "./hexStepCost";
import { bridgeAxes } from "@/lib/raid/bridgeTransit";

export type GridCells = {
  walk: Uint8Array;
  water: Uint8Array;
  ocean: Uint8Array;
  bridgeDeck: Uint8Array;
  bridgeChannel: Uint8Array;
  base: Float64Array;
  minBase: number;
};

/** Проходимость, вода, океан и цена клеток в сетку slot = (q-minQ)*rows + (r-minR). */
export function fillFromColumns(
  store: MapStore,
  terrains: Record<string, TerrainInfo>,
  roads: Record<string, TerrainInfo> | undefined,
  waterIds: Set<string>,
  oceanIds: Set<string>,
  decorations: Record<string, { bridge?: unknown }> | undefined,
  grid: { minQ: number; minR: number; rows: number; size: number },
): GridCells {
  const p = store.packed;
  // Что значит каждый номер словаря — один раз на словарь, а не на клетку.
  const tIds = p.terrainIds;
  const tHas = tIds.map((id) => !!id);
  const tWater = tIds.map((id) => waterIds.has(id ?? ""));
  const tOcean = tIds.map((id) => oceanIds.has(id ?? ""));
  const tCost = tIds.map((id) => (id ? terrains[id] : null)?.cost ?? 1);
  // Дорога с именем — её цена (или 1); без имени — цена местности (cellBaseCost).
  const rCost = p.roadIds.map((id) => (id ? roads?.[id]?.cost || 1 : -1));
  const bridges = p.decorationIds.map((id) => bridgeAxes(id ? decorations?.[id]?.bridge : null));
  const objOn = p.objectIds.map((id) => !!id);
  const { dead, runners, dome, mines } = store;

  const walk = new Uint8Array(grid.size);
  const water = new Uint8Array(grid.size);
  const ocean = new Uint8Array(grid.size);
  const bridgeDeck = new Uint8Array(grid.size);
  const bridgeChannel = new Uint8Array(grid.size);
  const base = new Float64Array(grid.size);
  let minBase = Infinity;
  for (let i = 0; i < store.n; i++) {
    const idx = (p.q[i] - grid.minQ) * grid.rows + (p.r[i] - grid.minR);
    const t = p.t[i];
    const dec = p.dec[i];
    const bridge = dec >= 0 && t >= 0 && tWater[t] ? bridges[dec] : null;
    if (bridge) {
      bridgeDeck[idx] = bridge.deckAxis + 1;
      bridgeChannel[idx] = bridge.channelAxis + 1;
    }
    const obj = p.obj[i];
    // hexPassable.walkable: местность, нет декора и шахты, нет живого
    // объекта (беглец прохода не держит), нет купола.
    const blocked =
      (dec >= 0 && !bridge && !!p.decorationIds[dec]) ||
      mines.has(i) ||
      (obj >= 0 && objOn[obj] && !dead.has(i) && !runners.has(i)) ||
      dome.has(i);
    if (t >= 0 && tHas[t] && !blocked) walk[idx] = 1;
    const isWater = t >= 0 && tWater[t];
    if (isWater) water[idx] = 1;
    if (t >= 0 && tOcean[t]) ocean[idx] = 1;
    const rd = p.road[i];
    const roadCost = rd >= 0 ? rCost[rd] : -1;
    const cost = roadCost >= 0 ? roadCost : t >= 0 ? tCost[t] : 1;
    base[idx] = cost;
    // Вода в минимум не идёт (pathGrid): её цена — гребок, он отдельно.
    if ((!isWater || bridge) && cost < minBase) minBase = cost;
  }
  return { walk, water, ocean, bridgeDeck, bridgeChannel, base, minBase };
}
