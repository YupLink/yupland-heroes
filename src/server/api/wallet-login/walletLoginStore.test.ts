// База входа по кошельку: номер — через функцию базы и только из своего
// диапазона; настоящий Telegram забирает номер.
import { beforeEach, describe, expect, it, vi } from "vitest";

const W = 6755399441055744;
const s = vi.hoisted(() => ({ sql: [] as Array<{ sql: string; opts: unknown }>, rows: [] as unknown[] }));
vi.mock("../../db/mcpClient", () => ({
  mcpExec: async (sql: string, opts: unknown) => {
    s.sql.push({ sql, opts });
    return s.rows;
  },
}));

const store = await import("./walletLoginStore");

beforeEach(() => Object.assign(s, { sql: [], rows: [] }));

describe("база входа по кошельку", () => {
  it("номер — функцией базы; мест нет — null; чужой диапазон — ошибка", async () => {
    s.rows = [{ tg: String(W + 3) }];
    expect(await store.claimWalletTg("a.near", "new", 100)).toBe(W + 3);
    expect(s.sql[0].sql).toContain("yuplink.wallet_login_claim('a.near', 'new', 100)");
    expect(s.sql[0].opts).toEqual({ wrapJson: true });
    s.rows = [{ tg: null }];
    expect(await store.claimWalletTg("a.near", "new", 100)).toBeNull();
    s.rows = [{ tg: "12345" }];
    await expect(store.claimWalletTg("a.near", "new", 100)).rejects.toThrow("вне диапазона");
  });

  it("настоящий Telegram забирает номер входа: кошельки — на него, место свободно", async () => {
    await store.releaseWalletTg(W + 2, 777);
    expect(s.sql[0].sql).toContain(`UPDATE yuplink.users SET telegram_id = 777 WHERE telegram_id = ${W + 2}`);
    expect(s.sql[0].sql).toContain(`UPDATE yuplink.accounts SET telegram_id = NULL WHERE telegram_id = ${W + 2}`);
    expect(s.sql[0].sql).toContain(`DELETE FROM yuplink.account_wallet_login WHERE tg_id = ${W + 2}`);
    await expect(store.releaseWalletTg(777, 778)).rejects.toThrow("вне диапазона");
    await expect(store.releaseWalletTg(W + 2, W + 3)).rejects.toThrow("не Telegram");
  });

  it("журнал — обычная вставка без обёртки", async () => {
    await store.logWalletLogin({ wallet: "a.near", tgId: W + 1, accountId: null, kind: "new", created: true, device: "d", fp: null, ip: "1.2.3.4", ua: null });
    expect(s.sql[0].sql).toContain("INSERT INTO yuplink.wallet_login_log");
    expect(s.sql[0].opts).toBeUndefined();
  });
});
