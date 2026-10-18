// Генератор зоны: рецепт + сид → патчи клеток. Чистая математика, без БД и
// без Math.random — вызывается и на сервере (пишет карту), и в превью на
// клиенте, и обе стороны обязаны сойтись клетка в клетку.
//
// Как ложатся слои: каждой клетке считаем непрерывный шум по её декартовым
// координатам, сортируем клетки по нему и режем ряд по долям рецепта. Доли
// сходятся ТОЧНО (нарезка, а не пороги), а пятна выходят связными, потому что
// соседние гексы получают близкие значения шума. Чанки сходятся на стыках
// сами: шум — функция координат, а не выделения.
//
// Декор кладём только тот, что админ уже ставил на этой местности (опыт карты
// в Affinity): генератор не сочиняет «ёлки на песке», он повторяет руку админа.
//
// Дороги генератор не трогает, но и не подставляет: вода под дорогой — «дорога
// по воде», которой в игре не бывает (владелец, 21.09), а декор на дороге её
// перегораживает (decorBlocksSql). Поэтому водные слои берут только клетки
// без дороги, а декор на клетку с дорогой не ставится.
import { hexToXY, makeNoise, mulberry32, warpedFbm } from "@/lib/raid/zonegen/noise";
import {
  DEFAULT_WARP,
  normalizeWeights,
  type Affinity,
  type ZoneCell,
  type ZoneLayer,
  type ZonePatch,
  type ZoneRecipe,
  type ZoneReport,
} from "@/lib/raid/zonegen/recipe";
import { isWaterName } from "@/lib/shipRules";
import { decorPlan, type DecorPlan } from "@/lib/raid/zonegen/decorPlan";

export type ZoneGenerateArgs = {
  cells: ZoneCell[];
  /** Ключи "q,r" клеток, которые трогать нельзя (объект, постройка, игрок…). */
  occupied: Set<string>;
  recipe: ZoneRecipe;
  affinity: Affinity;
  /** id местности → имя: по имени узнаём воду (тот же признак, что у кораблей). */
  terrainNames: Record<string, string>;
  /** Ключи "q,r" клеток с дорогой: воде и декору туда нельзя. */
  roads?: Set<string>;
};

export type ZoneGenerateResult = { patches: ZonePatch[]; report: ZoneReport };

/** Сдвиг сида для кубика декора: свой поток, чтобы правка decorRate не двигала пятна. */
const DECOR_SEED_XOR = 0x9e3779b9;

const cellKey = (c: ZoneCell) => `${c.q},${c.r}`;

/** Порядок клеток на входе не должен влиять на ответ: одна зона — один результат. */
const byQR = (a: ZoneCell, b: ZoneCell) => a.q - b.q || a.r - b.r;

/** Взвешенный жребий: roll в [0, 1) → индекс. Все веса нулевые → поровну. */
function pickWeighted(weights: number[], roll: number): number {
  const total = weights.reduce((s, w) => s + Math.max(0, w), 0);
  if (total <= 0) return Math.min(weights.length - 1, Math.floor(roll * weights.length));
  const r = roll * total;
  let acc = 0;
  for (let i = 0; i < weights.length; i++) {
    acc += Math.max(0, weights[i]);
    if (r < acc) return i;
  }
  return weights.length - 1;
}

/** Вода — вниз: водные слои первыми в порядке рецепта, затем суша в порядке рецепта. */
function orderLayers(layers: ZoneLayer[], isWater: (id: string) => boolean): ZoneLayer[] {
  return [
    ...layers.filter((l) => isWater(l.terrainId)),
    ...layers.filter((l) => !isWater(l.terrainId)),
  ];
}

/** Сколько клеток каждому слою: округлённые кумулятивные доли, последний — хвост. */
function layerCounts(n: number, layers: ZoneLayer[]): number[] {
  const shares = normalizeWeights(layers);
  const counts: number[] = [];
  let cum = 0;
  let from = 0;
  for (let k = 0; k < layers.length; k++) {
    cum += shares[k];
    // Граница — по округлённой кумулятивной доле: куски складываются ровно в N,
    // а слой с нулевым весом не получает ни клетки. Последний забирает хвост.
    const to = k === layers.length - 1 ? n : Math.max(from, Math.round(cum * n));
    counts.push(to - from);
    from = to;
  }
  return counts;
}

/**
 * Местность каждой клетки: ряд «низины → высоты», нарезанный по долям рецепта.
 * Водные слои (они первые) берут только клетки без дороги; клетки с дорогой
 * ждут суши и получают её в том же порядке шума, доли суши не сдвигаются.
 */
function assignByNoise(
  free: ZoneCell[],
  layers: ZoneLayer[],
  recipe: ZoneRecipe,
  isWater: (id: string) => boolean,
  isRoad: (c: ZoneCell) => boolean,
): string[] {
  const noise = makeNoise(recipe.seed);
  const scale = Math.max(1e-3, recipe.scale);
  // Варп уводит кромку слоёв в сторону, но ряд остаётся рядом: доли считаются
  // нарезкой по рангу, поэтому «извилистее» никогда не значит «не по рецепту».
  const warp = recipe.warp ?? DEFAULT_WARP;
  const scored = free.map((c, i) => {
    const { x, y } = hexToXY(c.q, c.r);
    return { i, c, n: warpedFbm(noise, x / scale, y / scale, warp) };
  });
  scored.sort((a, b) => a.n - b.n || byQR(a.c, b.c));
  const need = layerCounts(free.length, layers);
  const out = new Array<string>(free.length);
  // Проход 1: вода — по низинам, мимо дорог. Что не взяла вода, идёт суше.
  const rest: typeof scored = [];
  let k = 0;
  for (const s of scored) {
    while (k < layers.length && isWater(layers[k].terrainId) && need[k] <= 0) k++;
    if (k < layers.length && isWater(layers[k].terrainId) && !isRoad(s.c)) {
      out[s.i] = layers[k].terrainId;
      need[k]--;
    } else rest.push(s);
  }
  // Проход 2: суша — по своим долям в том же порядке; последний слой берёт хвост
  // (в том числе воду, которой не хватило клеток без дороги).
  const land = layers.map((l, i) => i).filter((i) => !isWater(layers[i].terrainId));
  let j = 0;
  for (let li = 0; li < land.length; li++) {
    const idx = land[li];
    const to = li === land.length - 1 ? rest.length : Math.min(rest.length, j + need[idx]);
    for (; j < to; j++) out[rest[j].i] = layers[idx].terrainId;
  }
  // Рецепт из одной воды и дороги в зоне: суши нет — дорога остаётся на прежней земле.
  return out;
}

export function generateZone(input: ZoneGenerateArgs): ZoneGenerateResult {
  const { recipe, affinity, terrainNames } = input;

  // Дубли выделения схлопываем: два патча на одну клетку — две записи в БД.
  const seen = new Set<string>();
  const free: ZoneCell[] = [];
  let skipped = 0;
  for (const c of input.cells) {
    const k = cellKey(c);
    if (seen.has(k)) continue;
    seen.add(k);
    if (input.occupied.has(k)) skipped++;
    else free.push({ q: c.q, r: c.r });
  }
  free.sort(byQR);

  const isWater = (id: string) => isWaterName(terrainNames[id]);
  const roads = input.roads ?? new Set<string>();
  const isRoad = (c: ZoneCell) => roads.has(cellKey(c));
  const layers = orderLayers(recipe.layers, isWater);
  const single = free.length < recipe.smallSingle;
  let terrainOf: Array<string | undefined>;
  if (single) {
    // Маленькая зона пятнами не получится — один тип на всю, жребий по весам.
    // Выпала вода — клетки с дорогой остаются как были.
    const k = pickWeighted(normalizeWeights(layers), mulberry32(recipe.seed)());
    const id = layers[k].terrainId;
    terrainOf = free.map((c) => (isWater(id) && isRoad(c) ? undefined : id));
  } else {
    terrainOf = assignByNoise(free, layers, recipe, isWater, isRoad);
  }

  const decorRnd = mulberry32((recipe.seed ^ DECOR_SEED_XOR) >>> 0);
  const plans = new Map<string, DecorPlan>();
  const byTerrain: Record<string, number> = {};
  let decor = 0;
  const patches: ZonePatch[] = [];
  free.forEach((c, i) => {
    const terrainId = terrainOf[i];
    if (terrainId === undefined) {
      skipped++;
      return;
    }
    byTerrain[terrainId] = (byTerrain[terrainId] ?? 0) + 1;
    // null — «стереть старый декор»: зона перерисовывается целиком, и ёлка с
    // прежней травы не должна остаться стоять посреди новой воды.
    let decorationId: string | null = null;
    if (!isWater(terrainId) && !isRoad(c)) {
      let plan = plans.get(terrainId);
      if (plan === undefined) {
        plan = decorPlan(terrainId, affinity.byTerrain[terrainId], recipe, affinity);
        plans.set(terrainId, plan);
      }
      if (plan && decorRnd() < plan.p) {
        decorationId = plan.ids[pickWeighted(plan.weights, decorRnd())];
        decor++;
      }
    }
    patches.push({ q: c.q, r: c.r, terrainId, decorationId });
  });

  return { patches, report: { cells: patches.length, skipped, byTerrain, decor, single } };
}
