// Урон в награде пишется как есть, без потолка integer (инцидент 03.10.2026:
// «Лесной Бог» на 10 млрд HP, первое место теряло награду на «integer out of
// range»). Базы нет: mcpExec подменён, проверяем текст INSERT.
import { beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({ sql: [] as string[] }));

vi.mock("@/server/db/mcpClient", () => ({
  mcpExec: async (sql: string) => void s.sql.push(sql),
}));

const { queueEncounterReward } = await import("@/server/api/beta-raid/reward-queue");

const base = {
  account: "acc_top",
  mapId: "rmap_1",
  cycleNo: 1,
  sourceName: "Лесной Бог",
  targetId: "rbt_god",
  kind: "likes",
  amount: 2750,
  place: 1,
};

/** Значение колонки damage: шестое в VALUES, после place. */
const damageOf = (sql: string) => sql.match(/'acc_top', (\S+), (\S+),/)?.[2];

describe("queueEncounterReward: урон", () => {
  beforeEach(() => void (s.sql.length = 0));

  it("10 млрд урона уходят в базу целым числом", async () => {
    await queueEncounterReward({ ...base, damage: 10_000_000_000 });
    expect(damageOf(s.sql[0])).toBe("10000000000");
  });

  it("сверх MAX_SAFE_INTEGER — потолок, а не «1e+21»", async () => {
    await queueEncounterReward({ ...base, damage: 1e21 });
    expect(damageOf(s.sql[0])).toBe(String(Number.MAX_SAFE_INTEGER));
  });

  it("нет урона или мусор — NULL, отрицательный — 0", async () => {
    await queueEncounterReward({ ...base, damage: null });
    await queueEncounterReward({ ...base, damage: Number.NaN });
    await queueEncounterReward({ ...base, damage: -5 });
    expect(s.sql.map(damageOf)).toEqual(["NULL", "NULL", "0"]);
  });
});
