// Админка промокодов: создать (занятый код, повтор «Создать», текст кода на
// лайки), удалить против выключить, список страницами («Показать ещё»).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { a, call, input, resetAdminFake } from "./promo-admin.fake";

vi.mock("@tanstack/react-start", async () => (await import("./promo-admin.fake")).serverFn);
vi.mock("@/server/auth", async () => (await import("./promo-admin.fake")).auth);
vi.mock("@/server/db/mcpClient", async () => (await import("./promo-admin.fake")).mcp);

const api = await import("./promo-admin");
const { codeTakenSql } = await import("./promo-taken");

beforeEach(resetAdminFake);
const insertSql = () => a.sql.find((q) => q.includes("INSERT INTO yuplink.promo_code ")) ?? "";

describe("создать", () => {
  it("код и строки одним запросом; код — верхним регистром; id — от ключа нажатия", async () => {
    await expect(call(api.adminCreatePromo, input())).resolves.toEqual({
      ok: true,
      id: "pcd_op123456",
      code: "AUTUMN",
    });
    expect(insertSql()).toContain("'pcd_op123456', 'AUTUMN', 100");
    expect(insertSql()).toContain("10::bigint, 50::bigint, 100::numeric, 5000::bigint");
  });

  it("текст кода на лайки занят для нового; и наоборот — код на лайки проверяет обе таблицы", async () => {
    await call(api.adminCreatePromo, input());
    expect(insertSql()).toContain(
      "NOT EXISTS (SELECT 1 FROM yuplink.like_promocodes WHERE code = 'AUTUMN')",
    );
    const taken = codeTakenSql("AUTUMN");
    expect(taken).toContain("FROM yuplink.like_promocodes WHERE code = 'AUTUMN'");
    expect(taken).toContain("FROM yuplink.promo_code WHERE code = 'AUTUMN'");
  });

  it("пустой код — придумывает сервер (XXXX-XXXX)", async () => {
    const res = (await call(api.adminCreatePromo, input({ code: "" }))) as { code: string };
    expect(res.code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  });

  it("занятый код — отказ; повтор нашего же «Создать» — успех с нашим кодом", async () => {
    a.created = null;
    await expect(call(api.adminCreatePromo, input())).rejects.toThrow("promo.err_code_taken");
    a.own = { id: "pcd_op123456", code: "AUTUMN" };
    await expect(call(api.adminCreatePromo, input())).resolves.toMatchObject({ code: "AUTUMN" });
  });
});

describe("удалить", () => {
  it("никто не вводил — удалён; вводили — выключен", async () => {
    await expect(call(api.adminDeletePromo, { id: "pcd_op123456" })).resolves.toEqual({
      ok: true,
      deleted: true,
    });
    expect(a.sql[0]).toContain("NOT EXISTS (SELECT 1 FROM yuplink.promo_redemption");
    a.deleted = false;
    await expect(call(api.adminDeletePromo, { id: "pcd_op123456" })).resolves.toEqual({
      ok: true,
      deleted: false,
    });
    expect(a.sql.at(-1)).toContain("SET active = false");
  });

  it("чужой id по форме — отказ схемы", async () => {
    await expect(call(api.adminDeletePromo, { id: "1; DROP TABLE x" })).rejects.toThrow();
  });
});

describe("список", () => {
  const row = (i: number) => ({
    id: `pcd_${i}`,
    code: `C${i}`,
    active: true,
    max_users: null,
    used_users: 0,
    created_at: "2026-10-29T00:00:00Z",
    lines: [],
  });

  it("страница: limit + 1 строка из базы, лишняя — признак «есть ещё»", async () => {
    a.list = [row(1), row(2), row(3)];
    const page = (await call(api.adminListPromos, { limit: 2 })) as {
      rows: Array<{ code: string }>;
      more: boolean;
    };
    expect(a.sql[0]).toMatch(/LIMIT 3$/);
    expect(page.rows.map((r) => r.code)).toEqual(["C1", "C2"]);
    expect(page.more).toBe(true);
    a.list = [row(1)];
    expect(await call(api.adminListPromos, { limit: 2 })).toMatchObject({ more: false });
    await call(api.adminListPromos);
    expect(a.sql.at(-1)).toMatch(/LIMIT 51$/);
  });

  it("строки кода из json: шанс числом, незнакомый вид отброшен", async () => {
    a.list = [
      {
        ...row(1),
        code: "AUTUMN",
        max_users: 100,
        used_users: 37,
        lines: JSON.stringify([
          {
            idx: 0,
            kind: "resource",
            ref: "gold",
            min: 10,
            max: 50,
            chance: "25.000",
            budget: 5000,
            given: 1250,
          },
          {
            idx: 1,
            kind: "tickets",
            ref: null,
            min: 1,
            max: 1,
            chance: 100,
            budget: null,
            given: 0,
          },
        ]),
      },
    ];
    const page = (await call(api.adminListPromos, { limit: 50 })) as {
      rows: Array<Record<string, unknown>>;
    };
    expect(page.rows[0]).toMatchObject({ code: "AUTUMN", maxUsers: 100, usedUsers: 37 });
    expect(page.rows[0].lines).toEqual([
      {
        idx: 0,
        kind: "resource",
        ref: "gold",
        title: null,
        image: null,
        min: 10,
        max: 50,
        chance: 25,
        budget: 5000,
        given: 1250,
      },
    ]);
  });
});
