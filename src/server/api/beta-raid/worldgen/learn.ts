// Спецификация мира из строк образца — «логика как у Альфы» (владелец,
// 06.10.2026). Чистая сборка без базы: строки приносит learn-load (мост или
// psql), тест кормит своими.
//
//  • доли суши и воды — из исходного квадрата образца (у Альфы в 128 × 128 —
//    82 % суши и 18 % воды без океана: материк с озёрами); заказ «суша, %» —
//    архипелаг: вода у берега в той же пропорции к суше, что на всём образце,
//    остальное — океан;
//  • земли областей — земли того квадрата с весами по площади (смягчёнными,
//    чтобы редкая земля тоже встречалась); городская земля (больше трети под
//    домами и дорогами) и обрывки меньше 60 клеток в области не идут;
//  • пятна внутри области — соседка, что чаще всего граничит с землёй на образце;
//  • декор — опыт карты с метками декора (тот же decorPlan, что у кисти «Биом»);
//  • объекты — как часто на свободной клетке этой земли стоит босс или сундук
//    и какие, с наградой без денег (sanitize);
//  • города — настройки настроенных ратуш образца, своя настройка храмов и
//    покоев, городской декор отдельно от природного (learn-towns);
//  • земли — по выбору админа (lands): из земель образца остаются отмеченные;
//  • наборы городов (learn-kits) — с городов образца, их приносит создание мира.
import { computeLevels } from "@/lib/raid/worldgen/field";
import {
  WORLD_VERSION,
  worldSpecSchema,
  type TownKit,
  type WorldSpec,
} from "@/lib/raid/worldgen/spec";
import { decorPlan } from "@/lib/raid/zonegen/decorPlan";
import { defaultRecipe, type Affinity } from "@/lib/raid/zonegen/recipe";
import { isOceanName, isWaterName } from "@/lib/shipRules";
import { safeParseTownConfig } from "@/lib/townConfig";
import { cleanObjectConfig } from "./sanitize";
import {
  townConfigs,
  townDecorIds,
  townDecorPlan,
  withoutTownDecor,
  type ConfigRow,
  type DecorNear,
} from "./learn-towns";

export type LearnRows = {
  terrains: Array<{ id: string; name: string }>;
  stats: Array<{ id: string; n: number; bld: number; road: number; free: number; obj: number }>;
  core: Array<{ id: string; n: number }>;
  objects: Array<{ terrain: string; id: string; n: number; cfg: unknown }>;
  adjacency: Array<{ a: string; b: string; n: number }>;
  towns: Array<{ config: unknown }>;
  /** Декор, сквозь который ходят: в лабиринте не стена. */
  walk: string[];
  road: string | null;
  affinity: Affinity;
  /** Метки расы декора: расовый — только в города своей расы. */
  decorRaces?: Record<string, string[]>;
  /** Декор образца: сколько всего, у городских построек и у ратуш. */
  decorNear?: DecorNear[];
  /** Свободных клеток у городских построек образца. */
  townFree?: number;
  /** Настройки храмов и покоев образца. */
  configs?: ConfigRow[];
};

export type LearnOpts = {
  seed: number;
  landPct?: number | null;
  spacing?: number;
  /** Земли мира (выбор админа); пусто — все земли образца. */
  lands?: string[] | null;
  /** Наборы городов с образца (learn-kits). */
  kits?: TownKit[];
};

const BIOME_MIN = 60;
const URBAN_MAX = 0.3;
const WEIGHT_POW = 0.7;
const POOL_MAX = 40;
const OBJECT_P_MAX = 0.95;
export const SPACING_DEFAULT = 30;
/** Ячейка лабиринта: по её краю тропа, внутри проход ко всему. */
export const MAZE_DEFAULT = 14;

const round = (v: number, k = 4) => Math.round(v * 10 ** k) / 10 ** k;
const byIdAsc = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

function pairsOf(ids: Set<string>, rows: LearnRows["adjacency"]): Record<string, string> {
  const adj = new Map<string, Map<string, number>>();
  const add = (a: string, b: string, n: number) => {
    const m = adj.get(a) ?? new Map<string, number>();
    m.set(b, (m.get(b) ?? 0) + n);
    adj.set(a, m);
  };
  for (const { a, b, n } of rows) {
    if (!ids.has(a) || !ids.has(b) || a === b) continue;
    add(a, b, Number(n) || 0);
    add(b, a, Number(n) || 0);
  }
  const out: Record<string, string> = {};
  for (const id of [...ids].sort()) {
    const best = [...(adj.get(id) ?? new Map()).entries()].sort(
      ([x, nx], [y, ny]) => ny - nx || (x < y ? -1 : 1),
    )[0];
    if (best) out[id] = best[0];
  }
  return out;
}

export function buildSpec(rows: LearnRows, opts: LearnOpts): WorldSpec {
  const names = new Map(rows.terrains.map((t) => [t.id, t.name]));
  const water = (id: string) => isWaterName(names.get(id));
  const ocean = (id: string) => isOceanName(names.get(id));
  const stat = new Map(rows.stats.map((s) => [s.id, s]));
  const count = (id: string) => stat.get(id)?.n ?? 0;
  const most = (ids: string[]) =>
    [...ids].sort((a, b) => count(b) - count(a) || (a < b ? -1 : 1))[0];
  const known = rows.stats.map((s) => s.id).filter((id) => names.has(id));
  const shallowId = most(known.filter((id) => water(id) && !ocean(id)));
  if (shallowId === undefined) throw new Error("worldgen.no_water");
  const oceanId = most(known.filter(ocean)) ?? shallowId;

  const source = rows.core.length > 0 ? rows.core : rows.stats;
  const want = new Set(opts.lands ?? []);
  const land = landCandidates(rows).filter((l) => want.size === 0 || want.has(l.id));
  if (land.length === 0) throw new Error("worldgen.no_land");
  const landIds = new Set(land.map((l) => l.id));

  const sum = (list: Array<{ id: string; n: number }>, f: (id: string) => boolean) =>
    list.reduce((s, c) => s + (f(c.id) ? c.n : 0), 0);
  const isLand = (id: string) => names.has(id) && !water(id);
  const isShallow = (id: string) => water(id) && !ocean(id);
  const ratio = sum(rows.stats, isShallow) / Math.max(1, sum(rows.stats, isLand));
  const all = sum(source, () => true);
  let shares: WorldSpec["shares"];
  if (opts.landPct !== undefined && opts.landPct !== null) {
    const l = Math.min(1, Math.max(0.05, opts.landPct / 100));
    shares = { land: l, shallow: round(Math.min(1 - l, ratio * l)) };
  } else {
    const l = Math.min(1, Math.max(0.05, sum(source, isLand) / Math.max(1, all)));
    shares = {
      land: round(l),
      shallow: round(Math.min(1 - l, sum(source, isShallow) / Math.max(1, all))),
    };
  }

  const recipe = { ...defaultRecipe(shallowId, 0), decorRate: 1, decorStrict: true };
  // Городской декор (фонари, колодцы, грядки) природа не ставит — он у улиц.
  const decorRaces = rows.decorRaces ?? {};
  const townIds = townDecorIds(rows.decorNear ?? []);
  const nature = withoutTownDecor(rows.affinity, townIds);
  const decor: WorldSpec["decor"] = {};
  for (const id of [...landIds].sort()) {
    const plan = decorPlan(id, nature.byTerrain[id], recipe, nature);
    if (plan === null || plan.ids.length === 0) continue;
    const top = plan.ids
      .map((d, i) => ({ d, w: plan.weights[i] }))
      .sort((a, b) => b.w - a.w || (a.d < b.d ? -1 : 1))
      .slice(0, POOL_MAX);
    decor[id] = { p: round(plan.p), ids: top.map((x) => x.d), w: top.map((x) => x.w) };
  }

  const objects: WorldSpec["objects"] = {};
  for (const id of [...landIds, shallowId, oceanId].sort()) {
    const s = stat.get(id);
    const pool = rows.objects
      .filter((o) => o.terrain === id)
      .sort((a, b) => b.n - a.n || (a.id < b.id ? -1 : 1))
      .slice(0, POOL_MAX)
      .map((o) => ({ id: o.id, w: Number(o.n) || 0, cfg: cleanObjectConfig(o.cfg) }));
    const p = s && s.free > 0 ? s.obj / s.free : 0;
    if (p > 0 && pool.length > 0) objects[id] = { p: round(Math.min(OBJECT_P_MAX, p)), pool };
  }

  const templates = rows.towns
    .map((t) => safeParseTownConfig(t.config))
    .filter((c) => c.goods.length > 0 && c.residents > 0)
    .slice(0, 64)
    .map((c) => ({ residents: c.residents, rules: { ...c.rules }, goods: c.goods }));

  return worldSpecSchema.parse({
    v: WORLD_VERSION,
    seed: opts.seed,
    water: { shallow: shallowId, ocean: oceanId },
    land,
    pair: pairsOf(landIds, rows.adjacency),
    shares,
    levels: computeLevels(opts.seed, shares),
    decor,
    objects,
    walk: [...new Set(rows.walk)].sort(),
    maze: MAZE_DEFAULT,
    towns: {
      spacing: opts.spacing ?? SPACING_DEFAULT,
      roadId: rows.road,
      templates,
      configs: townConfigs(rows.configs ?? []),
      decor: townDecorPlan(rows.decorNear ?? [], rows.townFree ?? 0, townIds),
      kits: opts.kits ?? [],
    },
    decorRaces,
  });
}

/**
 * Земли образца, из которых строится мир (и выбирает админ): не вода, не
 * обрывок меньше BIOME_MIN клеток и не городская земля (больше URBAN_MAX под
 * домами и дорогами). Вес — по площади, смягчённый.
 */
export function landCandidates(rows: Pick<LearnRows, "terrains" | "stats" | "core">) {
  const names = new Map(rows.terrains.map((t) => [t.id, t.name]));
  const stat = new Map(rows.stats.map((s) => [s.id, s]));
  const urban = (id: string) => {
    const s = stat.get(id);
    return s && s.n > 0 ? (s.bld + s.road) / s.n : 0;
  };
  const source = rows.core.length > 0 ? rows.core : rows.stats;
  return source
    .filter(
      (c) =>
        names.has(c.id) &&
        !isWaterName(names.get(c.id)) &&
        c.n >= BIOME_MIN &&
        urban(c.id) <= URBAN_MAX,
    )
    .map((c) => ({ id: c.id, w: round(Math.pow(c.n, WEIGHT_POW), 2) }))
    .sort(byIdAsc);
}
