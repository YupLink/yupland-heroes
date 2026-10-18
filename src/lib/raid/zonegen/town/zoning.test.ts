// Правила соседства (таблица zoning спецификации): `bun run test`.
//
// Скелет здесь нарисован руками — центр, площадь-кольцо, две магистрали от
// ворот, — чтобы проверять ровно правило, а не весь рост: «храм в двух от
// ратуши», «таверна у ворот», «казарма не вплотную к ратуше», «кузница у края».
import { describe, expect, it } from "vitest";
import type { ZoneCell } from "@/lib/raid/zonegen/recipe";
import { buildFields } from "@/lib/raid/zonegen/town/fields";
import { disk, key, ring } from "@/lib/raid/zonegen/town/hex";
import type { TownForm, TownRole, TownSkeleton } from "@/lib/raid/zonegen/town/types";
import { landValue, roadIndex } from "@/lib/raid/zonegen/town/value";
import { interest } from "@/lib/raid/zonegen/town/zoning";
import type { Placed, ZoneCtx } from "@/lib/raid/zonegen/town/zoning-ctx";

const C: ZoneCell = { q: 0, r: 0 };

/** Город Rb = 5: площадь — кольцо 1, магистрали с востока и запада. */
function skeleton(form: TownForm = "town"): TownSkeleton {
  const roads = new Map<string, number>();
  for (let q = 2; q <= 5; q++) {
    roads.set(key(q, 0), 1);
    roads.set(key(-q, 0), 1);
  }
  return {
    form,
    radius: 5,
    center: C,
    plaza: form === "town" || form === "port" ? ring(C, 1) : [],
    green: [],
    gates: [
      { q: 5, r: 0 },
      { q: -5, r: 0 },
    ],
    roads,
  };
}

function ctx(
  placed: Array<[TownRole, number, number, string?]>,
  opts: { form?: TownForm; optionId?: string; water?: string[]; nth?: number } = {},
): ZoneCtx {
  const sk = skeleton(opts.form);
  const fields = buildFields({
    cells: disk(C, 7),
    occupied: new Set(),
    water: new Set(opts.water ?? []),
    decorBlocked: new Set(),
    mapRoads: new Set(),
  });
  const index = roadIndex(sk);
  const list: Placed[] = placed.map(([role, q, r, id]) => ({
    q,
    r,
    role,
    optionId: id ?? role,
    optionRole: role,
    smelter: false,
  }));
  return {
    skeleton: sk,
    fields,
    index,
    placed: list,
    value: (c) => landValue(c, sk, fields, index),
    optionId: opts.optionId ?? "x",
    smelter: false,
    nth: opts.nth ?? 0,
  };
}

const at = (q: number, r: number): ZoneCell => ({ q, r });

describe("interest — вето и предпочтения ролей", () => {
  it("храм — ровно в 2 от ратуши, не рядом с кузницей", () => {
    const withHall = ctx([["town_hall", 0, 0]]);
    expect(interest("temple", at(0, 2), withHall)).toBeGreaterThan(0);
    expect(interest("temple", at(1, 1), withHall)).toBeGreaterThan(0);
    expect(interest("temple", at(0, 3), withHall)).toBe(0);
    const nearForge = ctx([
      ["town_hall", 0, 0],
      ["forge", 1, 2],
    ]);
    expect(interest("temple", at(0, 2), nearForge)).toBe(0);
  });

  it("таверна №1 — не дальше 2 от ворот", () => {
    const c = ctx([]);
    expect(interest("tavern", at(4, 1), c)).toBeGreaterThan(0);
    expect(interest("tavern", at(0, 3), c)).toBe(0);
  });

  it("казарма не соседствует с ратушей и тянется к краю", () => {
    const c = ctx([["town_hall", 0, 0]]);
    expect(interest("barracks", at(0, 1), c)).toBe(0);
    expect(interest("barracks", at(0, 5), c)).toBeGreaterThan(interest("barracks", at(1, 1), c));
  });

  it("одинаковые рынки не соприкасаются, разные — можно", () => {
    const placed: Array<[TownRole, number, number, string?]> = [["market", 2, 1, "m1"]];
    expect(interest("market", at(3, 1), ctx(placed, { optionId: "m1", nth: 1 }))).toBe(0);
    expect(interest("market", at(3, 1), ctx(placed, { optionId: "m2", nth: 1 }))).toBeGreaterThan(
      0,
    );
  });

  it("кузница в городе — только у края и не ближе 3 к храму", () => {
    expect(interest("forge", at(0, 2), ctx([]))).toBe(0);
    expect(interest("forge", at(0, 4), ctx([]))).toBeGreaterThan(0);
    expect(interest("forge", at(0, 4), ctx([["temple", 0, 2]]))).toBe(0);
  });

  it("верфь — только с двумя соседями-водой и не у площади", () => {
    expect(interest("shipyard", at(0, 5), ctx([]))).toBe(0);
    const wet = ctx([], { water: [key(0, 6), key(1, 5)] });
    expect(interest("shipyard", at(0, 5), wet)).toBeGreaterThan(0);
  });

  it("университет — в 2–4 от площади, подальше от ремесла", () => {
    expect(interest("university", at(0, 3), ctx([]))).toBeGreaterThan(0);
    expect(interest("university", at(0, 7), ctx([]))).toBe(0);
    expect(interest("university", at(0, 3), ctx([["forge", 0, 5]]))).toBe(0);
  });

  it("арена — у края, в 3 от ворот, не ближе 3 к храму", () => {
    expect(interest("arena", at(4, 1), ctx([]))).toBeGreaterThan(0);
    expect(interest("arena", at(0, 4), ctx([]))).toBe(0);
    expect(interest("arena", at(4, 1), ctx([["temple", 3, 1]]))).toBe(0);
  });

  it("в деревне между домами — двор (λ0 = 2), в городе — вплотную можно", () => {
    const placed: Array<[TownRole, number, number, string?]> = [["house", 2, 1]];
    expect(interest("house", at(3, 1), ctx(placed, { form: "cluster" }))).toBe(0);
    expect(interest("house", at(3, 1), ctx(placed, { form: "town" }))).toBeGreaterThan(0);
    // Смежный рост: дальше двух клеток от застройки дом не встаёт.
    expect(interest("house", at(-4, 2), ctx(placed, { form: "town" }))).toBe(0);
  });

  it("покои не вплотную к кузнице", () => {
    expect(interest("chambers", at(0, 2), ctx([["forge", 0, 3]]))).toBe(0);
    expect(interest("chambers", at(0, 2), ctx([]))).toBeGreaterThan(0);
  });
});
