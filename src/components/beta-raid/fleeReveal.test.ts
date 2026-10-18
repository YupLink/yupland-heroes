// Клетки побега открываются в тумане тому, кто видел, откуда объект убежал.
import { describe, expect, it } from "vitest";
import { fleeRevealKeys } from "./fleeReveal";
import type { FleeMove } from "./applyFled";

const move = (from: string, to: string, via?: string): FleeMove => ({
  from,
  to,
  objectId: "mush",
  ...(via ? { via } : {}),
});

describe("fleeRevealKeys", () => {
  it("побег из обзора (дист. ≤ 2) открывает промежуточную клетку и цель", () => {
    const me = { q: 0, r: 0 };
    expect(fleeRevealKeys(me, [move("1,0", "3,0", "2,0")], 2)).toEqual(["2,0", "3,0"]);
    expect(fleeRevealKeys(me, [move("2,0", "3,0")], 2)).toEqual(["3,0"]);
  });

  it("побег из-за обзора (дист. 3+) ничего не открывает", () => {
    expect(fleeRevealKeys({ q: 0, r: 0 }, [move("3,0", "5,0", "4,0")], 2)).toEqual([]);
  });

  it("без позиции игрока — пусто; кривые ключи отбрасываются", () => {
    expect(fleeRevealKeys(null, [move("1,0", "3,0", "2,0")], 2)).toEqual([]);
    expect(fleeRevealKeys({ q: 0, r: 0 }, [move("1,0", "x", "2,0")], 2)).toEqual(["2,0"]);
  });
});
