// Сдача тренировочных фишек: 10 сильнейших остаются, сдаются слабейшие, 5 энергии за звезду.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ENERGY_PER_STAR, TRAINING_KEEP, trainingSalePlan } from "./trainingSale";
import { ISLAND_HOLD_CAP } from "./exitCap";

const chip = (id: string, star: number, at = "2026-11-01") => ({ id, star, obtainedAt: at });

describe("сдача тренировочных фишек", () => {
  it("10 и меньше — сдавать нечего", () => {
    const ten = Array.from({ length: TRAINING_KEEP }, (_, i) => chip(`c${i}`, 1));
    expect(trainingSalePlan(ten, 5)).toMatchObject({ ids: [], energy: 0, sellable: 0 });
  });

  it("сдаются слабейшие, сильнейшие остаются; энергия — 5 за звезду", () => {
    const chips = [
      ...Array.from({ length: 10 }, (_, i) => chip(`top${i}`, 3)),
      chip("a1", 1),
      chip("a2", 2),
      chip("a3", 1),
    ];
    const p = trainingSalePlan(chips, 2);
    expect(p.sellable).toBe(3);
    expect(p.ids.sort()).toEqual(["a1", "a3"]);
    expect(p.energy).toBe(2 * ENERGY_PER_STAR);
    expect(p.steps).toEqual([5, 10, 20]);
    expect(trainingSalePlan(chips, 99).energy).toBe(20);
  });

  it("сильная фишка не уходит, пока есть слабее", () => {
    const chips = [...Array.from({ length: 10 }, (_, i) => chip(`x${i}`, 1)), chip("big", 5)];
    // 11 фишек: 5★ входит в десятку сильнейших, сдаётся одна из 1★.
    expect(trainingSalePlan(chips, 1).ids).not.toContain("big");
  });
});

describe("потолок накопления: числа кода = числа базы (island-14)", () => {
  it("res_move держит те же 15 000 / 5 000 / 2 000 / 10", () => {
    const sql = readFileSync("migrations/island-14-res-hold-cap.sql", "utf8");
    for (const [r, v] of Object.entries(ISLAND_HOLD_CAP))
      expect(sql).toContain(`WHEN '${r}' THEN ${v}`);
    expect(sql).toContain("RAISE EXCEPTION 'island.res_cap'");
    expect(sql).toContain("p_kind NOT IN ('gold_shop','admin_grant')");
  });
});
