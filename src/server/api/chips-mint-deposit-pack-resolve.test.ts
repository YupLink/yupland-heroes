// «1 6 World pack II (legendary)» — опечатка при чеканке (20 NFT): читаем как
// «16 World pack II (legendary)», 16 боксов World Pack II (владелец, 11.10.2026).
import { describe, expect, it, vi } from "vitest";

const STORE = "yuplandshop.mintbase1.near";
vi.mock("./chips-mint-helpers", () => ({ STORE_NFT_CONTRACT: "yuplandshop.mintbase1.near" }));
vi.mock("../db/pg", () => ({
  pg: {
    settings: {
      findOne: async () => ({
        value: JSON.stringify({
          [`yuplandshop.mintbase1.near::World pack II (legendary)`]: "cp_AbxA-Vyxh3",
        }),
      }),
      upsert: async () => {},
    },
    chipPacks: { raw: () => ({ select: async () => ({ data: [] }) }) },
  },
}));

const { stripLeadCount, resolvePackForNftTitle } =
  await import("./chips-mint-deposit-pack-resolve");

describe("опечатка «1 6» в названии пака", () => {
  it("«1 6 World pack II (legendary)» — 16 штук того же пака", () => {
    expect(stripLeadCount("1 6 World pack II (legendary)")).toEqual({
      count: 16,
      base: "World pack II (legendary)",
    });
    expect(stripLeadCount("  1  6 World  pack II (Legendary) ").count).toBe(16);
  });

  it("правильные названия читаются как раньше", () => {
    expect(stripLeadCount("16 World pack II (legendary)")).toEqual({
      count: 16,
      base: "World pack II (legendary)",
    });
    expect(stripLeadCount("1 World pack II (legendary)").count).toBe(1);
    expect(stripLeadCount("9 World pack II (legendary)").count).toBe(9);
  });

  it("исключение только для этого названия", () => {
    expect(stripLeadCount("1 6 Dragon pack")).toEqual({ count: 1, base: "6 Dragon pack" });
  });

  it("находит пак World Pack II", async () => {
    expect(await resolvePackForNftTitle(STORE, "1 6 World pack II (legendary)")).toBe(
      "cp_AbxA-Vyxh3",
    );
  });
});
