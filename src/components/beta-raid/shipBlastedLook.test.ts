// Облик подбитого корабля (dynamite-08): свой арт владельца на малый и большой,
// вместо обычного и «разбитого». Свой, свободный и занятый на той же клетке — главнее.
import { describe, expect, it } from "vitest";
import { shipImageKey, shipImageSrc, shipLook, type ShipMark } from "./drawShips";
import { MAP_PRELOAD, SHIP_BLASTED_SRC } from "@/lib/gameArt";

const mark = (o: Partial<ShipMark>): ShipMark => ({
  total: 1,
  busy: 0,
  free: 0,
  mine: false,
  big: false,
  mineBig: false,
  broken: 1,
  hp: 0,
  hpMax: 1000,
  ...o,
});

describe("облик подбитого", () => {
  it("один обломок — арт подбитого, и у малого, и у большого", () => {
    const small = mark({ blasted: 1 });
    const big = mark({ blasted: 1, big: true });
    expect(shipLook(small)).toBe("blasted");
    expect(shipImageSrc(small)).toBe("/ships/blasted.webp");
    expect(shipImageSrc(big)).toBe(SHIP_BLASTED_SRC);
    expect(shipImageKey(small)).toBe("ship-blasted");
    expect(shipImageKey(big)).toBe("ship-blasted");
  });

  it("обычный разбитый — прежний арт «dead»", () => {
    expect(shipLook(mark({}))).toBe("dead");
    expect(shipImageSrc(mark({ big: true }))).toBe("/ships/big-dead.webp");
    expect(shipImageKey(mark({}))).toBe("ship-dead");
  });

  it("подбитый важнее разбитого, но свой, свободный и занятый — важнее подбитого", () => {
    expect(shipLook(mark({ total: 2, broken: 2, blasted: 1 }))).toBe("blasted");
    expect(shipLook(mark({ total: 2, blasted: 1, free: 1 }))).toBe("free");
    expect(shipLook(mark({ total: 2, blasted: 1, busy: 1 }))).toBe("other");
    expect(shipLook(mark({ total: 2, blasted: 1, busy: 1, mine: true }))).toBe("mine");
  });

  it("арт подбитого в кэше картинок карты — по требованию кадра", () => {
    expect(MAP_PRELOAD).toContainEqual({ key: "ship-blasted", src: SHIP_BLASTED_SRC });
  });
});
