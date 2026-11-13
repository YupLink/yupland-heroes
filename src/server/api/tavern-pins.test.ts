// Закладки таверны на аккаунте: запись правкой со сверкой хозяина, чтение
// терпит ещё не заведённую колонку, вход проверяется по схеме.
import { beforeEach, describe, expect, it, vi } from "vitest";

type Fn = (a: { data: unknown }) => Promise<unknown>;
const s = vi.hoisted(() => ({
  sql: [] as Array<{ sql: string; opts?: { wrapJson?: boolean; wrapJsonCte?: boolean } }>,
  account: "acc_me" as string | null,
  reply: [] as unknown[],
  fail: null as string | null,
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const wrap = (fn: Fn, v?: (d: unknown) => unknown) => async (a: { data: unknown }) =>
      fn({ data: v ? v(a.data) : a.data });
    return {
      handler: (fn: Fn) => wrap(fn),
      inputValidator: (v: (d: unknown) => unknown) => ({ handler: (fn: Fn) => wrap(fn, v) }),
    };
  },
}));
vi.mock("@/server/auth", () => ({
  currentAccount: async () => s.account,
  requireAccount: async () => {
    if (!s.account) throw new Error("Нужно войти в игру");
    return s.account;
  },
}));
vi.mock("@/server/db/mcpClient", () => ({
  mcpExec: async (sql: string, opts?: { wrapJson?: boolean; wrapJsonCte?: boolean }) => {
    // Как настоящий mcpExec: запись внутри подзапроса wrapJson не парсится.
    if (opts?.wrapJson && /^\s*(INSERT|UPDATE|DELETE)\b/.test(sql))
      throw new Error('syntax error at or near "INTO"');
    s.sql.push({ sql, opts });
    if (s.fail) throw new Error(s.fail);
    return s.reply;
  },
}));

const { getTavernPins, saveTavernPins } = await import("./tavern-pins");
const call = (f: unknown, data?: unknown) => (f as Fn)({ data });

beforeEach(() => {
  s.sql = [];
  s.account = "acc_me";
  s.reply = [];
  s.fail = null;
});

describe("getTavernPins", () => {
  it("читает список своего аккаунта", async () => {
    s.reply = [{ tavern_pins: ["item:a", "hero:b"] }];
    expect(await call(getTavernPins)).toEqual(["item:a", "hero:b"]);
    expect(s.sql[0].sql).toContain("account_id='acc_me'");
  });

  it("гость и аккаунт без строки — пусто", async () => {
    expect(await call(getTavernPins)).toEqual([]);
    s.account = null;
    expect(await call(getTavernPins)).toEqual([]);
  });

  it("колонку ещё не завели — пусто, а не ошибка", async () => {
    s.fail = 'column "tavern_pins" does not exist';
    expect(await call(getTavernPins)).toEqual([]);
  });

  it("прочий сбой базы не выдаёт за пустой список", async () => {
    s.fail = "connection reset";
    await expect(call(getTavernPins)).rejects.toThrow("connection reset");
  });
});

describe("saveTavernPins", () => {
  it("пишет правкой с RETURNING через wrapJsonCte и сверяет хозяина", async () => {
    s.reply = [{ tavern_pins: ["item:a", "hero:b"] }];
    expect(await call(saveTavernPins, { add: ["hero:b"], remove: ["item:z"] })).toEqual([
      "item:a",
      "hero:b",
    ]);
    const { sql, opts } = s.sql[0];
    expect(opts).toEqual({ wrapJsonCte: true });
    expect(sql).toMatch(/^INSERT INTO yuplink\.account_view AS v/);
    expect(sql).toContain("ON CONFLICT (account_id) DO UPDATE");
    expect(sql).toContain("array_cat(v.tavern_pins, ARRAY['hero:b']::text[])");
    expect(sql).toContain("<> ALL(ARRAY['item:z']::text[])");
    // Хозяин — аккаунт: и экземпляр героя, и копия предмета.
    expect(sql).toContain("h.account_id = 'acc_me'");
    expect(sql).toContain("u.account_id = 'acc_me' AND u.kind = 'hero'");
  });

  it("гость не пишет", async () => {
    s.account = null;
    await expect(call(saveTavernPins, { add: ["item:a"], remove: [] })).rejects.toThrow(
      "Нужно войти",
    );
    expect(s.sql).toHaveLength(0);
  });

  it("чужие по форме ключи и лишние поля отбивает схема", async () => {
    await expect(call(saveTavernPins, { add: ["template:t"], remove: [] })).rejects.toThrow();
    await expect(
      call(saveTavernPins, { add: ["item:a'; DROP TABLE x;--"], remove: [] }),
    ).rejects.toThrow();
    await expect(call(saveTavernPins, { add: [], remove: [], pins: [] })).rejects.toThrow();
    await expect(
      call(saveTavernPins, {
        add: Array.from({ length: 201 }, (_, i) => `item:h${i}`),
        remove: [],
      }),
    ).rejects.toThrow();
    expect(s.sql).toHaveLength(0);
  });
});
