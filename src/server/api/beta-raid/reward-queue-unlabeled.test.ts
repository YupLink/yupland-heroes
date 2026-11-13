// Строка «Добычи» без метки происхождения (промокод): mob = false — товар
// ляжет «безымянным», как подарок. Остальным вставкам колонка mob не пишется.
import { beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({ sql: [] as string[] }));

vi.mock("@/server/db/mcpClient", () => ({
  mcpExec: async (sql: string) => void s.sql.push(sql),
}));

const { queueEncounterReward } = await import("@/server/api/beta-raid/reward-queue");
const { rewardOriginSql } = await import("@/server/api/raid-reward-live");

const base = {
  account: "acc_1",
  mapId: "map_1",
  cycleNo: 0,
  sourceName: "promo",
  kind: "custom",
  amount: 3,
  packId: "cst_wheat",
  key: "promo:prd_x:0",
};

describe("queueEncounterReward: без метки", () => {
  beforeEach(() => void (s.sql.length = 0));

  it("unlabeled — колонка mob = false, ключ строки и ON CONFLICT на месте", async () => {
    await queueEncounterReward({ ...base, unlabeled: true });
    const sql = s.sql[0].replace(/\s+/g, " ");
    expect(sql).toContain("created_at, origin, mob)");
    expect(sql).toMatch(/now\(\), NULL, false\)/);
    expect(sql).toContain("'rr_' || md5('promo:prd_x:0')");
    expect(sql).toContain("ON CONFLICT (id) DO NOTHING");
    // mob = false для rewardOriginSql — «без метки».
    expect(rewardOriginSql("t")).toContain("WHEN NOT t.mob THEN NULL");
  });

  it("прочие вставки колонку mob не трогают", async () => {
    await queueEncounterReward(base);
    expect(s.sql[0]).not.toContain("mob");
  });
});
