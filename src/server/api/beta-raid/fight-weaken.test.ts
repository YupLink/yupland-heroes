// Ослабление героя действует сразу (задачник 23.09): босс сбил атаку в первом
// раунде — со второго отряд бьёт слабее, а не со следующего боя. Сила — как
// посчитает база: среднее по времени с тем, что уже висело.
import { afterEach, describe, expect, it, vi } from "vitest";
import { heroCombat } from "@/lib/hero/heroPowerCurve";
import { zeroStats } from "@/lib/hero/heroStatSources";
import { immunityOnly } from "./encounter-hero-apply";

vi.mock("../../db/mcpClient", () => ({
  mcpExec: () => Promise.reject(new Error("тесты не ходят в базу")),
}));
const { simulateEncounter } = await import("./encounter-sim");
const { fightWeakenMap, makeReweaken, mergeNow } = await import("./fight-weaken");

afterEach(() => vi.restoreAllMocks());

describe("mergeNow — сила как в базе", () => {
  it("ничего не висело — сила наложенного", () => {
    expect(mergeNow(undefined, { value: 40, minutes: 5 })).toBe(40);
  });
  it("та же сила — не складывается", () => {
    expect(mergeNow({ value: 40, sec: 600 }, { value: 40, minutes: 5 })).toBe(40);
  });
  it("разная сила — среднее по времени", () => {
    // 20 ещё 10 минут + 80 на 10 минут → 50.
    expect(mergeNow({ value: 20, sec: 600 }, { value: 80, minutes: 10 })).toBe(50);
  });
});

describe("fightWeakenMap", () => {
  it("висевшее остаётся, наложенное сливается по своему виду", () => {
    const map = fightWeakenMap(
      { weak_arm: { value: 30, sec: 300 }, weak_atk: { value: 20, sec: 600 } },
      { weak_atk: { value: 80, minutes: 10 } },
    );
    expect(map).toEqual({ weak_arm: 30, weak_atk: 50 });
  });
});

describe("makeReweaken", () => {
  const info = { stats: { ...zeroStats(), atk: 100 }, effects: zeroStats() };
  const base = {
    buffed: { ...info, combat: heroCombat(info.stats) } as never,
    immune: new Set<never>(),
  };

  it("снимает пункты и не пересобирает героя, пока сила та же", () => {
    const re = makeReweaken(base, {});
    const a = re({ weak_atk: { value: 60, minutes: 5 } });
    expect(a.atkMult).toBeLessThan(heroCombat(info.stats).atkMult);
    // Продлили минуты — сила та же: тот же объект героя.
    expect(re({ weak_atk: { value: 60, minutes: 10 } })).toBe(a);
  });
});

describe("simulateEncounter: ослабление в этом же бою", () => {
  const lineup = [1, 2, 3].map((i) => ({ templateId: "t", level: 5, chipId: `c${i}` }));
  const weakAtk = [{ kind: "weak_atk" as const, chance: 100, value: 100, duration: 10 }];
  const strong = () => heroCombat({ ...zeroStats(), atk: 100 });
  const fight = (opts: Partial<Parameters<typeof simulateEncounter>[0]>) => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    return simulateEncounter({
      lineup,
      targetHp: 50_000,
      trialStatScale: 1,
      damage: "1",
      abilities: weakAtk,
      hero: strong(),
      ...opts,
    });
  };

  it("со второго раунда отряд бьёт слабее; первый раунд — как был", () => {
    const reweaken = vi.fn((w: { weak_atk?: { value: number } }) =>
      heroCombat({ ...zeroStats(), atk: Math.max(0, 100 - (w.weak_atk?.value ?? 0)) }),
    );
    const before = fight({});
    vi.restoreAllMocks();
    const now = fight({ reweaken });
    expect(now.log[0].playerDmg).toBe(before.log[0].playerDmg);
    expect(now.log[1].playerDmg).toBeLessThan(before.log[1].playerDmg);
    // Первый пересчёт — сразу после наложения в первом раунде.
    expect(reweaken.mock.calls[0][0].weak_atk?.value).toBe(100);
    expect(now.side.weaken.weak_atk?.value).toBe(100);
  });

  it("цель не ослабляет — пересчёта нет, бой прежний", () => {
    const reweaken = vi.fn(() => strong());
    const sim = fight({ abilities: [], reweaken });
    expect(reweaken).not.toHaveBeenCalled();
    expect(sim.side.weaken).toEqual({});
  });

  it("без героя пересчёт не зовётся", () => {
    const reweaken = vi.fn(() => strong());
    fight({ hero: undefined, reweaken });
    expect(reweaken).not.toHaveBeenCalled();
  });

  it("герой только с иммунитетами: пересчёта не передают — бой как раньше", () => {
    const sim = fight({ hero: immunityOnly(strong()) });
    expect(sim.side.weaken.weak_atk?.value).toBe(100);
  });
});
