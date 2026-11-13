// Энергия за «Копать / Закопать / Выкопать» по карте, где копают: в мире — 2
// (ПРАВИЛА §8.23), на острове новичка — в 10 раз, 0,2 (island/energy). Нехватка —
// ключом «Нужно N энергии» с той ценой, которую и просили.
import { beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({
  calls: [] as Array<{ wallet: string; cost: number; reason: string }>,
  fail: null as string | null,
}));
vi.mock("@/server/api/beta-raid/encounter-pay", () => ({
  payForHit: async (wallet: string, cost: number, reason: string) => {
    if (s.fail) throw new Error(s.fail);
    s.calls.push({ wallet, cost, reason });
    return { refund: async () => {} };
  },
}));

const { payDig, DIG_ENERGY } = await import("@/server/api/beta-raid/loot-bag/bag-dig-pay");

beforeEach(() => Object.assign(s, { calls: [], fail: null }));

describe("payDig", () => {
  it("мир — прежние 2 энергии, причина «dig»", async () => {
    await payDig("w1", "rmap_world");
    expect(s.calls).toEqual([{ wallet: "w1", cost: DIG_ENERGY, reason: "dig" }]);
    expect(DIG_ENERGY).toBe(2);
  });

  it("остров — в 10 раз дешевле: 0.2 энергии", async () => {
    await payDig("w1", "isle_abc");
    expect(s.calls).toEqual([{ wallet: "w1", cost: 0.2, reason: "dig" }]);
  });

  it("нехватка на острове — «Нужно 0.2 энергии» ключом", async () => {
    s.fail = "Нужно 0.2 энергии";
    await expect(payDig("w1", "isle_abc")).rejects.toThrow('braid.need_energy|{"n":0.2}');
  });

  it("нехватка в мире — «Нужно 2 энергии»; чужая ошибка — как есть", async () => {
    s.fail = "not_enough_energy";
    await expect(payDig("w1", "rmap_world")).rejects.toThrow('braid.need_energy|{"n":2}');
    s.fail = "connection reset";
    await expect(payDig("w1", "rmap_world")).rejects.toThrow("connection reset");
  });
});
