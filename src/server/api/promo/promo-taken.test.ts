// Код на лайки не заводится поверх нового промокода (профиль спрашивает новые
// первыми — старый стал бы недостижим). До миграции promo-01 — только лайки.
import { beforeEach, describe, expect, it, vi } from "vitest";

const t = vi.hoisted(() => ({ sql: [] as string[], noTable: false, taken: false }));

vi.mock("@/server/db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    t.sql.push(sql);
    if (t.noTable && sql.includes("yuplink.promo_code")) {
      throw new Error('relation "yuplink.promo_code" does not exist');
    }
    return [{ taken: t.taken }];
  },
}));

const { codeTaken } = await import("./promo-taken");

beforeEach(() => {
  t.sql.length = 0;
  t.noTable = false;
  t.taken = false;
});

describe("codeTaken", () => {
  it("смотрит обе таблицы одним запросом", async () => {
    t.taken = true;
    await expect(codeTaken("AUTUMN")).resolves.toBe(true);
    expect(t.sql).toHaveLength(1);
    expect(t.sql[0]).toContain("yuplink.like_promocodes WHERE code = 'AUTUMN'");
    expect(t.sql[0]).toContain("yuplink.promo_code WHERE code = 'AUTUMN'");
  });

  it("таблицы новых кодов ещё нет — только коды на лайки, без поломки", async () => {
    t.noTable = true;
    await expect(codeTaken("OLD")).resolves.toBe(false);
    expect(t.sql).toHaveLength(2);
    expect(t.sql[1]).not.toContain("promo_code");
  });
});
