// Несколько поселений в одной зоне: где их центры и чьи клетки.
//
// Органический рост (lib/raid/zonegen/town) выращивает ОДНО поселение на
// переданных клетках. Рецепт же может просить до двенадцати. Делим зону по
// спецификации, шаг 2 (docs/town-generation-algorithm.json): центры — дальней
// точкой (как объекты HoMM3 RMG), клетки — по Вороному, к ближайшему центру.
// Минимальный шаг между центрами — max(2Rb+3, √(площадь/число)): два города
// ближе этого срослись бы окраинами (правило плотности HoMM3; у Кристаллера
// малые места стоят на дорогах между большими, а не вплотную к ним).
//
// Чисто: ни базы, ни Math.random. Ничьи — хешем клетки, а не порядком обхода.
import { hexDistance } from "@/lib/raid/hex";
import type { ZoneCell } from "@/lib/raid/zonegen/recipe";
// Тот же хеш ничьих, что у самого роста: один сид — один выбор везде.
import { hashCell } from "@/lib/raid/zonegen/town/hex";

/**
 * Радиус застройки Rb по числу построек — таблица шага 2 спецификации:
 * доля застройки ρ(N) = 0.22·(N/3)^0.25 ≤ 0.42, Rb — наименьший R, при
 * котором гекс A(R) = 3R²+3R+1 вмещает N·(1/ρ). Итог — ступени 3–4 → 2,
 * 5–11 → 3, 12–21 → 4, 22–32 → 5, 33–40 → 6.
 */
export function townRadius(buildings: number): number {
  if (buildings <= 4) return 2;
  if (buildings <= 11) return 3;
  if (buildings <= 21) return 4;
  if (buildings <= 32) return 5;
  return 6;
}

/** Индекс клетки с наименьшей оценкой; ничья — хешем клетки, не порядком (шаг 0). */
function argBest(
  list: ZoneCell[],
  score: (c: ZoneCell, i: number) => number,
  seed: number,
): number {
  let at = 0;
  let best = score(list[0], 0);
  for (let i = 1; i < list.length; i++) {
    const v = score(list[i], i);
    const tie =
      v === best && hashCell(seed, list[i].q, list[i].r) < hashCell(seed, list[at].q, list[at].r);
    if (v < best || tie) {
      at = i;
      best = v;
    }
  }
  return at;
}

function centroid(cells: ZoneCell[]): ZoneCell {
  let q = 0;
  let r = 0;
  for (const c of cells) {
    q += c.q;
    r += c.r;
  }
  return { q: Math.round(q / cells.length), r: Math.round(r / cells.length) };
}

/** Ближайший центр; ничья — меньший номер (раньше поставленный). */
function nearestCenter(c: ZoneCell, centers: ZoneCell[]): number {
  let at = 0;
  let best = Infinity;
  centers.forEach((m, i) => {
    const d = hexDistance(c.q, c.r, m.q, m.r);
    if (d < best) {
      at = i;
      best = d;
    }
  });
  return at;
}

/**
 * Центры дальней точкой. Первый — самая дальняя от середины суша: начни с
 * середины, и на круглой зоне второй встал бы на край, а третьему уже не
 * хватило бы шага. Дальше каждый — максимум расстояния до ближайшего, пока
 * это расстояние не меньше minGap.
 */
function farthestCenters(
  land: ZoneCell[],
  count: number,
  minGap: number,
  seed: number,
): ZoneCell[] {
  const mid = centroid(land);
  const first = land[argBest(land, (c) => -hexDistance(c.q, c.r, mid.q, mid.r), seed)];
  const centers = [first];
  const near = land.map((c) => hexDistance(c.q, c.r, first.q, first.r));
  while (centers.length < count) {
    const at = argBest(land, (_, i) => -near[i], seed);
    if (near[at] < minGap) break;
    const c = land[at];
    centers.push(c);
    for (let i = 0; i < land.length; i++) {
      const d = hexDistance(land[i].q, land[i].r, c.q, c.r);
      if (d < near[i]) near[i] = d;
    }
  }
  return centers;
}

/**
 * Дальняя точка ставит центры на край зоны — два шага Ллойда сдвигают каждый в
 * середину своего участка (на ближайшую сушу), чтобы городу было куда расти
 * во все стороны. Сдвиг мог сблизить соседей: ближе 2Rb+3 — младший уходит.
 */
function relaxCenters(
  land: ZoneCell[],
  start: ZoneCell[],
  hardGap: number,
  seed: number,
): ZoneCell[] {
  let centers = start;
  for (let step = 0; step < 2; step++) {
    const groups: ZoneCell[][] = centers.map(() => []);
    for (const c of land) groups[nearestCenter(c, centers)].push(c);
    centers = centers.map((m, i) => {
      const g = groups[i];
      if (g.length === 0) return m;
      const mid = centroid(g);
      return g[argBest(g, (c) => hexDistance(c.q, c.r, mid.q, mid.r), seed)];
    });
  }
  const kept: ZoneCell[] = [];
  for (const c of centers) {
    if (kept.every((k) => hexDistance(k.q, k.r, c.q, c.r) >= hardGap)) kept.push(c);
  }
  return kept;
}

/**
 * Разрезать зону на участки поселений. Вода и занятые клетки едут в участок
 * вместе с сушей: порт узнаёт берег по своим клеткам, а рост сам не строит на
 * том, что занято. Не влезло столько центров — участков меньше, чем просили.
 */
export function splitZone(args: {
  cells: ZoneCell[];
  isLand: (key: string) => boolean;
  count: number;
  buildings: number;
  seed: number;
}): ZoneCell[][] {
  const land = args.cells.filter((c) => args.isLand(`${c.q},${c.r}`));
  if (args.count <= 1 || land.length === 0) return [args.cells];
  const rb = townRadius(args.buildings);
  const minGap = Math.max(2 * rb + 3, Math.sqrt(land.length / args.count));
  const rough = farthestCenters(land, args.count, minGap, args.seed);
  if (rough.length === 1) return [args.cells];
  const centers = relaxCenters(land, rough, 2 * rb + 3, args.seed);
  if (centers.length === 1) return [args.cells];
  const parts: ZoneCell[][] = centers.map(() => []);
  for (const c of args.cells) parts[nearestCenter(c, centers)].push(c);
  return parts;
}
