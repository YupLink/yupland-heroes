import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ calls: [] as string[], replies: [] as unknown[][] }));
vi.mock("@/server/db/mcpClient", () => ({
  mcpExec: vi.fn(async (sql: string) => {
    db.calls.push(sql);
    return db.replies.shift() ?? [];
  }),
}));

const { issuePromo, paperPromo, rollPromo } = await import("./vestnik-promo");

describe("промокод выпуска", () => {
  beforeEach(() => {
    db.calls = [];
    db.replies = [];
  });

  it("rollPromo: энергия или лайки, 1–100 штук, 1–100 игроков", () => {
    expect(rollPromo(() => 0)).toEqual({ kind: "energy", amount: 1, users: 1 });
    expect(rollPromo(() => 0.999999)).toEqual({ kind: "likes", amount: 100, users: 100 });
    for (let i = 0; i < 200; i++) {
      const r = rollPromo();
      expect(r.amount).toBeGreaterThanOrEqual(1);
      expect(r.amount).toBeLessThanOrEqual(100);
      expect(r.users).toBeGreaterThanOrEqual(1);
      expect(r.users).toBeLessThanOrEqual(100);
    }
  });

  it("код выпуска уже есть — отдаём его, нового не заводим", async () => {
    db.replies = [[{ id: "pcd_vestnik_day_2026-10-29", code: "AAAA-BBBB" }]];
    expect(await issuePromo("day_2026-10-29")).toBe("AAAA-BBBB");
    expect(db.calls).toHaveLength(1);
  });

  it("нет — заводим: строка на всю сумму, предел игроков, автор vestnik", async () => {
    db.replies = [[], [{ id: "pcd_vestnik_day_2026-10-30", lines: 1 }]];
    const code = await issuePromo("day_2026-10-30", { kind: "likes", amount: 42, users: 7 });
    expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    const sql = db.calls[1];
    expect(sql).toContain("'pcd_vestnik_day_2026-10-30'");
    expect(sql).toContain("'likes'::text");
    expect(sql).toContain("42::bigint, 42::bigint, 100::numeric");
    expect(sql).toMatch(/'[A-Z2-9-]+', 7,\s*'vestnik'/);
  });

  it("сбой базы — выпуск без кода, не падение", async () => {
    const { mcpExec } = await import("@/server/db/mcpClient");
    vi.mocked(mcpExec).mockRejectedValueOnce(new Error("down"));
    expect(await issuePromo("day_2026-10-31")).toBeNull();
  });

  it("код дня для газеты: один на сутки UTC, свой id, сбой — null", async () => {
    const now = Date.parse("2026-10-30T23:59:00Z");
    db.replies = [[{ id: "pcd_vestnik_paper_2026-10-30", code: "CCCC-DDDD" }]];
    expect(await paperPromo(now)).toEqual({ date: "2026-10-30", code: "CCCC-DDDD" });
    expect(db.calls[0]).toContain("'pcd_vestnik_paper_2026-10-30'");
    const { mcpExec } = await import("@/server/db/mcpClient");
    vi.mocked(mcpExec).mockRejectedValueOnce(new Error("down"));
    expect(await paperPromo(now)).toBeNull();
  });
});
