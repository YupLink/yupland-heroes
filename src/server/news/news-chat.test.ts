import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  sql: [] as string[],
  rows: [] as unknown[],
  cache: null as unknown,
  answer: null as unknown,
}));
vi.mock("@/server/db/mcpClient", () => ({
  mcpExec: vi.fn(async (sql: string) => {
    m.sql.push(sql);
    return sql.startsWith("SELECT at, author, text") ? m.rows : [];
  }),
}));

const { chatMessages, COMMUNITY_CHAT_ID, storeChatMessage } = await import("./news-chat");

const msg = (over: object = {}) => ({
  message_id: 7,
  date: 1793300000,
  text: "когда новые шахты?",
  chat: { id: COMMUNITY_CHAT_ID },
  from: { username: "pl" },
  ...over,
});

describe("чат сообщества", () => {
  beforeEach(() => {
    Object.assign(m, { sql: [], rows: [], cache: null, answer: null });
  });

  it("кладём только сообщения этого чата: не команды, не ботов, не пустые", async () => {
    expect(await storeChatMessage(msg())).toBe(true);
    expect(m.sql[0]).toContain("INSERT INTO yuplink.news_chat_msg");
    expect(m.sql[0]).toContain("'@pl'");
    expect(await storeChatMessage(msg({ chat: { id: -1 } }))).toBe(false);
    expect(await storeChatMessage(msg({ text: "/start" }))).toBe(false);
    expect(await storeChatMessage(msg({ from: { is_bot: true } }))).toBe(false);
    expect(await storeChatMessage(msg({ text: "  " }))).toBe(false);
  });

  it("всё, что писали за окно, — как есть, по порядку, без ИИ (08.11.2026)", async () => {
    m.rows = [
      { at: "2026-11-08T09:00:00Z", author: "@pl", text: "когда новые шахты?" },
      { at: "2026-11-08T09:01:00Z", author: null, text: "завтра" },
    ];
    expect(await chatMessages("2026-11-08T00:00:00Z", "2026-11-09T00:00:00Z")).toEqual([
      { at: "2026-11-08T09:00:00.000Z", author: "@pl", text: "когда новые шахты?" },
      { at: "2026-11-08T09:01:00.000Z", author: null, text: "завтра" },
    ]);
    const sql = m.sql.at(-1) ?? "";
    expect(sql).toContain(`chat_id = ${COMMUNITY_CHAT_ID}`);
    expect(sql).toContain("ORDER BY at, msg_id");
  });

});
