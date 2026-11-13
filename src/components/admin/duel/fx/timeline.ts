// Раскадровка хода: движок отдаёт новое состояние сразу, а экран проигрывает
// путь к нему — боец идёт по клеткам, замахивается или стреляет, у цели
// вздрагивают жизни и над ней всплывает, сколько сняло. Чистая функция:
// (было, ход, стало) → что и когда показать.
import { pathTo } from "@/lib/duel/path";
import { SPELLS } from "@/lib/duel/rules";
import { current, unitById } from "@/lib/duel/options";
import type { Action, DuelState, Pos, Side, SpellId } from "@/lib/duel/types";

/** Шаг на клетку, выпад вплотную, полёт стрелы, заклинание. */
export const STEP_MS = 240;
export const LUNGE_MS = 380;
export const SHOT_MS = 360;
export const CAST_MS = 300;
/** После удара: полоса жизней сползает, «хвост» урона догоняет, павший тает. */
export const HP_MS = 260;
export const LAG_DELAY_MS = 260;
export const LAG_MS = 320;
export const DEATH_DELAY_MS = 180;
export const DEATH_MS = 420;

export type Hit = { unit: string; at: number; from: number; to: number; struck: boolean };
export type FloatKind = "dmg" | "heal" | "buff" | "defend";
export type Float = { unit: string; at: number; kind: FloatKind; value: number; spell?: SpellId };
export type Ring = { unit: string; at: number; kind: SpellId | "defend" };

export type Timeline = {
  actor: string;
  /** Клетки пути пешком; первая — откуда. Одна клетка — стоит на месте. */
  path: Pos[];
  walkEnd: number;
  lunge: { target: string; t0: number } | null;
  shot: { target: string; t0: number } | null;
  hits: Hit[];
  floats: Float[];
  rings: Ring[];
  eat: { unit: string; at: number; image: string | null } | null;
  fled: Side | null;
  /** Когда экран переходит на новое состояние. */
  duration: number;
};

const AFTER_HIT = Math.max(LAG_DELAY_MS + LAG_MS, DEATH_DELAY_MS + DEATH_MS);

export function buildTimeline(prev: DuelState, a: Action, next: DuelState): Timeline {
  const u = current(prev);
  const tl: Timeline = {
    actor: u?.id ?? "",
    path: u ? [u.pos] : [],
    walkEnd: 0,
    lunge: null,
    shot: null,
    hits: [],
    floats: [],
    rings: [],
    eat: null,
    fled: null,
    duration: 0,
  };
  if (!u) return tl;
  const hp = (st: DuelState, id: string) => unitById(st, id)?.hp ?? 0;
  const change = (id: string, at: number, struck: boolean) => {
    const from = hp(prev, id);
    const to = hp(next, id);
    tl.hits.push({ unit: id, at, from, to, struck });
    tl.floats.push({ unit: id, at, kind: struck ? "dmg" : "heal", value: Math.abs(from - to) });
    return at + (struck ? AFTER_HIT : HP_MS);
  };
  switch (a.t) {
    case "move":
      tl.path = pathTo(prev, u, a.to);
      tl.walkEnd = (tl.path.length - 1) * STEP_MS;
      tl.duration = tl.walkEnd;
      break;
    case "attack":
      tl.path = pathTo(prev, u, a.from);
      tl.walkEnd = (tl.path.length - 1) * STEP_MS;
      tl.lunge = { target: a.target, t0: tl.walkEnd };
      tl.duration = change(a.target, tl.walkEnd + LUNGE_MS / 2, true);
      break;
    case "shoot":
      tl.shot = { target: a.target, t0: 0 };
      tl.duration = change(a.target, SHOT_MS, true);
      break;
    case "cast":
      tl.rings.push({ unit: a.target, at: 0, kind: a.spell });
      tl.floats.push({
        unit: a.target,
        at: CAST_MS,
        kind: "buff",
        value: SPELLS[a.spell].pct,
        spell: a.spell,
      });
      tl.duration = CAST_MS + HP_MS;
      break;
    case "eat": {
      const food = prev.kits[u.side].food[a.slot];
      tl.eat = { unit: u.id, at: 0, image: food?.image ?? null };
      tl.duration = change(u.id, CAST_MS, false);
      break;
    }
    case "defend":
      tl.rings.push({ unit: u.id, at: 0, kind: "defend" });
      tl.floats.push({ unit: u.id, at: 0, kind: "defend", value: 0 });
      tl.duration = CAST_MS + HP_MS;
      break;
    case "flee":
      tl.fled = u.side;
      tl.duration = DEATH_MS + DEATH_DELAY_MS;
      break;
  }
  return tl;
}
