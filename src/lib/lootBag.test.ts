// Слой мешочков на карте: один значок на клетку (мешочек сверху бугорка, число —
// если их больше одного) и остаток срока по часам телефона от ответа сервера.
import { describe, expect, it } from "vitest";
import { bagMarksOf, bagTimeLeft, shipTakesTap, type LootBagSpot } from "./lootBag";

const spot = (id: string, q: number, r: number, buried: boolean): LootBagSpot => ({
  id,
  q,
  r,
  buried,
  leftMs: 3600_000,
});

describe("bagMarksOf", () => {
  it("несколько на клетке — одна метка с числом; мешочек важнее бугорка", () => {
    expect(
      bagMarksOf([spot("a", 1, 2, true), spot("b", 1, 2, false), spot("c", 3, 4, true)]),
    ).toEqual({ "1,2": { n: 2, buried: false }, "3,4": { n: 1, buried: true } });
  });

  it("рыба от красного динамита (30.10.2026): клетка — рыба, если сверху только рыба", () => {
    const fish = (id: string, q: number, r: number): LootBagSpot => ({
      ...spot(id, q, r, false),
      fish: true,
    });
    expect(
      bagMarksOf([
        fish("f1", 1, 1),
        fish("f2", 2, 2),
        spot("m", 2, 2, true),
        fish("f3", 3, 3),
        spot("b", 3, 3, false),
      ]),
    ).toEqual({
      "1,1": { n: 1, buried: false, fish: true },
      "2,2": { n: 2, buried: false, fish: true },
      "3,3": { n: 2, buried: false },
    });
  });

  it("старый/кривой ответ — пустой слой, а не падение", () => {
    expect(bagMarksOf(undefined)).toEqual({});
    expect(bagMarksOf("oops" as unknown as LootBagSpot[])).toEqual({});
  });
});

describe("bagTimeLeft", () => {
  it("от ответа сервера часами телефона, вниз до минут", () => {
    const got = 1_000;
    expect(bagTimeLeft(24 * 3600_000, got, got)).toEqual({ h: 24, m: 0 });
    expect(bagTimeLeft(24 * 3600_000, got, got + 90_000)).toEqual({ h: 23, m: 58 });
    expect(bagTimeLeft(59_000, got, got)).toEqual({ h: 0, m: 0 });
  });

  it("срок вышел — null (мешочек гаснет сам, без сборщика)", () => {
    expect(bagTimeLeft(60_000, 0, 60_000)).toBeNull();
    expect(bagTimeLeft(0, 0, 0)).toBeNull();
  });
});

describe("под декором (дополнение №5)", () => {
  it("мешочек и бугорок под деревом не рисуются; срубили — снова видны", async () => {
    const { notUnderDecor } = await import("@/lib/lootBag");
    const spots = [
      { id: "lb_a", q: 1, r: 2, buried: false, leftMs: 1 },
      { id: "cm_3_4", q: 3, r: 4, buried: true, leftMs: 1 },
    ];
    const decor = new Set(["1,2", "3,4"]);
    const at = (q: number, r: number) => decor.has(`${q},${r}`);
    expect(notUnderDecor(spots, at)).toEqual([]);
    decor.delete("1,2");
    expect(notUnderDecor(spots, at).map((s) => s.id)).toEqual(["lb_a"]);
  });
});

describe("корабль на клетке и тап (30.10.2026)", () => {
  it("корабль важнее мешочка; рыба под моим кораблём (я в экипаже) — тап рыбе", () => {
    const fish = { n: 1, buried: false, fish: true as const };
    const bag = { n: 1, buried: false };
    expect(shipTakesTap(fish, { mine: true })).toBe(false);
    expect(shipTakesTap(fish, { mine: false })).toBe(true);
    expect(shipTakesTap(bag, { mine: true })).toBe(true);
    expect(shipTakesTap(fish, undefined)).toBe(false);
    expect(shipTakesTap(bag, undefined)).toBe(false);
  });
});
