// Предмет «Карта» на сервере: целая штука своего товара с галочкой is_map в
// рюкзаке ВЫБРАННОГО героя аккаунта — один SELECT; не смогли прочитать — нет карты.
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ sqls: [] as string[], rows: [] as unknown[], fail: false }));

vi.mock("@/server/db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    db.sqls.push(sql);
    if (db.fail) throw new Error("MCP timeout");
    return db.rows;
  },
}));

const { hasMapItem, mapItemSql } = await import("./world-map-item");

beforeEach(() => {
  Object.assign(db, { sqls: [], rows: [], fail: false });
});

describe("mapItemSql", () => {
  it("выбранный герой аккаунта, своя стопка, целая штука, галочка «Карта»", () => {
    const sql = mapItemSql("acc_me");
    expect(sql).toContain("h.account_id = 'acc_me' AND h.selected_at IS NOT NULL");
    expect(sql).toContain("ORDER BY h.selected_at DESC LIMIT 1");
    expect(sql).toContain("b.kind = 'custom' AND b.count >= 1 AND ci.is_map");
    expect(sql).toContain("ci.id = split_part(b.stack_key, ':', 2)");
    // Только чтение: предмет не тратится и не изнашивается.
    expect(sql).not.toMatch(/\b(UPDATE|INSERT|DELETE)\b/i);
  });

  it("кавычка в ключе аккаунта не ломает запрос", () => {
    expect(mapItemSql("a'b")).toContain("h.account_id = 'a''b'");
  });
});

describe("hasMapItem", () => {
  it("ответ базы — да или нет, булево терпимо и строкой", async () => {
    for (const [ok, want] of [
      [true, true],
      ["t", true],
      ["true", true],
      [false, false],
      ["f", false],
      [null, false],
    ] as const) {
      db.rows = [{ ok }];
      await expect(hasMapItem("acc_me")).resolves.toBe(want);
    }
    db.rows = [];
    await expect(hasMapItem("acc_me")).resolves.toBe(false);
    expect(db.sqls.every((s) => s === mapItemSql("acc_me"))).toBe(true);
  });

  it("сбой чтения — бросок, а не «карта есть»", async () => {
    db.fail = true;
    await expect(hasMapItem("acc_me")).rejects.toThrow("MCP timeout");
  });
});
