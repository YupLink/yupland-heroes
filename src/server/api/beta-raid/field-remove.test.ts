// Снятие рядом с грядкой после выноса общего ядра: по-прежнему бесплатно, без
// отдыха и только стоя рядом, а со снятием издалека хвост не делит дважды.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start", async () => (await import("./field-recall.fake")).reactStart);
vi.mock("../currency/move", async () => (await import("./field-recall.fake")).move);
vi.mock("../../db/mcpClient", async () => (await import("./field-recall.fake")).mcp);
vi.mock("./encounter-where", async () => (await import("./field-recall.fake")).where);
vi.mock("./building-action", async () => (await import("./field-recall.fake")).building);
vi.mock("./field-settle", async () => (await import("./field-recall.fake")).settle);
vi.mock("./warehouse-store", async () => (await import("./field-recall.fake")).warehouse);
vi.mock("../../raidLive", async () => (await import("./field-recall.fake")).live);
vi.mock("./hero-power", async () => (await import("./field-recall.fake")).heroPower);
vi.mock("./field-reward", () => ({ giveFieldReward: async () => {} }));
vi.mock("./item-alias", () => ({ canonRef: async (_k: string, id: string) => id }));
vi.mock("./gate", () => ({ requireBetaRaid: async () => "w_me" }));
vi.mock("./field-heroes", () => ({
  fieldHeroes: async () => [],
  requireOwnHero: async () => ({}),
}));
vi.mock("./helpers", async () => {
  const { hexDistance } = await import("@/lib/raid/hex");
  return {
    areNeighbors: (a: number, b: number, c: number, d: number) => hexDistance(a, b, c, d) === 1,
  };
});
vi.mock("../../db/pg", () => ({ sb: {} }));
vi.mock("../heroes-shared", () => ({}));
vi.mock("../tickets-ledger", () => ({}));
vi.mock("../raid-helpers", () => ({}));
vi.mock("../energy-credit", () => ({}));

import { resetFake, s } from "./field-recall.fake";

const { removeHeroFromField } = await import("./field");
const { recallHeroFromField } = await import("./field-recall");
type Call<T> = (a: { data: T }) => Promise<unknown>;
const near = removeHeroFromField as unknown as Call<{ q: number; r: number }>;
const remote = recallHeroFromField as unknown as Call<{ heroId: string; op: string }>;

beforeEach(() => {
  resetFake();
  s.pos = { q: 31, r: 90 };
});

describe("removeHeroFromField", () => {
  it("рядом — бесплатно: герой снят, хвост не выдаётся (13.11), соседям событие", async () => {
    await expect(near({ data: { q: 30, r: 90 } })).resolves.toEqual({ ok: true });
    expect(s.dust).toBe(0);
    expect(s.worker.heroId).toBeNull();
    // Рядом — без отдыха: наказание только за снятие издалека.
    expect(s.rest).toBeNull();
    expect(s.published).toBe(1);
  });

  it("издалека бесплатно не снять — как раньше", async () => {
    s.pos = { q: 0, r: 0 };
    await expect(near({ data: { q: 30, r: 90 } })).rejects.toThrow("Сначала подойди к грядке");
    expect(s.worker.heroId).toBe("hero_w");
  });

  it("снятие издалека успело раньше — второе снятие без хвоста", async () => {
    s.pos = { q: 0, r: 0 };
    await remote({ data: { heroId: "hero_w", op: "op1abc" } });
    s.pos = { q: 31, r: 90 };
    await expect(near({ data: { q: 30, r: 90 } })).resolves.toEqual({ ok: true });
    expect(s.dust).toBe(0);
  });
});
