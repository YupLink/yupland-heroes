import { beforeEach, describe, expect, it, vi } from "vitest";

const balance = vi.fn();
vi.mock("./move", () => ({ accBalance: (...a: unknown[]) => balance(...a), accAccountId: async () => "acc_1" }));
vi.mock("../darai-stars", () => ({ daraiRate: async () => 1_500_000, starsFromDarai: (d: number) => Math.ceil(d / 10_000) }));
vi.mock("../../db/mcpClient", () => ({ mcpExec: async () => [] }));

const { starsInsteadOfDarai } = await import("./darai-stars-pay");

describe("сервер: чем списать цену в DARAI", () => {
  beforeEach(() => balance.mockReset());
  it("полноценный игрок (кошелёк) — всегда DARAI", async () => {
    balance.mockResolvedValue(0);
    expect(await starsInsteadOfDarai("owner.example.near", 100_000)).toBeNull();
  });
  it("звездочник, DARAI хватает — DARAI", async () => {
    balance.mockResolvedValue(200_000);
    expect(await starsInsteadOfDarai("tg123", 100_000)).toBeNull();
  });
  it("звездочник, DARAI не хватает — звёзды", async () => {
    balance.mockResolvedValue(50_000);
    expect(await starsInsteadOfDarai("tg123", 100_000)).toBe(10);
  });
});
