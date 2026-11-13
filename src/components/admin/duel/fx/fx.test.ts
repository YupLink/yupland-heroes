import { describe, expect, it } from "vitest";
import { act, createDuel } from "@/lib/duel/engine";
import { aiAction } from "@/lib/duel/ai";
import { distance, key, samePos } from "@/lib/duel/grid";
import { pathTo } from "@/lib/duel/path";
import { current, meleeStands, moveCells, unitById } from "@/lib/duel/options";
import type { DuelState, SideInput, UnitInput } from "@/lib/duel/types";
import { CELLS, R, cellAt, xy } from "./layout";
import { planFor } from "./plan";
import { poseAt } from "./pose";
import { HP_MS, LUNGE_MS, STEP_MS, buildTimeline } from "./timeline";

const mob = (id: string, over: Partial<UnitInput> = {}): UnitInput => ({
  id,
  kind: "mob",
  name: id,
  image: null,
  hp: 10_000,
  maxHp: 10_000,
  dmg: [800, 1200],
  arm: 0,
  move: 3,
  range: 1,
  ...over,
});

const side = (tag: string): SideInput => ({
  hero: { ...mob(`hero_${tag}`), kind: "hero", hp: 3000, maxHp: 4000, dmg: [7100, 7100], arm: 20 },
  mobs: [mob(`${tag}0`), mob(`${tag}1`)],
  kit: {
    energy: 50,
    int: 40,
    food: [{ id: "f", name: "Лепешки", image: null, value: 400 }, null, null],
  },
});

function duel(): DuelState {
  return createDuel(side("a"), side("b"), 7);
}

describe("путь по клеткам", () => {
  it("шаг за шагом до любой досягаемой клетки, длиной в число шагов", () => {
    const st = duel();
    const u = current(st)!;
    for (const [k, steps] of moveCells(st, u)) {
      const to = { c: Number(k.split(",")[0]), r: Number(k.split(",")[1]) };
      const path = pathTo(st, u, to);
      expect(path).toHaveLength(steps + 1);
      expect(samePos(path[0], u.pos)).toBe(true);
      expect(samePos(path[path.length - 1], to)).toBe(true);
      for (let i = 1; i < path.length; i++) expect(distance(path[i - 1], path[i])).toBe(1);
      const rocks = new Set(st.obstacles.map(key));
      expect(path.some((p) => rocks.has(key(p)))).toBe(false);
    }
  });
});

describe("раскадровка", () => {
  it("ход: идёт по клеткам, а не перескакивает", () => {
    const st = duel();
    const u = current(st)!;
    const [k] = [...moveCells(st, u)].find(([, s]) => s === 3) ?? [];
    const to = { c: Number(k!.split(",")[0]), r: Number(k!.split(",")[1]) };
    const next = act(st, { t: "move", to });
    const tl = buildTimeline(st, { t: "move", to }, next);
    expect(tl.duration).toBe(3 * STEP_MS);
    const mid = poseAt(u, st, tl, STEP_MS / 2);
    const a = xy(tl.path[0]);
    const b = xy(tl.path[1]);
    expect(mid.x).toBeCloseTo((a.x + b.x) / 2);
    expect(mid.run).not.toBeNull();
    const end = poseAt(u, st, tl, tl.duration);
    expect(end.x).toBeCloseTo(xy(to).x);
    expect(end.run).toBeNull();
  });

  it("удар: урон над целью равен снятым жизням, полоса сползает после удара", () => {
    let st = duel();
    // Играем за обе стороны, пока компьютер не пойдёт в удар.
    for (let i = 0; i < 200; i++) {
      const a = aiAction(st);
      if (!a) break;
      if (a.t === "attack") {
        const foe = unitById(st, a.target)!;
        const next = act(st, a);
        const tl = buildTimeline(st, a, next);
        const hit = tl.hits[0];
        expect(hit.unit).toBe(foe.id);
        expect(hit.at).toBe(tl.walkEnd + LUNGE_MS / 2);
        expect(tl.path[tl.path.length - 1]).toEqual(a.from);
        const lost = foe.hp - unitById(next, foe.id)!.hp;
        expect(lost).toBeGreaterThan(0);
        expect(tl.floats[0]).toMatchObject({ unit: foe.id, kind: "dmg", value: lost });
        expect(poseAt(foe, st, tl, hit.at - 1).hp).toBe(foe.hp);
        expect(poseAt(foe, st, tl, hit.at + HP_MS).hp).toBe(foe.hp - lost);
        expect(tl.duration).toBeGreaterThan(hit.at);
        return;
      }
      st = act(st, a);
    }
    throw new Error("никто не дотянулся");
  });

  it("павший тает к концу раскадровки", () => {
    const st = duel();
    const u = current(st)!;
    const foe = st.units.find((x) => x.side !== u.side)!;
    foe.hp = 1;
    foe.pos = { ...u.pos, c: u.pos.c + 1 };
    const a = { t: "attack" as const, target: foe.id, from: u.pos };
    const tl = buildTimeline(st, a, act(st, a));
    expect(poseAt(foe, st, tl, tl.duration).alpha).toBe(0);
  });
});

describe("нажатие", () => {
  it("клетка под пальцем — та, в центр которой попали", () => {
    for (const p of CELLS) expect(cellAt(xy(p).x, xy(p).y)).toEqual(p);
    expect(cellAt(-50, -50)).toBeNull();
  });

  it("пустая досягаемая клетка — идти; занятая врагом вдали — подойти и ударить", () => {
    const st = duel();
    const u = current(st)!;
    const [k] = [...moveCells(st, u).keys()];
    const to = { c: Number(k.split(",")[0]), r: Number(k.split(",")[1]) };
    expect(planFor(st, u, null, to, null)).toMatchObject({ t: "move", to });
    const foe = st.units.find((x) => x.side !== u.side)!;
    foe.pos = { c: u.pos.c + 3, r: u.pos.r };
    const plan = planFor(st, u, null, foe.pos, null);
    expect(plan?.t).toBe("attack");
    if (plan?.t === "attack") {
      expect(meleeStands(st, u, foe).some((p) => samePos(p, plan.from))).toBe(true);
    }
  });

  it("сторона подхода — куда показывает палец от центра цели", () => {
    const st = duel();
    const u = current(st)!;
    const foe = st.units.find((x) => x.side !== u.side)!;
    foe.pos = { c: u.pos.c + 3, r: u.pos.r };
    const c = xy(foe.pos);
    const plan = planFor(st, u, null, foe.pos, { x: c.x - R * 0.8, y: c.y });
    expect(plan?.t === "attack" && samePos(plan.from, { c: foe.pos.c - 1, r: foe.pos.r })).toBe(
      true,
    );
  });

  it("заклинание — только на своего: по врагу нажатие ничего не делает", () => {
    const st = duel();
    const hero = st.units.find((x) => x.side === "a" && x.kind === "hero")!;
    const ally = st.units.find((x) => x.side === "a" && x.kind === "mob")!;
    const foe = st.units.find((x) => x.side === "b")!;
    expect(planFor(st, hero, "def", foe.pos, null)).toBeNull();
    expect(planFor(st, hero, "def", ally.pos, null)).toMatchObject({ t: "cast", target: ally.id });
  });
});
