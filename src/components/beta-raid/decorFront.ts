// Декор переднего ряда закрывает то, что стоит за ним (владелец, 09.10.2026:
// «кружочек от боссов находит поверх декора, хотя находится ниже»).
//
// Декор запечён в статичный слой (chunkBake) и лежит ПОД всем, что рисуется
// покадрово: объекты, их кружки, постройки, лагеря. Поэтому босс заднего ряда
// ложился поверх дерева или камня переднего. Клетки обходятся сверху вниз,
// так что достаточно перед содержимым клетки положить её декор ещё раз, если
// выше неё стоит что-то покадровое, — он накроет то, что за ним, а своё
// содержимое клетки ляжет уже поверх. Та же drawDecoration, что и в куске:
// пиксель в пиксель, без сдвига.
import type { DrawScene } from "./betaCanvasScene";
import type { MapStore } from "./mapStore";

/**
 * Клетки, чьё содержимое может уйти под декор этой: обе соседки рядом выше и
 * клетка строго над ней через ряд (высокий декор — камни, деревья — достаёт и
 * туда). Соседи по ряду стоят в 1,7R сбоку — их кружок до декора не дотягивается.
 */
const ABOVE: ReadonlyArray<readonly [number, number]> = [
  [0, -1],
  [1, -1],
  [1, -2],
];

export function hasContentAbove(scene: DrawScene, store: MapStore, q: number, r: number): boolean {
  const p = store.packed;
  for (const [dq, dr] of ABOVE) {
    const j = store.index(q + dq, r + dr);
    if (j < 0) continue;
    if (p.obj[j] >= 0 || (p.bld?.[j] ?? -1) >= 0) return true;
    if (scene.players.size || scene.ships.size || scene.magicChests) {
      const key = `${q + dq},${r + dr}`;
      if (scene.players.has(key) || scene.ships.has(key) || scene.magicChests?.[key]) return true;
    }
  }
  return false;
}
