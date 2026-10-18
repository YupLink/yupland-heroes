// Небоевые баффы (Торговля/Алхимия) и запись иммунитета: бой и кривые силы
// они не трогают, а иммунитет пишется одной строкой на вид (повтор продлевает).
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ sql: [] as string[] }));

vi.mock("../../db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    state.sql.push(sql);
    return [];
  },
}));
vi.mock("./owner", () => ({ raidOwner: async () => "acc_1" }));

import { applyBoostRoll, buffHero, buffStats, hasBuff } from "./hero-buff";
import { heroCombat, heroField } from "@/lib/hero/heroPowerCurve";
import type { HeroPowerInfo } from "./hero-power";
import type { HeroStats } from "@/lib/heroStats";

const STATS: HeroStats = { atk: 5, arm: 5, int: 5, spd: 5, hp: 5, luck: 5 };
const hero = () =>
  ({
    stats: STATS,
    effects: STATS,
    combat: heroCombat(STATS),
    field: heroField(STATS),
  }) as HeroPowerInfo;

beforeEach(() => {
  state.sql = [];
});

describe("Торговля/Алхимия вне боя", () => {
  it("hasBuff их не видит, герой тот же объект", () => {
    const b = { trade: 30, alchemy: 20 };
    expect(hasBuff(b)).toBe(false);
    const h = hero();
    expect(buffHero(h, b)).toBe(h);
  });

  it("вместе с боевым баффом в статы не попадают", () => {
    const out = buffStats(STATS, { trade: 30, atk: 2 });
    expect(out).toEqual({ ...STATS, atk: 7 });
  });
});

describe("applyBoostRoll", () => {
  it("иммунитет — вид immune_<дебафф>, сила 1, ветка «повтор продлевает»", async () => {
    await applyBoostRoll("w1", { stat: "immune", amount: 7, minutes: 30, ability: "poison" });
    const ins = state.sql.find((s) => s.includes("INSERT INTO yuplink.beta_raid_player_effects"));
    expect(ins).toMatch(/'immune_poison', 1,/);
    expect(ins).toMatch(/ON CONFLICT \(account_id, kind\)/);
  });

  it("Торговля — отдельная строка buff_trade без ON CONFLICT", async () => {
    await applyBoostRoll("w1", { stat: "trade", amount: 10, minutes: 15 });
    const ins = state.sql.find((s) => s.includes("INSERT INTO yuplink.beta_raid_player_effects"));
    expect(ins).toMatch(/'buff_trade'/);
    expect(ins).not.toMatch(/ON CONFLICT/);
  });

  it("иммунитет без вида ничего не пишет", async () => {
    await applyBoostRoll("w1", { stat: "immune", amount: 1, minutes: 30 });
    expect(state.sql.some((s) => s.includes("INSERT"))).toBe(false);
  });
});
