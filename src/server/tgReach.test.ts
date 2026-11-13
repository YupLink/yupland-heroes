// Кому игровой бот не может написать (§8.106): только «chat not found» и 403;
// ошибка текста письма — не повод спрашивать «разрешить боту писать».
import { describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({ sql: [] as string[] }));
vi.mock("@/server/db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    s.sql.push(sql);
    return [];
  },
}));

const { isUnreachable, noteUnreachable, askDoneSql, askDue } = await import("./tgReach");

describe("tgReach", () => {
  it("писать некуда — только «chat not found» и блокировка", () => {
    expect(isUnreachable(403, '{"description":"Forbidden: bot was blocked by the user"}')).toBe(
      true,
    );
    expect(isUnreachable(400, '{"description":"Bad Request: chat not found"}')).toBe(true);
    expect(isUnreachable(400, '{"description":"Bad Request: can\'t parse entities"}')).toBe(false);
    expect(isUnreachable(429, "Too Many Requests")).toBe(false);
  });

  it("запись — только на отказ и только с целым Telegram", async () => {
    s.sql = [];
    await noteUnreachable(111, 400, "Bad Request: chat not found");
    await noteUnreachable(111, 400, "Bad Request: message is too long");
    await noteUnreachable(-5, 403, "");
    expect(s.sql).toHaveLength(1);
    expect(s.sql[0]).toContain("VALUES (111, 400, now())");
    expect(s.sql[0]).toContain("ON CONFLICT (telegram_id)");
  });

  it("разрешил — строку удаляем, отказал — больше не спрашиваем", async () => {
    expect(askDoneSql(7, true)).toContain(
      "DELETE FROM yuplink.tg_game_unreachable WHERE telegram_id = 7",
    );
    expect(askDoneSql(7, false)).toContain("SET asked_at = now()");
    expect(await askDue(0)).toBe(false);
  });
});
