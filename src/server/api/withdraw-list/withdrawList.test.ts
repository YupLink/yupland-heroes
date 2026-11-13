// Белый список вывода (§8.127): новым — нет, старым — как раньше; Google — никогда,
// номер кошелька — только «Корона»; правка — только владелец, с журналом.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GOOGLE_TG_BASE, WALLET_TG_BASE } from "@/lib/auth/googleTg";

const st = vi.hoisted(() => ({
  listed: new Set<string>(),
  crown: new Set<string>(),
  sql: [] as string[],
  owner: true,
}));

type Fn = (a: { data: unknown }) => unknown;
vi.mock("@tanstack/react-start", () => {
  const wrap = (fn: Fn, v?: (d: unknown) => unknown) => (a?: { data?: unknown }) =>
    fn({ data: v ? v(a?.data) : a?.data });
  return {
    createServerFn: () => ({
      handler: (fn: Fn) => wrap(fn),
      inputValidator: (v: (d: unknown) => unknown) => ({ handler: (fn: Fn) => wrap(fn, v) }),
    }),
  };
});
vi.mock("../../auth", () => ({
  requirePayoutsAdmin: () => {
    if (!st.owner) throw new Error("Доступ запрещён");
    return "owner.tg";
  },
}));
vi.mock("../currency/move", () => ({ accAccountId: async (w: string) => `acc_${w}` }));
vi.mock("../../db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    st.sql.push(sql);
    const acc = /'(acc_[^']+)'/.exec(sql)?.[1] ?? "";
    if (/withdraw_unlisted/.test(sql)) return [{ ok: st.listed.has(acc) }];
    if (/withdraw_crown_own/.test(sql)) return [{ ok: st.crown.has(acc) }];
    if (/INSERT INTO yuplink\.withdraw_whitelist /.test(sql)) {
      if (st.listed.has(acc)) return [];
      st.listed.add(acc);
      return [{ account_id: acc }];
    }
    if (/DELETE FROM yuplink\.withdraw_whitelist/.test(sql))
      return st.listed.delete(acc) ? [{ account_id: acc }] : [];
    return [];
  },
}));

const wl = await import("./withdrawList");
const admin = await import("./withdrawListAdmin");

beforeEach(() => {
  st.listed = new Set(["acc_old1", "acc_old.near"]);
  st.crown = new Set();
  st.sql = [];
  st.owner = true;
  for (const a of ["acc_old1", "acc_new1", "acc_g", "acc_w", "acc_old.near", "acc_new.near"])
    wl.forgetWithdrawListed(a);
});

describe("кнопки вывода в сессии", () => {
  it("Telegram: старый — да, новый — нет", async () => {
    expect(await wl.sessionCanWithdraw("acc_old1", 100200300)).toBe(true);
    expect(await wl.sessionCanWithdraw("acc_new1", 100200301)).toBe(false);
  });
  it("Google — нет даже в списке; номер кошелька — только «Корона»", async () => {
    st.listed.add("acc_g");
    expect(await wl.sessionCanWithdraw("acc_g", GOOGLE_TG_BASE + 1)).toBe(false);
    expect(await wl.sessionCanWithdraw("acc_w", WALLET_TG_BASE + 1)).toBe(false);
    st.crown.add("acc_w");
    expect(await wl.sessionCanWithdraw("acc_w", WALLET_TG_BASE + 1)).toBe(true);
  });
  it("ручка вывода: не в списке — withdraw.notListed", async () => {
    await expect(wl.assertWithdrawListed("old.near")).resolves.toBeUndefined();
    await expect(wl.assertWithdrawListed("new.near")).rejects.toThrow("withdraw.notListed");
  });
});

describe("правка списка — только владелец", () => {
  it("добавить и убрать: строка журнала на каждое изменение, кэш сбрасывается", async () => {
    expect(await wl.withdrawListed("acc_new1")).toBe(false);
    const set = admin.adminSetWithdrawListed as unknown as (a: {
      data: unknown;
    }) => Promise<{ changed: boolean }>;
    expect(await set({ data: { account: "acc_new1", on: true } })).toMatchObject({ changed: true });
    expect(await wl.withdrawListed("acc_new1")).toBe(true);
    expect(st.sql.filter((q) => /withdraw_whitelist_log/.test(q) && /'add'/.test(q))).toHaveLength(
      1,
    );
    expect(await set({ data: { account: "acc_new1", on: false } })).toMatchObject({
      changed: true,
    });
    expect(await wl.withdrawListed("acc_new1")).toBe(false);
    expect(st.sql.filter((q) => /'remove'/.test(q))).toHaveLength(1);
  });
  it("не владелец — отказ до базы; плохой номер аккаунта — отказ", async () => {
    st.owner = false;
    const set = admin.adminSetWithdrawListed as unknown as (a: {
      data: unknown;
    }) => Promise<unknown>;
    await expect(set({ data: { account: "acc_new1", on: true } })).rejects.toThrow(
      "Доступ запрещён",
    );
    expect(st.sql).toEqual([]);
    st.owner = true;
    await expect(
      (async () => set({ data: { account: "x'; DROP", on: true } }))(),
    ).rejects.toThrow();
  });
});
