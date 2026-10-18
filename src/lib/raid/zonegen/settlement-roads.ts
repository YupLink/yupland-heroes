// Дороги поселения: связать дворы между собой, не разводя лишней грязи.
//
// Считаем 0-1-обходом в ширину (Дейкстра для весов 0 и 1): новая клетка
// дороги стоит 1, а чужая клетка — 0, если там уже лежит дорога зоны, стоит
// постройка или дорога, положенная этим же планом. Отсюда и вид улиц: второй
// двор тянется не напрямик, а прилипает к первой тропе — как деревня и растёт.
import { cellKey, HEX_DIRS } from "@/lib/raid/zonegen/settlement-place";
import type { ZoneCell } from "@/lib/raid/zonegen/recipe";

/** "q,r" → числа: обход живёт на ключах, соседей считать надо в координатах. */
function parseKey(k: string): { q: number; r: number } {
  const i = k.indexOf(",");
  return { q: Number(k.slice(0, i)), r: Number(k.slice(i + 1)) };
}

/** Восстановить путь от цели к старту по «откуда пришли». */
function trace(prev: Map<string, string | null>, to: string): string[] {
  const path: string[] = [];
  let at: string | null = to;
  while (at !== null) {
    path.push(at);
    at = prev.get(at) ?? null;
  }
  return path.reverse();
}

/**
 * Самый дешёвый путь от start до ближайшей клетки targets внутри area.
 * Два ведра вместо очереди с приоритетом: весов всего два, и «бесплатные»
 * клетки остаются в текущем ведре, а платные уезжают в следующее.
 */
function cheapestPath(
  start: string,
  targets: Set<string>,
  area: Set<string>,
  free: (k: string) => boolean,
): string[] | null {
  if (targets.has(start)) return [start];
  const dist = new Map<string, number>([[start, 0]]);
  const prev = new Map<string, string | null>([[start, null]]);
  let now: string[] = [start];
  let next: string[] = [];
  let level = 0;
  while (now.length > 0 || next.length > 0) {
    if (now.length === 0) {
      now = next;
      next = [];
      level++;
      continue;
    }
    const k = now.pop() as string;
    // Клетку успели удешевить после того, как она попала в ведро.
    if (dist.get(k) !== level) continue;
    if (targets.has(k)) return trace(prev, k);
    const { q, r } = parseKey(k);
    for (const [dq, dr] of HEX_DIRS) {
      const nk = cellKey(q + dq, r + dr);
      if (!area.has(nk)) continue;
      const nd = level + (free(nk) ? 0 : 1);
      if (nd >= (dist.get(nk) ?? Number.POSITIVE_INFINITY)) continue;
      dist.set(nk, nd);
      prev.set(nk, k);
      (nd === level ? now : next).push(nk);
    }
  }
  return null;
}

export type ConnectInput = {
  /** Клетки пятна: дорога не выходит за поселение. */
  blob: ZoneCell[];
  /** Постройки в порядке расстановки — первая становится «корнем» улиц. */
  buildings: ZoneCell[];
  /** Дороги, которые уже лежат в зоне: по ним ездим даром и не перекладываем. */
  roads: Set<string>;
};

/**
 * Проложить улицы между постройками: каждая следующая цепляется к уже
 * связанной части. На клетки с постройками дорогу не пишем — постройка и
 * есть перекрёсток, а запись дороги под дом затёрла бы дом.
 */
export function connectBuildings(inp: ConnectInput): string[] {
  if (inp.buildings.length < 2) return [];
  const area = new Set(inp.blob.map((c) => cellKey(c.q, c.r)));
  const houses = new Set(inp.buildings.map((c) => cellKey(c.q, c.r)));
  const laidSet = new Set<string>();
  const laid: string[] = [];
  const free = (k: string) => houses.has(k) || inp.roads.has(k) || laidSet.has(k);
  const connected = new Set<string>([cellKey(inp.buildings[0].q, inp.buildings[0].r)]);
  for (let i = 1; i < inp.buildings.length; i++) {
    const start = cellKey(inp.buildings[i].q, inp.buildings[i].r);
    if (connected.has(start)) continue;
    const path = cheapestPath(start, connected, area, free);
    // Пятно связно по построению, но если путь не нашёлся — двор просто
    // остаётся без улицы: плана это не ломает.
    if (path === null) continue;
    for (const k of path) {
      connected.add(k);
      if (houses.has(k) || inp.roads.has(k) || laidSet.has(k)) continue;
      laidSet.add(k);
      laid.push(k);
    }
  }
  return laid;
}
