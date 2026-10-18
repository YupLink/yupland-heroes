// Города мира с образца: городской декор и своя настройка построек
// (владелец, 07.10.2026: «некоторый декор относится только к определённым
// городам — например фонари — почему-то оказались посреди леса»).
//
//  • Городской декор — тот, что на образце стоит в основном в городе: у
//    городских построек (два шага) или у ратуш (пять шагов) — не реже
//    TOWN_SHARE своих клеток. В природу он не идёт, в мире встаёт только у
//    улиц городов; с меткой расы — только в городах своей расы. Метка сама
//    по себе декор городским не делает: «Мёд ель» и «Кабанье дерево» на
//    образце растут в основном в природе (78 % и 72 %) — им место в лесу.
//  • Своя настройка постройки: у шаблонов «Храм» и «Покои» её нет, и без неё
//    алтарь и покои молчат. Новый город берёт настройку одного из храмов и
//    покоев образца — числа админа, а не выдуманные.
import type { Affinity } from "@/lib/raid/zonegen/recipe";
import type { WorldSpec } from "@/lib/raid/worldgen/spec";

export type DecorNear = { id: string; n: number; town: number; hall: number };
export type ConfigRow = { effect: string; cfg: unknown };

/** Доля клеток декора в городе, с которой он городской. */
export const TOWN_SHARE = 0.6;
/** Реже — по одной-двум клеткам о декоре ничего не сказать. */
export const TOWN_MIN = 3;
/** Потолок густоты городского декора у улиц: город — не склад фонарей. */
const TOWN_P_MAX = 0.5;
const POOL_MAX = 40;
const CONFIG_MAX = 32;

/** Какую часть настройки клетки переносить: только ключ своей функции. */
const CONFIG_KEYS: Record<string, string> = { boost: "boost", chambers: "chambersPrices" };

const round = (v: number, k = 4) => Math.round(v * 10 ** k) / 10 ** k;

/** Городской декор: в городе на образце не реже TOWN_SHARE своих клеток. */
export function townDecorIds(near: readonly DecorNear[]): Set<string> {
  const out = new Set<string>();
  for (const d of near) {
    if (d.n < TOWN_MIN) continue;
    if (d.town / d.n >= TOWN_SHARE || d.hall / d.n >= TOWN_SHARE) out.add(d.id);
  }
  return out;
}

/** Опыт карты без городского декора: природа его больше не ставит. */
export function withoutTownDecor(a: Affinity, town: ReadonlySet<string>): Affinity {
  const byTerrain: Affinity["byTerrain"] = {};
  for (const [id, t] of Object.entries(a.byTerrain)) {
    const removed = t.pool.filter((p) => town.has(p.decorationId)).reduce((s, p) => s + p.n, 0);
    byTerrain[id] = {
      total: t.total,
      decorated: Math.max(0, t.decorated - removed),
      pool: t.pool.filter((p) => !town.has(p.decorationId)),
    };
  }
  return { ...a, byTerrain, global: a.global.filter((p) => !town.has(p.decorationId)) };
}

/** Городской декор у улиц: густота — как у городских построек образца. */
export function townDecorPlan(
  near: readonly DecorNear[],
  townFree: number,
  town: ReadonlySet<string>,
): WorldSpec["towns"]["decor"] {
  const list = near
    .filter((d) => town.has(d.id))
    .map((d) => ({ id: d.id, w: Math.max(1, d.town, d.hall) }))
    .sort((a, b) => b.w - a.w || (a.id < b.id ? -1 : 1))
    .slice(0, POOL_MAX);
  if (list.length === 0 || townFree <= 0) return null;
  const placed = near.filter((d) => town.has(d.id)).reduce((s, d) => s + d.town, 0);
  const p = Math.min(TOWN_P_MAX, placed / townFree);
  if (p <= 0) return null;
  return { p: round(p), ids: list.map((d) => d.id), w: list.map((d) => d.w) };
}

/** Настройки храмов и покоев образца — только ключ своей функции, без повторов. */
export function townConfigs(rows: readonly ConfigRow[]): Record<string, Record<string, unknown>[]> {
  const out: Record<string, Record<string, unknown>[]> = {};
  const seen = new Set<string>();
  for (const { effect, cfg } of rows) {
    const key = CONFIG_KEYS[effect];
    const part = key ? (cfg as Record<string, unknown> | null)?.[key] : undefined;
    if (!key || part === undefined || part === null) continue;
    const one = { [key]: part };
    const sig = `${effect}:${JSON.stringify(one)}`;
    if (seen.has(sig)) continue;
    seen.add(sig);
    const list = (out[effect] ??= []);
    if (list.length < CONFIG_MAX) list.push(one);
  }
  return out;
}
