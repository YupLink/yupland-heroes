// Торговать в лавке — только стоя рядом и не под куполом (аудит 11.11.2026).
import { beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({ pos: { q: 0, r: 0 }, voided: false }));
vi.mock("./encounter-where", async () => {
  const { hexDistance } = await import("@/components/beta-raid/hexGeometry");
  return {
    playerCell: async () => s.pos,
    requireAdjacent: (p: { q: number; r: number }, q: number, r: number) => {
      if (hexDistance(p.q, p.r, q, r) > 1) throw new Error("Подойди ближе к объекту");
    },
  };
});
vi.mock("./voidGate", () => ({
  requireNotVoid: async () => {
    if (s.voided) throw new Error("braid.void_blocked");
  },
}));

const { requireShopNear } = await import("./market-near");

beforeEach(() => Object.assign(s, { pos: { q: 0, r: 0 }, voided: false }));

describe("лавка — только рядом", () => {
  it("соседняя клетка — можно", async () => {
    await expect(requireShopNear("w", "m", 1, 0)).resolves.toBeUndefined();
  });
  it("издалека — «Подойди ближе»", async () => {
    await expect(requireShopNear("w", "m", 5, 5)).rejects.toThrow("Подойди ближе");
  });
  it("под куполом — нельзя, даже рядом", async () => {
    s.voided = true;
    await expect(requireShopNear("w", "m", 1, 0)).rejects.toThrow("braid.void_blocked");
  });
});
