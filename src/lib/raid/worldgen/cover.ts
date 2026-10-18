// Что лежит на клетке поверх местности: декор и объект (босс, сундук).
//
// Шансы и пулы сняты с образца по местности (как админ ставил там декор и как
// густо раздача ставила боссов) и уже отфильтрованы метками декора «к какой
// местности относится» — см. server/…/worldgen/learn. Здесь только бросок.
//
// Декор кладётся кучками, а не солью: шанс клетки множится на медленный шум
// (в среднем ×1), поэтому лес выходит лесом, а средняя густота — как на
// образце. На воде декора нет — как у генератора зон: он перегородил бы путь
// кораблям. Объект встаёт только на клетку без декора (на образце так и есть:
// из 7 174 боссов на декоре 17).
import { fbm, hexToXY } from "@/lib/raid/zonegen/noise";
import { cellRoll, clamp, pickWeighted } from "@/lib/raid/worldgen/rand";
import { isWaterId, terrainAt, type World } from "@/lib/raid/worldgen/field";
import { isCorridor } from "@/lib/raid/worldgen/maze";
import type { WorldCell } from "@/lib/raid/worldgen/spec";

/** Потолок шанса декора: лес клетка-в-клетку — уже стена. */
export const DECOR_P_MAX = 0.9;
const CLUMP_SCALE = 5;
/** Сила кучкования: множитель шанса гуляет примерно от ×0.6 до ×1.4. */
const CLUMP_GAIN = 4;
/**
 * Тропы лабиринта, дороги и проходы снимают примерно четверть декора;
 * вне них он гуще ровно настолько, чтобы суша в целом осталась такой же
 * заросшей, как на образце.
 */
const MAZE_DECOR_BOOST = 1.32;

export function decorAt(w: World, q: number, r: number, terrainId: string): string | null {
  const plan = w.spec.decor[terrainId];
  if (!plan || plan.p <= 0 || plan.ids.length === 0) return null;
  const { x, y } = hexToXY(q, r);
  const m = clamp(1 + (fbm(w.clump, x / CLUMP_SCALE, y / CLUMP_SCALE, 2) - 0.5) * CLUMP_GAIN, 0, 2);
  const p = Math.min(DECOR_P_MAX, plan.p * m * MAZE_DECOR_BOOST);
  if (cellRoll(w.seeds.decor, q, r) >= p) return null;
  return pickWeighted(plan.ids, plan.w, cellRoll(w.seeds.decorPick, q, r));
}

/**
 * Городской декор у улицы города расы race: фонари, колодцы, грядки — только
 * здесь, в природе их нет (learn-towns). Расовый — лишь в городе своей расы.
 */
export function townDecorAt(w: World, race: string | null, q: number, r: number): string | null {
  const plan = w.spec.towns.decor;
  if (!plan || plan.p <= 0 || isWaterId(w, terrainAt(w, q, r))) return null;
  if (cellRoll(w.seeds.townDecor, q, r) >= plan.p) return null;
  const ids: string[] = [];
  const weights: number[] = [];
  plan.ids.forEach((id, i) => {
    const races = w.spec.decorRaces[id];
    if (races && races.length > 0 && (race === null || !races.includes(race))) return;
    ids.push(id);
    weights.push(plan.w[i] ?? 0);
  });
  if (ids.length === 0) return null;
  return pickWeighted(ids, weights, cellRoll(w.seeds.townDecorPick, q, r));
}

export function objectAt(
  w: World,
  q: number,
  r: number,
  terrainId: string,
): { id: string; cfg: unknown } | null {
  const o = w.spec.objects[terrainId];
  if (!o || o.p <= 0 || o.pool.length === 0) return null;
  if (cellRoll(w.seeds.obj, q, r) >= o.p) return null;
  const pick = pickWeighted(
    o.pool,
    o.pool.map((p) => p.w),
    cellRoll(w.seeds.objPick, q, r),
  );
  return pick ? { id: pick.id, cfg: pick.cfg ?? null } : null;
}

/**
 * Клетка без построек: местность, декор и объект — всё от (сид, q, r). На
 * тропе лабиринта декора-стены нет (проходимый декор можно).
 */
export function baseCell(w: World, q: number, r: number): WorldCell {
  const terrainId = terrainAt(w, q, r);
  let decorationId = isWaterId(w, terrainId) ? null : decorAt(w, q, r, terrainId);
  if (decorationId !== null && !w.walk.has(decorationId) && isCorridor(w, q, r)) {
    decorationId = null;
  }
  const obj = decorationId === null ? objectAt(w, q, r, terrainId) : null;
  return {
    q,
    r,
    terrainId,
    decorationId,
    roadId: null,
    buildingId: null,
    buildingSkinId: null,
    buildingConfig: null,
    tier: null,
    objectId: obj?.id ?? null,
    objectConfig: obj?.cfg ?? null,
    mode: "base",
  };
}
