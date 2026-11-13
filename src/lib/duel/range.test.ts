import { describe, expect, it } from "vitest";
import { act, createDuel } from "./engine";
import { aiAction } from "./ai";
import { distance } from "./grid";
import { current, inShot, unitById } from "./options";
import type { DuelState, SideInput, UnitInput } from "./types";

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

const side = (tag: string, m: UnitInput[]): SideInput => ({
  hero: { ...mob(`hero_${tag}`), kind: "hero", move: 1, hp: 3000, maxHp: 4000 },
  mobs: m,
  kit: { energy: 0, int: 0, food: [null, null, null] },
});

/** Стрелок A с дальностью 4 ходит первым (ход 5 — раньше всех). */
function duel(): DuelState {
  const st = createDuel(side("a", [mob("bow", { move: 5, range: 4 })]), side("b", [mob("foe")]), 1);
  st.obstacles = [];
  return st;
}

describe("дальность удара", () => {
  it("стрелок бьёт на свою дальность, дальше — нет", () => {
    const st = duel();
    const bow = current(st)!;
    expect(bow.id).toBe("a:bow:0");
    const foe = unitById(st, "b:foe:0")!;
    foe.pos = { c: bow.pos.c + 4, r: bow.pos.r };
    expect(inShot(bow, foe)).toBe(true);
    expect(() => act(st, { t: "shoot", target: foe.id })).not.toThrow();
    foe.pos = { c: bow.pos.c + 5, r: bow.pos.r };
    expect(inShot(bow, foe)).toBe(false);
    expect(() => act(st, { t: "shoot", target: foe.id })).toThrow("duel.far");
  });

  it("ближний боец не стреляет вовсе", () => {
    const st = duel();
    st.turn = st.order.indexOf("b:foe:0");
    const foe = current(st)!;
    const hero = unitById(st, "a:hero")!;
    hero.pos = { c: foe.pos.c - 2, r: foe.pos.r };
    expect(() => act(st, { t: "shoot", target: hero.id })).toThrow("duel.no_shot");
  });

  it("компьютер-стрелок вне дальности подходит на выстрел, но не вплотную", () => {
    const st = duel();
    const bow = current(st)!;
    // Враг в 8 клетках: за ход стрелок (ход 5) встаёт на выстрел (дальность 4).
    unitById(st, "b:foe:0")!.pos = { c: bow.pos.c + 8, r: bow.pos.r };
    const a = aiAction(st);
    expect(a?.t).toBe("move");
    if (a?.t !== "move") return;
    const foes = st.units.filter((u) => u.side === "b");
    const near = Math.min(...foes.map((f) => distance(a.to, f.pos)));
    expect(near).toBeLessThanOrEqual(bow.range);
    expect(near).toBe(bow.range);
  });
});
