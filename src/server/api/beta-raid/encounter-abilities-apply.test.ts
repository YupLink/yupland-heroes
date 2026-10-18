// Усреднение дебаффов за бой: повтор ПРОДЛЕВАЕТ (минуты копятся без потолка —
// их задаёт админ), сила — среднее по времени, и она НИКОГДА не выходит за
// границы бросков. Раньше обрезанный знаменатель раздувал weak_luck 40 до 200
// за 25 раундов (player09, 20.09).
import { describe, expect, it } from "vitest";
import { applyTargetAbilities, mergeTimed } from "./encounter-abilities-apply";
import type { AbilityCfg } from "./abilities";
import type { FieldChip, SimResult, SimSideEffects } from "./encounter-sim-types";

const chip = (): FieldChip => ({
  level: 1,
  hp: 100,
  maxHp: 100,
  training: false,
  atkBase: 1,
  atkMult: 1,
  chipId: "chip_1",
  name: "Мурзик",
  poisonPct: 0,
});

/** Прогнать одну способность rounds раз по одному и тому же строю. */
function run(abilities: AbilityCfg[], rounds: number): SimSideEffects {
  const side: SimSideEffects = { burnedEnergy: 0, slow: null, weaken: {}, chipEffects: [] };
  const abilityLog: SimResult["abilities"] = [];
  const field = [chip()];
  for (let round = 1; round <= rounds; round++) {
    applyTargetAbilities({ abilities, field, round, side, abilityLog, stunnedOut: [] });
  }
  return side;
}

describe("mergeTimed", () => {
  it("первый прок кладёт значение и минуты как есть — потолка нет", () => {
    expect(mergeTimed(null, 40, 15)).toEqual({ value: 40, minutes: 15 });
    expect(mergeTimed(null, 40, 500)).toEqual({ value: 40, minutes: 500 });
  });

  it("повтор того же значения не меняет силу, минуты копятся", () => {
    let acc: { value: number; minutes: number } | null = null;
    for (let i = 0; i < 100; i++) acc = mergeTimed(acc, 40, 15);
    expect(acc).toEqual({ value: 40, minutes: 1500 });
  });

  it("разные значения дают среднее в границах бросков", () => {
    const m = mergeTimed({ value: 40, minutes: 60 }, 20, 15);
    expect(m.value).toBeGreaterThanOrEqual(20);
    expect(m.value).toBeLessThanOrEqual(40);
    expect(m.minutes).toBe(75);
  });
});

describe("applyTargetAbilities — ослабление и замедление", () => {
  it("weak_luck 40 @100% × 100 раундов остаётся 40, минуты копятся", () => {
    const side = run([{ kind: "weak_luck", chance: 100, value: 40, duration: "10-20" }], 100);
    expect(side.weaken.weak_luck?.value).toBe(40);
    expect(side.weaken.weak_luck?.minutes).toBeGreaterThanOrEqual(1000);
  });

  it("slow 12 @100% × 100 раундов остаётся 12 (раньше росло до 200+), минуты 2500", () => {
    const side = run([{ kind: "slow", chance: 100, value: 12, duration: 25 }], 100);
    expect(side.slow).toEqual({ extraCost: 12, minutes: 2500 });
  });

  it("смешанные броски 20-40 не выходят за [20, 40]", () => {
    const side = run([{ kind: "weak_arm", chance: 100, value: "20-40", duration: 10 }], 200);
    const w = side.weaken.weak_arm;
    expect(w).toBeTruthy();
    expect(w!.value).toBeGreaterThanOrEqual(20);
    expect(w!.value).toBeLessThanOrEqual(40);
  });

  it("яд на фишке: минуты прока — как задал админ, без потолка", () => {
    const side = run([{ kind: "poison", chance: 100, value: 5, duration: 2000 }], 3);
    expect(side.chipEffects).toHaveLength(3);
    for (const e of side.chipEffects) expect(e.minutes).toBe(2000);
  });
});
