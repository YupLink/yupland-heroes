// Геометрия поселения: где центр, какой формы пятно, куда встают дворы.
//
// Отдельным файлом из-за потолка в 250 строк: здесь «куда», в
// settlement-layout.ts — план улиц, в settlement.ts — порядок и отчёт.
import { hexDistance } from "@/lib/raid/hex";
import { hexToXY, type Noise2D } from "@/lib/raid/zonegen/noise";
import type { ZoneCell } from "@/lib/raid/zonegen/recipe";
import type { SlotOption } from "@/lib/raid/zonegen/settlement-slots";
import type { BuildingOption } from "@/lib/raid/zonegen/settlement-types";

export const cellKey = (q: number, r: number): string => `${q},${r}`;

/** Шесть соседей аксиального гекса — тот же порядок, что и в остальной карте. */
export const HEX_DIRS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, -1],
  [-1, 1],
];

/** Проверка клетки по ключу "q,r": свободна / застраиваема / вода. */
export type CellTest = (key: string) => boolean;

/** Эффект ратуши: она одна на поселение и стоит в центре. */
export const TOWN_HALL = "town_hall";

/** size — поперечник застройки, значит от центра до края половина. */
export const blobRadius = (size: number): number => Math.max(1, Math.floor(size / 2));

/** Дальше трёх клеток «просторно ли тут» не щупаем: на 8 000 клеток дорого. */
const PROBE_R = 3;
/** Вес шумового разброса в выборе центра: без него все центры сели бы в один угол. */
const JITTER_W = 0.5;
/** Надбавка порту за воду под боком — заведомо больше разброса. */
const PORT_BONUS = 2;
/** Масштабы шума в клетках: выбор центра и «рваность» кромки пятна. */
const CENTER_SCALE = 9;
const EDGE_SCALE = 2.5;
/** Кромка гуляет от 0.6 до 1.0 радиуса: за радиус пятно не выходит никогда. */
const EDGE_MIN = 0.6;
const EDGE_SPAN = 0.45;

/** Доля застраиваемых клеток вокруг точки — «просторно ли тут». */
function roomAround(c: ZoneCell, radius: number, canBuild: CellTest): number {
  let fit = 0;
  let all = 0;
  for (let dq = -radius; dq <= radius; dq++) {
    const lo = Math.max(-radius, -dq - radius);
    const hi = Math.min(radius, -dq + radius);
    for (let dr = lo; dr <= hi; dr++) {
      all++;
      if (canBuild(cellKey(c.q + dq, c.r + dr))) fit++;
    }
  }
  return all > 0 ? fit / all : 0;
}

export type CenterInput = {
  cells: ZoneCell[];
  canBuild: CellTest;
  /** Есть ли вода в двух шагах: порт без воды — не порт. */
  nearWater: CellTest;
  count: number;
  size: number;
  noise: Noise2D;
  port: boolean;
};

/**
 * Центры поселений: самые просторные места зоны, разнесённые минимум на size.
 * Шум в оценке нужен, чтобы деревни не садились каждый раз в геометрический
 * центр выделения: рецепт тот же — сид другой — места другие.
 */
export function pickCenters(inp: CenterInput): ZoneCell[] {
  const probe = Math.min(blobRadius(inp.size), PROBE_R);
  const cand = inp.cells
    .filter((c) => inp.canBuild(cellKey(c.q, c.r)))
    .map((c) => {
      const { x, y } = hexToXY(c.q, c.r);
      return {
        c,
        water: inp.nearWater(cellKey(c.q, c.r)),
        room: roomAround(c, probe, inp.canBuild),
        jitter: inp.noise(x / CENTER_SCALE, y / CENTER_SCALE),
      };
    });
  // Порт жмётся к воде: если берег в зоне есть — рассматриваем только берег.
  const shore = inp.port ? cand.filter((s) => s.water) : [];
  const pool = shore.length > 0 ? shore : cand;
  const scored = pool.map((s) => ({
    c: s.c,
    s: s.room + JITTER_W * s.jitter + (inp.port && s.water ? PORT_BONUS : 0),
  }));
  scored.sort((a, b) => b.s - a.s || a.c.q - b.c.q || a.c.r - b.c.r);
  const out: ZoneCell[] = [];
  for (const { c } of scored) {
    if (out.length >= inp.count) break;
    if (out.every((o) => hexDistance(o.q, o.r, c.q, c.r) >= inp.size)) out.push(c);
  }
  return out;
}

/**
 * Пятно застройки вокруг центра (планировка free). Растём обходом в ширину:
 * пятно обязано быть СВЯЗНЫМ, иначе дорога до отрезанного двора не дотянется.
 * Кромку рвём шумом — идеальный круг на карте виден сразу.
 */
export function growBlob(
  center: ZoneCell,
  radius: number,
  inZone: CellTest,
  noise: Noise2D,
): ZoneCell[] {
  const start = cellKey(center.q, center.r);
  const seen = new Set<string>([start]);
  const queue: ZoneCell[] = [center];
  const out: ZoneCell[] = [];
  for (let i = 0; i < queue.length; i++) {
    const c = queue[i];
    const k = cellKey(c.q, c.r);
    if (!inZone(k)) continue;
    const { x, y } = hexToXY(c.q, c.r);
    const edge = EDGE_MIN + EDGE_SPAN * noise(x / EDGE_SCALE, y / EDGE_SCALE);
    if (hexDistance(center.q, center.r, c.q, c.r) > radius * Math.min(1, edge)) continue;
    out.push(c);
    for (const [dq, dr] of HEX_DIRS) {
      const n = { q: c.q + dq, r: c.r + dr };
      const nk = cellKey(n.q, n.r);
      if (seen.has(nk)) continue;
      seen.add(nk);
      queue.push(n);
    }
  }
  return out;
}

export type PlacedBuilding = { q: number; r: number; option: BuildingOption };

/** Перетасовка от сида: один вход — одна и та же перестановка. */
function shuffled<T>(list: T[], rnd: () => number): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Дворы по близости к центру; ничьи — по q, затем по r (byQR). */
function byDistance(spots: ZoneCell[], center: ZoneCell): ZoneCell[] {
  const away = (c: ZoneCell) => hexDistance(center.q, center.r, c.q, c.r);
  return [...spots].sort((a, b) => away(a) - away(b) || a.q - b.q || a.r - b.r);
}

/** Перемешать клетки внутри колец: заполнение идёт от центра, но ряды не ровные. */
function shuffleRings(spots: ZoneCell[], center: ZoneCell, rnd: () => number): ZoneCell[] {
  const rings = new Map<number, ZoneCell[]>();
  for (const c of spots) {
    const d = hexDistance(center.q, center.r, c.q, c.r);
    rings.set(d, [...(rings.get(d) ?? []), c]);
  }
  const out: ZoneCell[] = [];
  for (const d of [...rings.keys()].sort((a, b) => a - b))
    out.push(...shuffled(rings.get(d) as ZoneCell[], rnd));
  return out;
}

export type PlaceInput = {
  /** Клетки пятна, куда МОЖНО ставить (не вода, не занято, не дорога). */
  spots: ZoneCell[];
  center: ZoneCell;
  /** Бюджет пятна: сколько построек вообще влезает по плотности. */
  want: number;
  /** Обязательные, уже поштучно и в порядке важности (expandRequired). */
  required: SlotOption[];
  /** Фон: им добивают остаток бюджета. */
  fill: SlotOption[];
  rnd: () => number;
  /**
   * Занятые дворами клетки и их соседи — ОДИН набор на всю зону: пятна
   * соседей касаются краями, и со своим набором второе ставило дом на чужой.
   */
  blocked?: Set<string>;
  /** Куда встаёт ратуша: площадь плана. Пусто — займёт ближний к центру участок. */
  hallSpots?: ZoneCell[];
  /**
   * Держать между дворами пустую клетку: нужно пятну (free), где дома стоят в
   * чистом поле и без зазора слипаются в кашу. У планировки зазор задают улицы,
   * а дома вдоль улицы стоят ряд к ряду — это и есть город.
   */
  spacing?: boolean;
};

/**
 * Расставить постройки по участкам. Порядок городской, а не случайный: ратуша
 * на площадь, за ней обязательные службы от центра наружу (чем важнее — тем
 * ближе), остаток добивает фон. Зазор между дворами — по флагу spacing.
 */
export function placeBuildings(inp: PlaceInput): PlacedBuilding[] {
  const placed: PlacedBuilding[] = [];
  if (inp.want <= 0) return placed;
  const blocked = inp.blocked ?? new Set<string>();
  const spacing = inp.spacing !== false;
  const free = (c: ZoneCell) => !blocked.has(cellKey(c.q, c.r));
  const put = (c: ZoneCell, option: BuildingOption) => {
    placed.push({ q: c.q, r: c.r, option });
    blocked.add(cellKey(c.q, c.r));
    if (spacing) for (const [dq, dr] of HEX_DIRS) blocked.add(cellKey(c.q + dq, c.r + dr));
  };
  // Ратуша — первой и на площади: она сердце города, и стоять ей с краю
  // нельзя. Если ратуш в составе несколько — сердцем становится
  // первая с эффектом town_hall, прочие встают обычными дворами.
  const queue = [...inp.required];
  const hall = queue.findIndex((s) => s.option.effect === TOWN_HALL);
  const heart = (inp.hallSpots ?? []).find(free);
  if (hall >= 0 && heart !== undefined) put(heart, queue.splice(hall, 1)[0].option);
  const near = byDistance(inp.spots, inp.center);
  let at = 0;
  for (const s of queue) {
    if (placed.length >= inp.want) break;
    while (at < near.length && !free(near[at])) at++;
    if (at >= near.length) break;
    put(near[at], s.option);
  }
  fillRest(inp, placed, free, put);
  return placed;
}

/**
 * Фон по кругу: в круге каждая строка получает ровно по двору, а порядок
 * внутри круга тянется от сида. Доли ровные, а улица не выходит полосатой.
 */
function fillRest(
  inp: PlaceInput,
  placed: PlacedBuilding[],
  free: (c: ZoneCell) => boolean,
  put: (c: ZoneCell, option: BuildingOption) => void,
): void {
  if (inp.fill.length === 0) return;
  let round: SlotOption[] = [];
  for (const c of shuffleRings(inp.spots, inp.center, inp.rnd)) {
    if (placed.length >= inp.want) return;
    if (!free(c)) continue;
    if (round.length === 0) round = shuffled(inp.fill, inp.rnd);
    const next = round.pop();
    if (next !== undefined) put(c, next.option);
  }
}
