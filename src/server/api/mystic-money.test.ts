// Бокс с DARAI/Stars — деньги, в том числе через вложенный бокс (аудит 11.11).
import { describe, expect, it, vi } from "vitest";

const packs: Record<string, { kind: string; mystic_pool: unknown }> = {};
vi.mock("../db/pg", () => ({
  pg: { chipPacks: { findOne: async (f: { id: string }) => packs[f.id] ?? null } },
}));

import { packPaysMoney, poolPaysMoney } from "./mystic-money";

const tier = (o: Record<string, unknown>) => ({ weight: 10, ...o });
const box = (id: string, pool: unknown[]) => {
  packs[id] = { kind: "mystic", mystic_pool: pool };
};

describe("mystic-money", () => {
  it("тир «token» — деньги, ресурсы и вещи — нет", async () => {
    expect(await poolPaysMoney([{ kind: "token" }])).toBe(true);
    expect(await poolPaysMoney([{ kind: "resource" }, { kind: "artifact" }])).toBe(false);
  });
  it("DARAI во вложенном боксе — деньги", async () => {
    box("cp_in", [tier({ kind: "token", token: "Darai", amountMin: 1, amountMax: 5 })]);
    box("cp_out", [tier({ kind: "pack", packId: "cp_in" })]);
    expect(await packPaysMoney("cp_out")).toBe(true);
    expect(await poolPaysMoney([{ kind: "pack", packId: "cp_out" }])).toBe(true);
  });
  it("кольцо боксов без денег и пак фишек — не деньги", async () => {
    box("cp_a", [tier({ kind: "pack", packId: "cp_b" })]);
    box("cp_b", [tier({ kind: "pack", packId: "cp_a" })]);
    packs.cp_chips = { kind: "chips", mystic_pool: null };
    expect(await packPaysMoney("cp_a")).toBe(false);
    expect(await poolPaysMoney([{ kind: "pack", packId: "cp_chips" }])).toBe(false);
  });
  it("слишком глубокая вложенность считается деньгами", async () => {
    for (let i = 0; i < 6; i++) box(`cp_d${i}`, [tier({ kind: "pack", packId: `cp_d${i + 1}` })]);
    box("cp_d6", [tier({ kind: "tickets", amountMin: 1, amountMax: 2 })]);
    expect(await packPaysMoney("cp_d0")).toBe(true);
  });
});
