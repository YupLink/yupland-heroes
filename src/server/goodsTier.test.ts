// Ярус дропа «Товар»: разбор из базы и проверка формы админки.
import { describe, expect, it, vi } from "vitest";

vi.mock("./db/pg", () => ({ pg: {} }));
const { parseRewardTiers } = await import("./random");
const { rewardTierSchema, assertTokenExists } = await import("./api/admin-campaigns-schemas");

const goods = {
  weight: 100,
  kind: "custom",
  rewardMin: 1,
  rewardMax: 3,
  rewardToken: "custom",
  itemId: "cst_torch",
  itemName: "Факел",
  itemImage: "https://x/t.webp",
};

describe("ярус «Товар»", () => {
  it("разбирается как товар, а не как токен", () => {
    const t = parseRewardTiers(JSON.stringify([goods]));
    expect(t?.[0]).toMatchObject({
      kind: "custom",
      itemId: "cst_torch",
      rewardMin: 1,
      rewardMax: 3,
      itemName: "Факел",
    });
  });
  it("без cst_ или с количеством 0 — ярусы не принимаются", () => {
    expect(parseRewardTiers(JSON.stringify([{ ...goods, itemId: "pk_1" }]))).toBeNull();
    expect(parseRewardTiers(JSON.stringify([{ ...goods, rewardMin: 0 }]))).toBeNull();
  });
  it("форма: товар и 1–100 штук; токенный ярус с заглушкой — отказ", () => {
    expect(rewardTierSchema.safeParse(goods).success).toBe(true);
    expect(rewardTierSchema.safeParse({ ...goods, itemId: undefined }).success).toBe(false);
    expect(rewardTierSchema.safeParse({ ...goods, rewardMax: 101 }).success).toBe(false);
    expect(
      rewardTierSchema.safeParse({
        weight: 1,
        kind: "ft",
        rewardMin: 1,
        rewardMax: 2,
        rewardToken: "custom",
      }).success,
    ).toBe(false);
  });
  it("заглушка дропа без токена не проверяется как токен", async () => {
    await expect(assertTokenExists("custom")).resolves.toBeUndefined();
  });
});
