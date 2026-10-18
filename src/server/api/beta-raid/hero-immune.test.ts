// Временный иммунитет героя: чтение строк immune_*, слияние с иммунитетами от
// вещей и то, что бой (resistedChance) действительно перестаёт накладывать
// дебафф — в том числе на пути immunityOnly (бонусы героя по боссам выключены).
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ rows: [] as Array<{ kind: string }>, sql: [] as string[] }));

vi.mock("../../db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    state.sql.push(sql);
    return state.rows;
  },
}));

import { immuneHero, loadImmuneKinds, loadImmuneTargets } from "./hero-immune";
import { abilityResist, immunityOnly, resistedChance } from "./encounter-hero-apply";
import { heroCombat } from "@/lib/hero/heroPowerCurve";
import { IMMUNE_KINDS } from "@/lib/hero/boostImmune";
import type { HeroPowerInfo } from "./hero-power";
import type { HeroStats } from "@/lib/heroStats";

const STATS: HeroStats = { atk: 5, arm: 5, int: 5, spd: 5, hp: 5, luck: 5 };
/** Герой с иммунитетом к замедлению от ботинок. immuneHero читает только stats и combat. */
const hero = () => ({ stats: STATS, combat: heroCombat(STATS, ["slow"]) }) as HeroPowerInfo;

beforeEach(() => {
  state.rows = [];
  state.sql = [];
});

describe("loadImmuneKinds", () => {
  it("берёт только живые строки immune_* своего аккаунта", async () => {
    state.rows = [{ kind: "immune_poison" }];
    expect([...(await loadImmuneKinds("acc_1"))]).toEqual(["poison"]);
    expect(state.sql[0]).toMatch(/left\(kind, 7\) = 'immune_'/);
    expect(state.sql[0]).toMatch(/expires_at > now\(\)/);
    expect(state.sql[0]).toMatch(/account_id = 'acc_1'/);
  });

  it("«Все» раскрывается, мусор выпадает", async () => {
    state.rows = [{ kind: "immune_all" }, { kind: "immune_gone" }];
    expect((await loadImmuneKinds("acc_1")).size).toBe(IMMUNE_KINDS.length);
    expect([...(await loadImmuneTargets("acc_1"))]).toEqual(["all"]);
  });

  it("без аккаунта в базу не ходит", async () => {
    expect((await loadImmuneKinds("")).size).toBe(0);
    expect(state.sql).toHaveLength(0);
  });
});

describe("immuneHero", () => {
  it("добавляет к иммунитетам от вещей, ничего не снимая", () => {
    const out = immuneHero(hero(), new Set(["poison" as const]));
    expect([...out.combat.softImmune].sort()).toEqual(["poison", "slow"]);
    // Статы и кривая те же: иммунитет не бафф характеристик.
    expect(out.stats).toEqual(STATS);
    expect(out.combat.atkMult).toBe(hero().combat.atkMult);
  });

  it("пусто — тот же объект", () => {
    const h = hero();
    expect(immuneHero(h, new Set())).toBe(h);
  });

  it("бой не накладывает закрытый дебафф — и через immunityOnly тоже", () => {
    const out = immuneHero(hero(), new Set(["weak_arm" as const]));
    for (const combat of [out.combat, immunityOnly(out.combat)]) {
      const r = abilityResist(combat);
      expect(resistedChance("weak_arm", 50, r)).toBe(0);
      expect(resistedChance("slow", 50, r)).toBe(0);
      expect(resistedChance("poison", 50, r)).toBe(50);
    }
  });
});
