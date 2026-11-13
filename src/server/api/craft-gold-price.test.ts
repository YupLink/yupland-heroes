// Цена улучшения в золоте: курс пула золото/DARAI и момент включения привязки.
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  setting: null as string | null,
  pool: null as Record<string, number | string> | null,
  reads: 0,
  fail: false,
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const fn = { inputValidator: () => fn, handler: (h: unknown) => h };
    return fn;
  },
}));
vi.mock("../db/pg", () => ({
  pg: {
    settings: {
      findOne: async () => (db.setting === null ? null : { key: "k", value: db.setting }),
    },
  },
}));
vi.mock("../db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    db.reads++;
    if (db.fail) throw new Error("мост упал");
    expect(sql).toContain("token_a = 'gold' AND token_b = 'Darai'");
    return db.pool ? [db.pool] : [];
  },
}));

const m = await import("./craft-gold-price");
const pool = (ra: number, rb: number, wa = 1, wb = 200) => ({
  reserve_a: ra,
  reserve_b: rb,
  weight_a: wa,
  weight_b: wb,
});
const NOW = Date.parse("2026-11-01T00:00:00Z");

beforeEach(() => {
  Object.assign(db, { setting: null, pool: null, reads: 0, fail: false });
  m.resetCraftGoldCache();
});

describe("курс пула", () => {
  it("по запасам: DARAI за 1 золото", () => {
    expect(m.poolGoldRate(pool(1000, 400_000))).toBe(400);
  });
  it("пул пуст — стартовый курс по весам", () => {
    expect(m.poolGoldRate(pool(0, 0, 1, 200))).toBe(200);
    expect(m.poolGoldRate({ reserve_a: "0", reserve_b: "0", weight_a: "2", weight_b: "500" })).toBe(
      250,
    );
  });
  it("пула нет или курс не число > 0 — null (стандарт)", () => {
    expect(m.poolGoldRate(null)).toBeNull();
    expect(m.poolGoldRate(pool(0, 0, 0, 200))).toBeNull();
    expect(m.poolGoldRate(pool(0, 0, 1, 0))).toBeNull();
  });
});

describe("множитель", () => {
  it("нет ключа craft_gold_dynamic_from — стандарт при любом курсе", async () => {
    db.pool = pool(1000, 400_000);
    expect(await m.craftGoldMult(NOW)).toBe(1);
  });

  it("ключ в будущем — стандарт; наступил — 200 ÷ курс", async () => {
    db.pool = pool(1000, 400_000);
    db.setting = "2026-11-08T00:00:00Z";
    expect(await m.craftGoldMult(NOW)).toBe(1);
    m.resetCraftGoldCache();
    db.setting = "2026-10-27T00:00:00Z";
    expect(await m.craftGoldMult(NOW)).toBe(0.5);
  });

  it("пула нет — стандарт", async () => {
    db.setting = "2026-10-27T00:00:00Z";
    expect(await m.craftGoldMult(NOW)).toBe(1);
  });

  it("кэш 30 с: повтор не ходит в базу; сбой чтения — прошлый снимок", async () => {
    db.setting = "2026-10-27T00:00:00Z";
    db.pool = pool(1000, 100_000);
    expect(await m.craftGoldMult(NOW)).toBe(2);
    expect(await m.craftGoldMult(NOW + 10_000)).toBe(2);
    expect(db.reads).toBe(1);
    db.fail = true;
    expect(await m.craftGoldMult(NOW + 60_000)).toBe(2);
  });

  it("сбой чтения без снимка — ошибка, а не тихий стандарт", async () => {
    db.fail = true;
    await expect(m.craftGoldMult(NOW)).rejects.toThrow("мост упал");
  });
});
