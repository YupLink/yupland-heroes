// Города острова (владелец, 21.10.2026: «должно быть несколько городов»):
// главный — хутор задания у центра (его ратуша — замок задания), ещё два — по
// разные стороны острова, размер — по правилу генератора мира (townSize: город,
// деревня или порт). В мире на такую площадь суши приходится ~2 города (37 на
// 25 тыс. клеток «Мира Альфа»); три — чтобы было куда сходить.
import { townSize, type TownSite } from "@/lib/raid/worldgen/sites";
import { unit } from "@/lib/raid/worldgen/rand";
import { DIRS, hashCell } from "@/lib/raid/zonegen/town/hex";
import type { World } from "@/lib/raid/worldgen/field";
import type { Cell } from "@/lib/raid/worldgen/geo";

/** Построек в главном городе острова: хутор с ратушей и лавкой. */
export const ISLAND_TOWN_SIZE = 9;
/** Главный город сдвинут от центра: на другой стороне острова — дикая земля задания. */
const TOWN_SHIFT = 4;
/** Прочих городов — и как далеко от центра (суша — радиус 22). */
export const ISLAND_EXTRA_TOWNS = 2;
const EXTRA_SHIFT = 13;

/** Места городов: первый — главный (задание), дальше — прочие. */
export function islandTownSites(w: World, center: Cell, seed: number): TownSite[] {
  const d0 = hashCell(seed, 5, 5) % DIRS.length;
  const at = (dir: number, shift: number): Cell => {
    const [dq, dr] = DIRS[dir % DIRS.length];
    return { q: center.q + dq * shift, r: center.r + dr * shift };
  };
  const main: TownSite = {
    ...at(d0, TOWN_SHIFT),
    i: 0,
    j: 0,
    key: "isle",
    n: ISLAND_TOWN_SIZE,
    seed: hashCell(w.seeds.town, 0, 0),
  };
  const extra = Array.from({ length: ISLAND_EXTRA_TOWNS }, (_, k): TownSite => {
    const i = k + 1;
    return {
      // Прочие — через одно направление от главного: 120° и 240° вокруг центра.
      ...at(d0 + 2 * i, EXTRA_SHIFT),
      i,
      j: 0,
      key: `isle${i}`,
      n: townSize(unit(hashCell(seed, 7 + i, 1)), unit(hashCell(seed, 7 + i, 2))),
      seed: hashCell(w.seeds.town, i, 0),
    };
  });
  return [main, ...extra];
}
