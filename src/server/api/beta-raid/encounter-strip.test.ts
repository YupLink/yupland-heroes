// «Снятие иммунитетов» в бою: срабатывает, минуты — от админа, иммунитет вещи
// и зелья «ко всему» не спасает, а без способности в настройке кубик не
// трогается вовсе.
import { afterEach, describe, expect, it, vi } from "vitest";
import { applyTargetAbilities } from "./encounter-abilities-apply";
import { rollStripImmune } from "./encounter-strip";
import { abilityResist, immunityOnly, type HeroResist } from "./encounter-hero-apply";
import { abilityTotals } from "./encounter-ability-totals";
import { simulateEncounter } from "./encounter-sim";
import { heroCombat } from "@/lib/hero/heroPowerCurve";
import { IMMUNE_KINDS, expandImmune } from "@/lib/hero/boostImmune";
import type { AbilityCfg, AbilityKind } from "./abilities";
import type { FieldChip, SimResult, SimSideEffects } from "./encounter-sim-types";
import type { HeroStats } from "@/lib/heroStats";

const ZERO: HeroStats = { atk: 0, arm: 0, int: 0, spd: 0, hp: 0, luck: 0 };
const STRIP: AbilityCfg = { kind: "strip_immune", chance: 100, value: 0, duration: 7 };
const POISON: AbilityCfg = { kind: "poison", chance: 100, value: 5, duration: 5 };

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
const newSide = (): SimSideEffects => ({
  burnedEnergy: 0,
  slow: null,
  weaken: {},
  chipEffects: [],
});

/** Сопротивление героя с иммунитетом от надетой вещи (ботинки, амулет). */
const gearResist = (kinds: AbilityKind[]): HeroResist => abilityResist(heroCombat(ZERO, kinds));

function round(abilities: AbilityCfg[], resist?: HeroResist, side = newSide(), n = 1) {
  const abilityLog: SimResult["abilities"] = [];
  applyTargetAbilities({
    abilities,
    field: [chip()],
    round: n,
    side,
    abilityLog,
    stunnedOut: [],
    resist,
  });
  return { side, abilityLog };
}

afterEach(() => vi.restoreAllMocks());

describe("снятие иммунитетов — срабатывание и минуты", () => {
  it("сработало: минуты админа уходят в побочки, в лог и в итог боя", () => {
    const { side, abilityLog } = round([STRIP]);
    expect(side.strip).toEqual({ minutes: 7 });
    expect(abilityLog).toEqual([{ round: 1, kind: "strip_immune", amount: 7 }]);
    expect(abilityTotals(abilityLog, 0, side).strip_immune).toBe(7);
  });

  it("длительность — как задал админ, без потолка; диапазон катится внутри", () => {
    expect(round([{ ...STRIP, duration: 600 }]).side.strip).toEqual({ minutes: 600 });
    for (let i = 0; i < 50; i++) {
      const m = round([{ ...STRIP, duration: "5-10" }]).side.strip?.minutes ?? 0;
      expect(m).toBeGreaterThanOrEqual(5);
      expect(m).toBeLessThanOrEqual(10);
    }
  });

  it("повтор в бою продлевает: минуты складываются", () => {
    const side = newSide();
    for (let n = 1; n <= 3; n++) round([STRIP], undefined, side, n);
    expect(side.strip).toEqual({ minutes: 21 });
  });

  it("шанс 0 не срабатывает и ничего не вешает", () => {
    const { side, abilityLog } = round([{ ...STRIP, chance: 0 }]);
    expect(side.strip ?? null).toBeNull();
    expect(abilityLog).toHaveLength(0);
  });
});

describe("снятие иммунитетов — иммунитет не спасает", () => {
  it("иммунитет вещи к яду: без снятия яд не ложится, со снятием — в том же раунде", () => {
    expect(round([POISON], gearResist(["poison"])).side.chipEffects).toHaveLength(0);
    const resist = gearResist(["poison", "slow"]);
    const { side } = round([POISON, STRIP], resist);
    expect(side.chipEffects.map((e) => e.kind)).toEqual(["poison"]);
    // Набор иммунитетов пуст до конца боя.
    expect(resist.soft.size).toBe(0);
  });

  it("путь immunityOnly (бонусы по боссам выключены) — то же самое", () => {
    const resist = abilityResist(immunityOnly(heroCombat(ZERO, ["poison"])));
    expect(round([POISON, STRIP], resist).side.chipEffects).toHaveLength(1);
  });

  it("к самому снятию иммунитета нет — даже у зелья «ко всему»", () => {
    expect(IMMUNE_KINDS).not.toContain("strip_immune");
    expect(expandImmune(["all"]).has("strip_immune")).toBe(false);
    const resist = abilityResist(heroCombat(ZERO, expandImmune(["all"])));
    expect(round([STRIP], resist).side.strip).toEqual({ minutes: 7 });
  });

  it("полный бой: герой с иммунитетом к яду отравлен, если цель снимает иммунитеты", () => {
    const hero = heroCombat(ZERO, ["poison"]);
    const base = { lineup: [{ templateId: "t", level: 1, chipId: "c1" }], trialStatScale: 1 };
    // Цель живуча, а фишку выбивает первым же ответом: бой ровно в один раунд.
    const fight = (abilities: AbilityCfg[]) =>
      simulateEncounter({ ...base, targetHp: 1e9, damage: 1e6, abilities, hero });
    expect(fight([POISON]).side.chipEffects).toHaveLength(0);
    const stripped = fight([POISON, STRIP]);
    expect(stripped.rounds).toBe(1);
    expect(stripped.side.chipEffects.map((e) => e.kind)).toEqual(["poison"]);
    expect(stripped.side.strip).toEqual({ minutes: 7 });
  });
});

describe("снятие иммунитетов — без способности лишних бросков нет", () => {
  it("нет в настройке — тот же список и ни одного Math.random", () => {
    const spy = vi.spyOn(Math, "random");
    const abilities: AbilityCfg[] = [
      { kind: "poison", chance: 30, value: "3-6", duration: "10-20" },
      { kind: "slow", chance: 40, value: 2, duration: 5 },
    ];
    const side = newSide();
    expect(rollStripImmune({ abilities, round: 1, side, abilityLog: [] })).toBe(abilities);
    expect(spy).not.toHaveBeenCalled();
    expect(side.strip ?? null).toBeNull();
  });

  it("раунд с ядом 100% и фиксированными числами кубик не трогает", () => {
    const spy = vi.spyOn(Math, "random");
    round([POISON], gearResist(["slow"]));
    expect(spy).not.toHaveBeenCalled();
  });

  it("со снятием — ровно один бросок шанса на раунд", () => {
    const spy = vi.spyOn(Math, "random").mockReturnValue(0.99);
    const { side } = round([POISON, { ...STRIP, chance: 50 }]);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(side.strip ?? null).toBeNull();
  });
});
