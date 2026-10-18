// Битовая маска дорог: для каждой клетки с дорогой — какие из шести
// соседей несут ТУ ЖЕ дорогу (roadRibbonCache склеивает ленту по маске).
// Считается один раз на снимок, лениво — при первом кадре с дорогами.
import type { MapStore } from "./mapStore";
import { pruneRoadMask } from "./roadPrune";

/** Направления соседей — те же, что ROAD_DIRS в hexGeometry (pointy-top). */
const DIRS = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

export function buildRoadMasks(s: MapStore): Uint8Array {
  const raw = buildRawMasks(s);
  const out = new Uint8Array(s.n);
  const p = s.packed;
  for (let i = 0; i < s.n; i++) {
    if (!raw[i]) continue;
    out[i] = pruneRoadMask(raw[i], (d) => {
      const j = s.index(p.q[i] + DIRS[d].q, p.r[i] + DIRS[d].r);
      return j >= 0 ? raw[j] : 0;
    });
  }
  return out;
}

/** Все соседи с той же дорогой — до снятия срезок (roadPrune). */
function buildRawMasks(s: MapStore): Uint8Array {
  const out = new Uint8Array(s.n);
  const p = s.packed;
  for (let i = 0; i < s.n; i++) {
    const rd = p.road[i];
    if (rd < 0) continue;
    let mask = 0;
    for (let d = 0; d < DIRS.length; d++) {
      const j = s.index(p.q[i] + DIRS[d].q, p.r[i] + DIRS[d].r);
      if (j >= 0 && p.road[j] === rd) mask |= 1 << d;
    }
    out[i] = mask;
  }
  return out;
}
