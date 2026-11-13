// «Снятие иммунитетов» на аккаунте: пока строка жива — герой идёт в бой без
// иммунитетов (и от вещей, и от зелий); истекла — всё возвращается; после боя
// эффект ложится строкой strip_immune с минутами, как задал админ.
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  rows: [] as unknown[],
  sql: [] as string[],
  fail: false,
  effects: [] as Array<{ wallet: string; kind: string; value: number; minutes: number }>,
}));

vi.mock("../../db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    state.sql.push(sql);
    if (state.fail) throw new Error("db down");
    return state.rows;
  },
}));
vi.mock("./owner", () => ({ raidOwner: async () => "acc_1" }));
vi.mock("./encounter-effects", () => ({
  applyPlayerEffect: async (wallet: string, kind: string, value: number, minutes: number) => {
    state.effects.push({ wallet, kind, value, minutes });
  },
  applySlow: async () => {},
  applyWeaken: async () => {},
  burnEnergy: async () => 0,
}));
vi.mock("./chip-effects", () => ({ applyChipEffects: async () => {} }));

import { stripActive, stripHero, withStrip } from "./hero-strip";
import { applySideEffects } from "./encounter-side-apply";
import { immuneHero } from "./hero-immune";
import { abilityResist, immunityOnly, resistedChance } from "./encounter-hero-apply";
import { heroCombat } from "@/lib/hero/heroPowerCurve";
import type { HeroPowerInfo } from "./hero-power";
import type { HeroStats } from "@/lib/heroStats";

const STATS: HeroStats = { atk: 5, arm: 5, int: 5, spd: 5, hp: 5, luck: 5 };
/** Ботинки с иммунитетом к замедлению + выпитое зелье от яда. */
const hero = () =>
  immuneHero(
    { stats: STATS, combat: heroCombat(STATS, ["slow"]) } as HeroPowerInfo,
    new Set(["poison" as const]),
  );

beforeEach(() => {
  state.rows = [];
  state.sql = [];
  state.fail = false;
  state.effects = [];
});

describe("withStrip — герой для боя", () => {
  it("снятие висит: иммунитеты от вещи и от зелья не действуют, статы те же", async () => {
    state.rows = [{ x: 1 }];
    const h = hero();
    const out = await withStrip("w1", h);
    expect(out?.combat.softImmune.size).toBe(0);
    expect(out?.combat.atkMult).toBe(h.combat.atkMult);
    expect(out?.stats).toEqual(STATS);
    // Кэш героя не тронут: снятие — копия, не правка общего объекта.
    expect([...h.combat.softImmune].sort()).toEqual(["poison", "slow"]);
    for (const combat of [out!.combat, immunityOnly(out!.combat)]) {
      const r = abilityResist(combat);
      expect(resistedChance("slow", 40, r)).toBe(40);
      expect(resistedChance("poison", 40, r)).toBe(40);
    }
    expect(state.sql[0]).toMatch(/kind = 'strip_immune'/);
    expect(state.sql[0]).toMatch(/expires_at > now\(\)/);
    expect(state.sql[0]).toMatch(/account_id = 'acc_1'/);
  });

  it("истекло (живых строк нет) — иммунитеты возвращаются", async () => {
    const h = hero();
    const out = await withStrip("w1", h);
    expect(out).toBe(h);
    expect(resistedChance("slow", 40, abilityResist(out!.combat))).toBe(0);
  });

  it("иммунитетов нет — в базу не ходим; героя нет — тоже", async () => {
    const bare = { stats: STATS, combat: heroCombat(STATS) } as HeroPowerInfo;
    expect(await withStrip("w1", bare)).toBe(bare);
    expect(await withStrip("w1", null)).toBeNull();
    expect(state.sql).toHaveLength(0);
  });

  it("сбой чтения — герой как есть, бой не падает", async () => {
    state.fail = true;
    const h = hero();
    expect(await withStrip("w1", h)).toBe(h);
  });

  it("stripActive без аккаунта в базу не ходит; stripHero без иммунитетов — тот же объект", async () => {
    expect(await stripActive("")).toBe(false);
    expect(state.sql).toHaveLength(0);
    const bare = { stats: STATS, combat: heroCombat(STATS) } as HeroPowerInfo;
    expect(stripHero(bare)).toBe(bare);
  });
});

describe("applySideEffects — снятие ложится на аккаунт", () => {
  const side = () => ({ burnedEnergy: 0, slow: null, weaken: {}, chipEffects: [] });

  it("минуты боя уходят строкой strip_immune", async () => {
    await applySideEffects("w1", { ...side(), strip: { minutes: 45 } }, "[t]", "Босс");
    expect(state.effects).toEqual([{ wallet: "w1", kind: "strip_immune", value: 1, minutes: 45 }]);
  });

  it("не сработало — ничего не пишем", async () => {
    await applySideEffects("w1", side(), "[t]", "Босс");
    await applySideEffects("w1", { ...side(), strip: null }, "[t]", "Босс");
    expect(state.effects).toHaveLength(0);
  });
});
