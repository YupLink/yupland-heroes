// Иммунитет артефакта едет в бой даже когда бонусы героя по боссам выключены:
// immunityOnly обнуляет множители, но сохраняет softImmune и не трогает кубик.
import { afterEach, describe, expect, it, vi } from "vitest";
import { immunityOnly } from "./encounter-hero-apply";
import { simulateEncounter } from "./encounter-sim";
import { heroCombat, rollLuckMult, rollMiss } from "@/lib/hero/heroPowerCurve";
import { zeroStats } from "@/lib/hero/heroStatSources";
import type { PendingEffect } from "./chip-effects";

// chip-effects тянет мост к базе — в тестах он заглушка, ни одной строки наружу.
vi.mock("../../db/mcpClient", () => ({
  mcpExec: () => Promise.reject(new Error("тесты не ходят в базу")),
}));
const { mergeEffect } = await import("./chip-effects");

const strong = () => heroCombat({ ...zeroStats(), atk: 50, hp: 30, arm: 80, luck: 60 }, ["slow"]);

afterEach(() => vi.restoreAllMocks());

describe("immunityOnly", () => {
  it("сохраняет иммунитеты и обнуляет бонусы", () => {
    const h = immunityOnly(strong());
    expect([...h.softImmune]).toEqual(["slow"]);
    expect(h.atkMult).toBe(1);
    expect(h.hpMult).toBe(1);
    expect(h.missPct).toBe(0);
    expect(h.luckPct).toBe(0);
  });

  it("не тратит ни одного броска кубика", () => {
    const h = immunityOnly(strong());
    const rnd = vi.fn(() => 0);
    expect(rollLuckMult(h, rnd)).toBe(1);
    expect(rollMiss(h, rnd)).toBe(false);
    expect(rnd).not.toHaveBeenCalled();
  });
});

describe("simulateEncounter с иммунитетом", () => {
  const lineup = [{ templateId: "t", level: 5, chipId: "c1", name: "Мурзик" }];
  const slow100 = [{ kind: "slow" as const, chance: 100, value: 2, duration: 5 }];

  it("slow 100% не вешается на героя с иммунитетом (даже без бонусов)", () => {
    const sim = simulateEncounter({
      lineup,
      targetHp: 5_000,
      trialStatScale: 1,
      abilities: slow100,
      hero: immunityOnly(heroCombat(zeroStats(), ["slow"])),
    });
    expect(sim.rounds).toBeGreaterThan(1);
    expect(sim.side.slow).toBeNull();
  });

  it("без героя тот же бой вешает замедление", () => {
    const sim = simulateEncounter({
      lineup,
      targetHp: 5_000,
      trialStatScale: 1,
      abilities: slow100,
    });
    expect(sim.side.slow).not.toBeNull();
  });

  it("immunityOnly без иммунитетов даёт бой байт в байт как без героя", () => {
    // Один и тот же поток случайных чисел на оба прогона.
    const seq = Array.from({ length: 20_000 }, (_, i) => ((i * 7919) % 1000) / 1000);
    let at = 0;
    vi.spyOn(Math, "random").mockImplementation(() => seq[at++ % seq.length]);
    const a = simulateEncounter({ lineup, targetHp: 3_000, trialStatScale: 1, abilities: slow100 });
    at = 0;
    const b = simulateEncounter({
      lineup,
      targetHp: 3_000,
      trialStatScale: 1,
      abilities: slow100,
      hero: immunityOnly(heroCombat(zeroStats())),
    });
    expect(b.dealt).toBe(a.dealt);
    expect(b.rounds).toBe(a.rounds);
    expect(b.log).toEqual(a.log);
    expect(b.side).toEqual(a.side);
  });
});

describe("mergeEffect (яд/оглушение за бой)", () => {
  it("минуты складываются без потолка, сила — среднее по времени", () => {
    let acc: PendingEffect = { chipId: "c", kind: "poison", value: 10, minutes: 20 };
    for (let i = 0; i < 100; i++) {
      acc = mergeEffect(acc, { chipId: "c", kind: "poison", value: 10, minutes: 20 });
    }
    expect(acc).toEqual({ chipId: "c", kind: "poison", value: 10, minutes: 2020 });
    const mixed = mergeEffect(
      { chipId: "c", kind: "poison", value: 30, minutes: 10 },
      { chipId: "c", kind: "poison", value: 10, minutes: 30 },
    );
    expect(mixed.value).toBe(15);
    expect(mixed.minutes).toBe(40);
  });
});
