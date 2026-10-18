// Города образца для наборов (learn-kits): строки построек, справочник
// глазами наборов (роль, рабочая ли постройка, расы облика, на какой шаблон
// встаёт облик группы) и сами города — ратуша, её постройки в радиусе
// привязанных лавок ± KIT_MARGIN и таблички «город …» рядом.
import { SHOWCASE } from "@/lib/raid/worldgen/collections";
import type { BuildingOption } from "@/lib/raid/zonegen/settlement-types";
import { hexDist } from "@/lib/raid/zonegen/town/hex";
import { hasRealEffect, roleOf } from "@/lib/raid/zonegen/town/roles";
import type { TownRole } from "@/lib/raid/zonegen/town/types";
import { isTownSign } from "./learn-kits-label";

/** Постройка образца: клетка, шаблон, облик, функция клетки, табличка, привязка лавки. */
export type TownCellRow = {
  q: number;
  r: number;
  tpl: string;
  skin: string | null;
  /** Функция клетки: building_config.effect, нет — meta.effect шаблона. */
  effect: string | null;
  text: string | null;
  terrain: string | null;
  /** Лавка привязана к ратуше (townQ, townR). */
  townQ: number | null;
  townR: number | null;
  /** Имя города у ратуши. */
  name: string | null;
};

export const KIT_MARGIN = 3;
export const KIT_RADIUS = 5;
/** Табличка дальше от ратуши — уже не её («Город Пчёл» у ворот в чистом поле). */
export const SIGN_REACH = 12;

export type Look = { t: string; s: string | null };
export type Town = { hall: TownCellRow; members: TownCellRow[]; signs: TownCellRow[] };

export const pairKey = (l: Look) => `${l.t}|${l.s ?? ""}`;
export const lookId = (l: Look) => l.s ?? l.t;
export const cellKey = (c: { q: number; r: number }) => `${c.q},${c.r}`;
export const inc = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
export const top = (m: Map<string, number>): string | null =>
  [...m].sort(([a, x], [b, y]) => y - x || (a < b ? -1 : 1))[0]?.[0] ?? null;

/** Справочник глазами наборов: роль, рабочая ли, расы облика, шаблон под облик. */
export function catalogView(catalog: readonly BuildingOption[], rows: readonly TownCellRow[]) {
  const tpl = new Map(catalog.map((o) => [o.id, o]));
  const skinOf = new Map<string, { races: string[]; group: string }>();
  for (const o of catalog)
    for (const s of o.skins ?? []) skinOf.set(s.id, { races: s.races ?? [], group: o.id });
  const role = (id: string): TownRole | null => {
    const o = tpl.get(id);
    return o ? roleOf(o) : null;
  };
  const usage = new Map<string, number>();
  for (const r of rows) inc(usage, r.tpl);
  const working = (id: string) => {
    const o = tpl.get(id);
    const r = role(id);
    return o !== undefined && r !== null && hasRealEffect(o) && !SHOWCASE.has(r);
  };
  const races = (l: Look) =>
    l.s !== null ? (skinOf.get(l.s)?.races ?? []) : (tpl.get(l.t)?.races ?? []);
  // Функция клетки своя («Храм» со столбом заклинаний) — особая настройка, мимо.
  const plain = (r: TownCellRow) => (tpl.get(r.tpl)?.effect ?? null) === r.effect;
  const placed = new Map<string, Map<string, number>>();
  for (const r of rows) {
    const g = r.skin ? skinOf.get(r.skin)?.group : undefined;
    if (g === undefined || !working(r.tpl) || !plain(r)) continue;
    const m = placed.get(g) ?? new Map<string, number>();
    inc(m, r.tpl);
    placed.set(g, m);
  }
  const host = (skin: string): string | null => {
    const g = skinOf.get(skin)?.group;
    if (g === undefined) return null;
    if (working(g) && (usage.get(g) ?? 0) > 0) return g;
    return top(placed.get(g) ?? new Map());
  };
  return { tpl, role, working, races, plain, host, usage };
}

/** Города образца: ратуша, её постройки в радиусе лавок и таблички «город …». */
export function townsOf(rows: readonly TownCellRow[], halls: readonly TownCellRow[]) {
  const reach = new Map<string, number>();
  for (const r of rows) {
    if (r.townQ === null || r.townR === null) continue;
    const k = cellKey({ q: r.townQ, r: r.townR });
    reach.set(k, Math.max(reach.get(k) ?? 0, hexDist(r, { q: r.townQ, r: r.townR })));
  }
  const sorted = [...halls].sort((a, b) => a.q - b.q || a.r - b.r);
  const towns = new Map(
    sorted.map((h) => [cellKey(h), { hall: h, members: [], signs: [] } as Town]),
  );
  const strays: TownCellRow[] = [];
  for (const r of rows) {
    if (r.effect === "town_hall") continue;
    let best = sorted[0];
    for (const h of sorted) if (hexDist(r, h) < hexDist(r, best)) best = h;
    const d = hexDist(r, best);
    const k = cellKey(best);
    const t = towns.get(k) as Town;
    if (d <= (reach.has(k) ? (reach.get(k) as number) + KIT_MARGIN : KIT_RADIUS)) t.members.push(r);
    if (isTownSign(r.text)) (d <= SIGN_REACH ? t.signs : strays).push(r);
  }
  return { towns: [...towns.values()], strays };
}
