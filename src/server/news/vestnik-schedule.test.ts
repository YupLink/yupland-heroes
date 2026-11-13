// Выпуск с отметкой: один раз, с повтором только при отказе Telegram.
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  sql: [] as string[],
  claimed: true,
  chat: -100500 as number | null,
  outs: [] as unknown[],
  alerts: [] as string[],
  setChat: vi.fn(async () => {}),
}));

vi.mock("@/server/db/mcpClient", () => ({
  mcpExec: vi.fn(async (sql: string) => {
    m.sql.push(sql);
    if (sql.includes("vestnik_sent") && sql.includes("INSERT")) return m.claimed ? [{ ok: 1 }] : [];
    if (sql.includes("AS attempts")) return [{ attempts: 1 }];
    return [{ ok: 1 }];
  }),
}));
vi.mock("@/server/tg", () => ({
  sendTgMessageToAdmins: vi.fn(async (t: string) => m.alerts.push(t)),
}));
vi.mock("./vestnik-render", () => ({
  renderIssue: vi.fn(async () => ({
    digest: { from: "2026-10-30T00:00:00.000Z", to: "2026-10-31T00:00:00.000Z" },
    promo: "AAAA-BBBB",
    pages: [Buffer.from("x")],
  })),
}));
vi.mock("./vestnik-publish", () => ({
  chatFor: vi.fn(async () => m.chat),
  setChat: m.setChat,
  captionOf: (t: string) => t,
  sendPages: vi.fn(async () => m.outs.shift() ?? { status: "ok" }),
}));

const { publishMarked } = await import("./vestnik-schedule");
const { dayWindow } = await import("@/lib/news/vestnikWindow");
const w = dayWindow(Date.parse("2026-10-30T12:00:00Z"));
const finished = () => m.sql.find((s) => s.includes("UPDATE yuplink.settings AS s")) ?? "";

describe("publishMarked", () => {
  beforeEach(() => {
    Object.assign(m, { sql: [], claimed: true, chat: -100500, outs: [], alerts: [] });
    m.setChat.mockClear();
  });

  it("вышел — отметка sent и промокод выпуска", async () => {
    expect(await publishMarked(w)).toEqual({ ok: true, promo: "AAAA-BBBB" });
    expect(finished()).toContain("'sent|'");
  });

  it("чат не подключён — даже отметку не берём", async () => {
    m.chat = null;
    expect(await publishMarked(w)).toEqual({ ok: false, reason: "no_chat" });
    expect(m.sql).toHaveLength(0);
  });

  it("отметку взял другой — не шлём", async () => {
    m.claimed = false;
    expect(await publishMarked(w)).toEqual({ ok: false, reason: "already" });
    expect(finished()).toBe("");
  });

  it("Telegram не ответил — unknown, без повтора, админам сигнал", async () => {
    m.outs = [{ status: "unknown" }];
    expect(await publishMarked(w)).toEqual({ ok: false, reason: "unknown" });
    expect(finished()).toContain("'unknown|'");
    expect(m.alerts).toHaveLength(1);
  });

  it("отказ — failed (повтор позже); группа переехала — новый номер и вторая попытка", async () => {
    m.outs = [{ status: "rejected" }];
    expect(await publishMarked(w)).toEqual({ ok: false, reason: "send_failed" });
    expect(finished()).toContain("'failed|'");
    m.sql = [];
    m.outs = [{ status: "rejected", migrateTo: -1009 }, { status: "ok" }];
    expect((await publishMarked(w)).ok).toBe(true);
    expect(m.setChat).toHaveBeenCalledWith("day", -1009);
  });
});
