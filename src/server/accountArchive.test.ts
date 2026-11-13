// Один аккаунт на ключ: архивный аккаунт ведёт на основной (с кэшем), админские
// Telegram правило не трогает, слияние идёт одной функцией базы.
import { beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({ sql: [] as string[], into: null as string | null, fail: false }));
vi.mock("./db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    s.sql.push(sql);
    if (s.fail) throw new Error("db down");
    if (sql.includes("archived_into FROM")) return [{ archived_into: s.into }];
    if (sql.includes("account_one_per_tg")) return [{ main: "acc_main" }];
    if (sql.includes("account_merge_by_rule")) return [{ main: "acc_b" }];
    return [];
  },
}));
vi.mock("./adminTg", () => ({ isAdminTg: (tg: number) => tg === 1 }));

const mod = await import("./accountArchive");

beforeEach(() => Object.assign(s, { sql: [], into: null, fail: false }));

describe("один аккаунт на ключ", () => {
  it("архивный ведёт на основной, ответ кэшируется", async () => {
    s.into = "acc_main";
    expect(await mod.archivedInto("acc_old")).toBe("acc_main");
    expect(await mod.archivedInto("acc_old")).toBe("acc_main");
    expect(s.sql).toHaveLength(1);
  });

  it("не в архиве — null; база молчит — играет как играл", async () => {
    expect(await mod.archivedInto("acc_live")).toBeNull();
    s.fail = true;
    expect(await mod.archivedInto("acc_other")).toBeNull();
  });

  it("кавычка в id не ломает запрос", async () => {
    await mod.archivedInto("acc_x'y");
    expect(s.sql[0]).toContain("'acc_x''y'");
  });

  it("Telegram админа правило не трогает", async () => {
    expect(await mod.oneAccountPerTg(1, "tg-login")).toBeNull();
    expect(s.sql).toHaveLength(0);
  });

  it("Telegram игрока — функция базы, основной в ответе", async () => {
    expect(await mod.oneAccountPerTg(42, "tg-login")).toBe("acc_main");
    expect(s.sql[0]).toContain("yuplink.account_one_per_tg(42, 'tg-login')");
  });

  it("слияние двух — одной функцией базы", async () => {
    expect(await mod.mergeByRule("acc_a", "acc_b", "link")).toBe("acc_b");
    expect(s.sql[0]).toContain("yuplink.account_merge_by_rule('acc_a', 'acc_b', 'link')");
    expect(await mod.mergeByRule("acc_a", "acc_a", "link")).toBe("acc_a");
    expect(s.sql).toHaveLength(1);
  });
});
