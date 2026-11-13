// Привязка Google не сливает аккаунты (владелец, 12.11.2026: «такое только через ТП»):
// Google без своего аккаунта привязывается; Google со своим аккаунтом — отказ, ничего не
// пишется; сам Google-аккаунт привязывать некуда.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GOOGLE_TG_BASE } from "@/lib/auth/googleTg";

const st = vi.hoisted(() => ({
  tg: 700001 as number,
  own: new Set<string>(),
  links: {} as Record<string, string>,
  sql: [] as string[],
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
  getCurrentWallet: () => "tg700001",
  getSessionTgId: () => st.tg,
}));
vi.mock("../../walletOnlySession", () => ({ isWalletOnlySession: () => false }));
vi.mock("../raid-shared", () => ({ sqlStr: (v: string) => `'${v.replace(/'/g, "''")}'` }));
vi.mock("../../db/pg", () => ({ pg: { users: { findMany: async () => [] } } }));
vi.mock("./googleStore", () => ({
  readGoogleSettings: async () => ({ clientId: "1-x.apps.googleusercontent.com", open: true }),
  googleAccountExists: async (sub: string) => st.own.has(sub),
}));
vi.mock("./verifyGoogleAccess", () => ({
  verifyGoogleAccessToken: async (token: string) => ({
    sub: token.slice(0, token.indexOf(":")),
    email: "p@gmail.com",
    exp: 2_000_000_000,
  }),
}));
vi.mock("./googleOnce", () => ({ consumeGoogleToken: async () => true }));
vi.mock("../currency/move", () => ({ accAccountId: async () => "acc_tg" }));
vi.mock("../../db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    st.sql.push(sql);
    if (/INSERT INTO yuplink\.account_google_link/.test(sql)) {
      const [, s, acc] = /VALUES \('([^']*)', '([^']*)'/.exec(sql) ?? [];
      if (st.links[s]) return [];
      st.links[s] = acc;
      return [{ sub: s }];
    }
    throw new Error(`неожиданный SQL: ${sql.slice(0, 80)}`);
  },
}));

import { linkGoogle } from "./googleLink";

const link = (sub: string) =>
  (linkGoogle as unknown as (a: { data: unknown }) => Promise<{ ok: true }>)({
    data: { accessToken: `${sub}:${"t".repeat(30)}` },
  });

beforeEach(() => {
  st.tg = 700001;
  st.own = new Set();
  st.links = {};
  st.sql = [];
});

describe("привязка Google — без слияния аккаунтов", () => {
  it("у Google своего аккаунта нет — привязка", async () => {
    await expect(link("g1")).resolves.toMatchObject({ ok: true });
    expect(st.links.g1).toBe("acc_tg");
  });

  it("у Google свой аккаунт — отказ, в базу ничего", async () => {
    st.own.add("g2");
    await expect(link("g2")).rejects.toThrow("google.linkTaken");
    expect(st.sql).toEqual([]);
  });

  it("Google уже привязан к другому аккаунту — отказ", async () => {
    st.links.g3 = "acc_other";
    await expect(link("g3")).rejects.toThrow("google.linkTaken");
  });

  it("сам Google-аккаунт привязывать некуда", async () => {
    st.tg = GOOGLE_TG_BASE + 9;
    await expect(link("g4")).rejects.toThrow("google.linkOwn");
  });
});
