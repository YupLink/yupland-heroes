// Стартовый герой: одной вставкой и только тем, у кого героя нет вовсе —
// ни в инвентаре, ни экземпляром; шаблон — случайный активный коммон (уровень 1).
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
  it("вставка с проверкой «героя нет» и случайным коммон-шаблоном", async () => {
    s.rows = [{ id: "ugi_x" }];
    expect(await grantStarterHero("acc_1", "w.tg")).toBe(true);
    const sql = s.sql[0];
    expect(sql).toContain("kind = 'hero' AND active AND level = 1");
    expect(sql).toContain("random()");
    expect(sql).toContain("FROM yuplink.user_game_item g");
    expect(sql).toContain("FROM yuplink.hero_instance h WHERE h.account_id = 'acc_1'");
    expect(sql).toContain(`'${STARTER_HERO_SOURCE}'`);
  });

  it("герой уже был (вставка ничего не вернула) — false", async () => {
    expect(await grantStarterHero("acc_1", "w.tg")).toBe(false);
  });
});
