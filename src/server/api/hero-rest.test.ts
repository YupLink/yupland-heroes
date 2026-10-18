// Отдых героя на сервере: занятый (отдыхает или батрачит) основным не встаёт,
// сбой базы не пропускает молча, условие UPDATE закрывает гонку.
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ rows: [] as unknown[], fail: false, sql: "" }));
vi.mock("../db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    db.sql = sql;
    if (db.fail) throw new Error("MCP POST 502");
    return db.rows;
  },
}));

const rest = await import("./hero-rest");

beforeEach(() => {
  db.rows = [];
  db.fail = false;
  db.sql = "";
});

describe("activeRest", () => {
  const now = Date.parse("2026-09-29T12:00:00Z");
  it("идущий отдых — ISO строкой, прошедший и пустой — null", () => {
    expect(rest.activeRest("2026-09-29 15:00:00+00", now)).toBe("2026-09-29T15:00:00.000Z");
    expect(rest.activeRest("2026-09-29T11:00:00Z", now)).toBeNull();
    expect(rest.activeRest(null, now)).toBeNull();
  });
});

describe("requireHeroFree", () => {
  it("отдыхает — «герой отдыхает»", async () => {
    db.rows = [{ resting: true, busy: false }];
    await expect(rest.requireHeroFree("hero_w")).rejects.toThrow(rest.HERO_RESTING);
    expect(db.sql).toContain("h.id = 'hero_w'");
  });

  it("батрачит — прежний отказ грядки", async () => {
    db.rows = [{ resting: false, busy: true }];
    await expect(rest.requireHeroFree("hero_w")).rejects.toThrow("braid.field_hero_busy");
  });

  it("свободен или отдых уже прошёл (NULL) — пропускает", async () => {
    db.rows = [{ resting: null, busy: false }];
    await expect(rest.requireHeroFree("hero_w")).resolves.toBeUndefined();
  });

  it("сбой базы — бросает, а не пропускает", async () => {
    db.fail = true;
    await expect(rest.requireHeroFree("hero_w")).rejects.toThrow("MCP POST 502");
  });
});

describe("requireHeroAwake", () => {
  it("отдыхает — отказ; нет строки — пропуск", async () => {
    db.rows = [{ hit: 1 }];
    await expect(rest.requireHeroAwake("hero_w")).rejects.toThrow(rest.HERO_RESTING);
    db.rows = [];
    await expect(rest.requireHeroAwake("hero_w")).resolves.toBeUndefined();
  });
});

describe("условия SQL", () => {
  it("свободен = не отдыхает и не на грядке", () => {
    const sql = rest.freeHeroSql("h");
    expect(sql).toContain("h.rest_until IS NULL OR h.rest_until <= now()");
    expect(sql).toContain("fw.hero_id = h.id");
    expect(rest.awakeSql()).toBe("(rest_until IS NULL OR rest_until <= now())");
  });
});
