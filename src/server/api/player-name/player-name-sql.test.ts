// Имя для других: своё имя из профиля, иначе @ник Telegram, id<tg>, кошелёк.
import { describe, expect, it } from "vitest";
import { accountNamesSql, customNameSql, walletLabelsSql } from "./player-name-sql";

const flat = (s: string) => s.replace(/\s+/g, " ");

describe("имя игрока в досках", () => {
  it("по аккаунтам: своё имя первым, дальше прежний порядок", () => {
    const sql = flat(accountNamesSql(["acc_1"]));
    const own = sql.indexOf("pa.display_name");
    expect(own).toBeGreaterThan(0);
    expect(sql.indexOf("'@' || min(u.telegram_username)")).toBeGreaterThan(own);
    expect(sql).toContain("WHERE u.account_id IN ('acc_1')");
  });
  it("по кошелькам: своё имя или @ник", () => {
    const sql = flat(walletLabelsSql(["w.near"]));
    expect(sql).toContain("'@' || NULLIF(btrim(u.telegram_username), '')");
    expect(sql).toContain("WHERE u.wallet IN ('w.near')");
  });
  it("пустое имя — как не заданное", () => {
    expect(customNameSql("r.account_id")).toContain("NULLIF(btrim(pa.display_name), '')");
  });
});
