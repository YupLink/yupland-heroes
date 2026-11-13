// Кто позвал: по ссылке tg<id> (бот, экран входа в браузере) и по аккаунту друга
// (меню входа новичка) — только ник Telegram.
import { beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({ sql: [] as string[], rows: [] as Array<Record<string, unknown>> }));
vi.mock("@/server/db/mcpClient", () => ({
  mcpExec: async (sql: string) => (s.sql.push(sql), s.rows),
}));
const { inviteOfAccount, inviteOfRef } = await import("./referralInviter");

beforeEach(() => Object.assign(s, { sql: [], rows: [] }));

describe("кто позвал", () => {
  it("ссылка не tg<id> — без запроса и без приглашения", async () => {
    for (const ref of [null, "", "abc.near", "tg", "tg12x"]) {
      expect(await inviteOfRef(ref)).toEqual({ invited: false, name: null });
    }
    expect(s.sql).toEqual([]);
  });

  it("игрок с этим Telegram есть — приглашение и ник; нет — без", async () => {
    s.rows = [{ name: "Player_One" }];
    expect(await inviteOfRef("tg777")).toEqual({ invited: true, name: "Player_One" });
    expect(s.sql[0]).toContain("WHERE u.telegram_id = 777 LIMIT 1");
    s.rows = [{ name: null }];
    expect(await inviteOfRef("TG777")).toEqual({ invited: true, name: null });
    s.rows = [];
    expect(await inviteOfRef("tg777")).toEqual({ invited: false, name: null });
  });

  it("по аккаунту — реф-связь любого его кошелька", async () => {
    s.rows = [{ name: "@inviter_1" }];
    expect(await inviteOfAccount("acc_'x")).toEqual({ invited: true, name: "inviter_1" });
    expect(s.sql[0]).toContain("WHERE fu.account_id = 'acc_''x'");
    expect(s.sql[0]).toContain("JOIN yuplink.users fu ON fu.wallet = r.friend_wallet");
  });
});
