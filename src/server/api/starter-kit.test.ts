// Стартовый герой: выбранный игроком коммон (уровень 1) — одной вставкой вместе
// с отметкой «игру начал» и только тем, у кого героя нет вовсе — ни в инвентаре,
// ни экземпляром (с 22.10.2026 — выбор расы в меню входа, не случайный).
import { beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({ sql: [] as string[], rows: [] as unknown[] }));

vi.mock("../db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    s.sql.push(sql);
    return s.rows;
  },
}));

const { grantStarterHero, STARTER_HERO_SOURCE } = await import("./starter-kit");

beforeEach(() => {
  s.sql = [];
  s.rows = [];
});

describe("grantStarterHero", () => {
  it("выбранный коммон-шаблон, отметка и герой — одной вставкой", async () => {
    s.rows = [{ id: "ugi_x" }];
    expect(await grantStarterHero("acc_1", "w.tg", "hero_bee")).toBe(true);
    const sql = s.sql[0];
    expect(s.sql).toHaveLength(1);
    expect(sql).toContain("id = 'hero_bee' AND kind = 'hero' AND active AND level = 1");
    expect(sql).not.toContain("random()");
    expect(sql).toContain("INSERT INTO yuplink.game_start");
    expect(sql).toContain("ON CONFLICT (account_id) DO NOTHING");
    // Герой вставляется только из новой строки отметки: повтор второго не даст.
    expect(sql).toMatch(/FROM mark\s+RETURNING id/);
    expect(sql).toContain("FROM yuplink.user_game_item g");
    expect(sql).toContain("FROM yuplink.hero_instance h WHERE h.account_id = 'acc_1'");
    expect(sql).toContain(`'${STARTER_HERO_SOURCE}'`);
  });

  it("герой уже был или игру начинал (вставка ничего не вернула) — false", async () => {
    expect(await grantStarterHero("acc_1", "w.tg", "hero_bee")).toBe(false);
  });

  it("кавычки в id шаблона экранируются", async () => {
    await grantStarterHero("acc_1", "w.tg", "x' OR '1'='1");
    expect(s.sql[0]).toContain("id = 'x'' OR ''1''=''1'");
  });
});
