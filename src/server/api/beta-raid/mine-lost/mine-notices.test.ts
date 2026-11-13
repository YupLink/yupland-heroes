// Уведомления в «Добыче» (§8.106): только свои незакрытые, без сноса острова,
// число — все незакрытые; «×» и «Закрыть все» — только свои строки.
import { describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({ rows: [] as unknown[], sql: [] as string[] }));
vi.mock("@/server/db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    s.sql.push(sql);
    return s.rows;
  },
}));

const { noticesSql, dismissNoticesSql, myNotices, NOTICE_LIMIT } = await import("./mine-notices");
const { officeLostSql } = await import("@/server/api/mine-office/mine-office-lost");

describe("уведомления о потерях", () => {
  it("SQL: свои, незакрытые, без острова, свежие сверху, с общим числом", () => {
    const q = noticesSql("acc_o'k");
    expect(q).toContain("l.old_account = 'acc_o''k'");
    expect(q).toContain("l.acknowledged_at IS NULL");
    expect(q).toContain("l.kind <> 'island'");
    expect(q).toContain("count(*) OVER () AS total");
    expect(q).toContain(`LIMIT ${NOTICE_LIMIT}`);
    expect(q).not.toMatch(/new_account/);
  });

  it("закрыть одну — по id и своему аккаунту; все — только свои незакрытые", () => {
    const one = dismissNoticesSql("acc_a", "mcl_1'x");
    expect(one).toContain("old_account = 'acc_a'");
    expect(one).toContain("AND id = 'mcl_1''x'");
    expect(one).toContain("acknowledged_at IS NULL");
    const all = dismissNoticesSql("acc_a", null);
    expect(all).not.toContain("AND id =");
    expect(all).toContain("old_account = 'acc_a'");
  });

  it("число на кружок — total из базы, строки — разобраны", async () => {
    s.rows = [
      {
        id: "a",
        kind: "capture",
        map_id: "m1",
        q: 1,
        r: 2,
        resource: "wood",
        amount: 0,
        at: 1,
        total: "73",
      },
    ];
    const res = await myNotices("acc_a", "m1");
    expect(res.count).toBe(73);
    expect(res.notices).toHaveLength(1);
    expect(res.notices[0].here).toBe(true);
    s.rows = [];
    expect(await myNotices("acc_a", "m1")).toEqual({ notices: [], count: 0 });
  });

  it("«Отбитые»: 7 дней истории, закрытые и собранные тоже, без острова", () => {
    const q = officeLostSql("acc_a");
    expect(q).toContain("interval '7 days'");
    expect(q).not.toContain("acknowledged_at");
    expect(q).not.toContain("claimed_at");
    expect(q).toContain("l.kind <> 'island'");
  });
});
