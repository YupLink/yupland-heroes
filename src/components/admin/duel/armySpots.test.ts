// Места своих бойцов до боя: по герою и шаблону; убрал одного — остальные на месте,
// новый — на первую свободную клетку своей зоны; чужая зона и камни — мимо.
import { describe, expect, it } from "vitest";
import { createDuel } from "@/lib/duel/engine";
import type { SideInput, UnitInput } from "@/lib/duel/types";
import { spotKey, spotsOf, withSpots } from "./armySpots";

const mob = (id: string): UnitInput => ({
  id,
  kind: "mob",
  name: id,
  image: null,
  hp: 100,
  maxHp: 100,
  dmg: [1, 1],
  arm: 0,
  move: 3,
  range: 1,
});
const side = (ids: string[]): SideInput => ({
  hero: { ...mob("h"), kind: "hero" },
  mobs: ids.map(mob),
  kit: { energy: 10, int: 0, food: [null, null, null] },
});
const duel = (ids: string[]) => createDuel(side(ids), side(ids), 1);

describe("места армии", () => {
  it("одинаковые мобы — разные копии со своими местами", () => {
    const st = duel(["wolf", "wolf"]);
    expect(st.units.filter((u) => u.side === "a").map(spotKey)).toEqual([
      "hero",
      "wolf:0",
      "wolf:1",
    ]);
  });

  it("ключ — «hero» или шаблон моба", () => {
    const st = duel(["wolf"]);
    expect(st.units.filter((u) => u.side === "a").map(spotKey)).toEqual(["hero", "wolf:0"]);
  });

  it("место сохраняется при смене состава; занятое — ищем свободную клетку зоны", () => {
    const spots = { hero: { c: 0, r: 0 }, "wolf:0": { c: 1, r: 7 } };
    const st = withSpots(duel(["bear", "wolf"]), "a", spots);
    const at = (k: string) => st.units.find((u) => u.side === "a" && spotKey(u) === k)?.pos;
    expect(at("hero")).toEqual({ c: 0, r: 0 });
    expect(at("wolf:0")).toEqual({ c: 1, r: 7 });
    const all = st.units.map((u) => `${u.pos.c},${u.pos.r}`);
    expect(new Set(all).size).toBe(all.length);
    expect(spotsOf(st, "a")).toMatchObject(spots);
  });

  it("место вне своей зоны не берётся", () => {
    const st = withSpots(duel([]), "a", { hero: { c: 5, r: 0 } });
    expect(st.units.find((u) => u.side === "a")?.pos.c).toBeLessThan(2);
  });
});
