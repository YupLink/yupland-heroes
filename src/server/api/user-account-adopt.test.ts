// Переезд telegram_id на аккаунт кошельков: пустой держатель, нет держателя,
// два живых аккаунта — не трогаем.
import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: string[] = [];
const state = {
  holder: [] as Array<{ id: string }>,
  played: [] as Array<{ account_id: string; n: number }>,
  used: [] as Array<{ id: string }>,
};

vi.mock("../db/mcpClient", () => ({
  mcpExec: vi.fn(async (sql: string) => {
    calls.push(sql.replace(/\s+/g, " ").trim());
    if (sql.includes("FROM yuplink.accounts WHERE telegram_id")) return state.holder;
    if (sql.includes("GROUP BY account_id")) return state.played;
    if (sql.includes("SELECT wallet AS id")) return state.used;
    return null;
  }),
}));

const { adoptTelegramAccount } = await import("./user-account-adopt");

beforeEach(() => {
  calls.length = 0;
  state.holder = [];
  state.played = [];
  state.used = [];
});

describe("adoptTelegramAccount", () => {
  it("держателя нет — id ставится на аккаунт кошельков", async () => {
    state.played = [{ account_id: "acc_B", n: 2 }];
    await adoptTelegramAccount(42);
    expect(
      calls.some((c) =>
        c.includes("SET telegram_id = 42 WHERE id = 'acc_B' AND telegram_id IS NULL"),
      ),
    ).toBe(true);
    expect(calls.some((c) => c.includes("player_gift"))).toBe(false);
  });

  it("пустой держатель — id, подарки и удары переезжают", async () => {
    state.holder = [{ id: "acc_A" }];
    state.played = [{ account_id: "acc_B", n: 2 }];
    await adoptTelegramAccount(42);
    const sql = calls.find((c) => c.includes("player_gift")) ?? "";
    expect(sql).toContain("SET telegram_id = NULL WHERE id = 'acc_A'");
    expect(sql).toContain("SET telegram_id = 42 WHERE id = 'acc_B'");
    expect(sql).toContain(
      "SET account_id = 'acc_B' WHERE account_id = 'acc_A' AND status = 'pending'",
    );
  });

  it("у держателя есть кошельки или два живых аккаунта — ничего", async () => {
    state.holder = [{ id: "acc_A" }];
    state.played = [{ account_id: "acc_B", n: 1 }];
    state.used = [{ id: "w1" }];
    await adoptTelegramAccount(42);
    expect(calls.some((c) => c.includes("UPDATE"))).toBe(false);
    calls.length = 0;
    state.used = [];
    state.played = [
      { account_id: "acc_B", n: 1 },
      { account_id: "acc_C", n: 1 },
    ];
    await adoptTelegramAccount(42);
    expect(calls.some((c) => c.includes("UPDATE"))).toBe(false);
  });

  it("держатель и есть аккаунт кошельков — ничего", async () => {
    state.holder = [{ id: "acc_B" }];
    state.played = [{ account_id: "acc_B", n: 3 }];
    await adoptTelegramAccount(42);
    expect(calls.some((c) => c.includes("UPDATE"))).toBe(false);
  });
});
