// Вход по кошельку: привязанный к Telegram — в свой аккаунт; из аккаунта с
// Telegram — туда же; старый без Telegram — свой номер; новый — отказ (только Telegram);
// отвязанный и админский — отказ. Подпись проверяется до всего.
import { beforeEach, describe, expect, it, vi } from "vitest";

const W = 6755399441055744;
type U = { wallet: string; telegram_id: number | null; account_id: string | null; disconnected?: boolean; ownership_verified?: boolean };
const s = vi.hoisted(() => ({
  users: new Map<string, U>(),
  accounts: new Map<string, { telegram_id: number | null }>(),
  claims: [] as Array<{ wallet: string; kind: string; limit: number }>,
  claimResult: 0 as number | null,
  session: null as null | { wallet: string; tg: number },
  logs: [] as Array<Record<string, unknown>>,
  verify: true,
  logFails: false,
  sql: [] as string[],
  onChain: null as unknown,
  walletOnly: null as null | boolean,
  crown: [] as Array<{ wallet: string; implicit: boolean; device: string | null; entry?: string }>,
}));


vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const fn = { inputValidator: () => fn, handler: (h: (a: { data: unknown }) => unknown) => (a: { data: unknown }) => h(a) };
    return fn;
  },
}));
vi.mock("@tanstack/react-start/server", () => ({ getRequestHeader: (n: string) => (n === "x-forwarded-for" ? "1.2.3.4, 5.6.7.8" : "ua") }));
// Домен запроса (§8.127): новый кошелёк заводится только на near.service.yupland.io.
const host = vi.hoisted(() => ({ entry: "google" as "google" | "tg" | "near" }));
vi.mock("../../entryHost", () => ({ requestEntry: () => host.entry }));
vi.mock("../../db/pg", () => ({
  pg: {
    users: {
      findOne: async ({ wallet }: { wallet: string }) => s.users.get(wallet) ?? null,
      update: async ({ wallet }: { wallet: string }, patch: Partial<U>) => {
        const u = s.users.get(wallet);
        if (u) Object.assign(u, patch);
      },
    },
    accounts: { findOne: async ({ id }: { id: string }) => s.accounts.get(id) ?? null },
  },
}));
vi.mock("../../db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    s.sql.push(sql);
    return sql.includes("account_wallet_login") ? [{ kind: "new" }] : [];
  },
}));
vi.mock("../../auth", () => ({
  isAdminWallet: (w: string) => w === "admin.near",
  isAdminWalletLinked: async (w: string) => w === "darai_collection.near",
  isPayoutsAdminWallet: (w: string) => w === "owner.near",
  isTreasuryWallet: () => false,
  setCurrentWallet: (wallet: string, tg: number, o?: { walletOnly?: boolean }) =>
    void ((s.session = { wallet, tg }), (s.walletOnly = o?.walletOnly ?? null)),
}));
vi.mock("../../adminTg", () => ({ isAdminTg: (tg: number) => tg === 700000002 }));
vi.mock("../nep413-login", () => ({
  issueLoginChallenge: async (p: string) => ({ nonce: "n", message: p, recipient: "r" }),
  verifyConnectOwnership: async (_a: unknown, o: { purpose?: string; onChain?: unknown }) => {
    if (!s.verify || o?.purpose !== "login") throw new Error("Подпись неверна");
    s.onChain = o.onChain ?? null;
    return { implicit: false };
  },
}));
vi.mock("./walletLoginStore", () => ({
  claimWalletTg: async (wallet: string, kind: string, limit: number) => {
    s.claims.push({ wallet, kind, limit });
    return s.claimResult;
  },
  logWalletLogin: async (r: Record<string, unknown>) => {
    if (s.logFails) throw new Error("db");
    s.logs.push(r);
  },
}));
vi.mock("./walletLoginCrown", () => ({
  openCrownWithdraw: async (wallet: string) => void s.sql.push(`own_only ${wallet}`),
  createCrownAccount: async (wallet: string, proof: { implicit: boolean }, dev: { device: string | null }, entry?: string) => {
    s.crown.push({ wallet, implicit: proof.implicit, device: dev.device, ...(entry ? { entry } : {}) });
    s.users.set(wallet, { wallet, telegram_id: W + 9, account_id: "acc_new", ownership_verified: true });
    return { tg: W + 9, created: true };
  },
}));
vi.mock("../google-login/googleLogin", () => ({ clientIp: (xff: string | null) => (xff ?? "").split(",")[0].trim() || null }));

const api = await import("./walletLogin");
const login = (accountId: string) =>
  (api.loginWithWallet as unknown as (a: { data: unknown }) => Promise<{ wallet: string; kind: string; created: boolean }>)({
    data: { accountId, publicKey: "ed25519:x", signature: "sig", nonce: "nonce", device: "dev1", fp: "a".repeat(64) },
  });

beforeEach(() => {
  Object.assign(s, { users: new Map(), accounts: new Map(), claims: [], claimResult: W + 1, session: null, logs: [], verify: true, logFails: false, sql: [], onChain: null, walletOnly: null, crown: [] });
});

describe("вход по кошельку", () => {
  it("кошелёк привязан к Telegram — вход в этот аккаунт, номер настоящий", async () => {
    s.users.set("bob.near", { wallet: "bob.near", telegram_id: 777, account_id: "acc_b", ownership_verified: true });
    expect(await login("Bob.near")).toMatchObject({ wallet: "bob.near", kind: "tg", created: false });
    expect(s.session).toEqual({ wallet: "bob.near", tg: 777 });
    expect(s.claims).toEqual([]);
    expect(s.logs[0]).toMatchObject({ wallet: "bob.near", tgId: 777, kind: "tg", device: "dev1", ip: "1.2.3.4" });
  });

  it("кошелёк без Telegram из аккаунта с Telegram — в тот же аккаунт, кошелёк пристёгнут", async () => {
    s.users.set("old.near", { wallet: "old.near", telegram_id: null, account_id: "acc_o", ownership_verified: true });
    s.accounts.set("acc_o", { telegram_id: 555 });
    expect(await login("old.near")).toMatchObject({ kind: "tg" });
    expect(s.session).toEqual({ wallet: "old.near", tg: 555 });
    expect(s.users.get("old.near")?.telegram_id).toBe(555);
  });

  it("старый кошелёк без Telegram — свой номер (legacy), мест не занимает", async () => {
    s.users.set("lone.near", { wallet: "lone.near", telegram_id: null, account_id: "acc_l" });
    s.accounts.set("acc_l", { telegram_id: null });
    expect(await login("lone.near")).toMatchObject({ kind: "legacy", created: false });
    expect(s.claims).toEqual([{ wallet: "lone.near", kind: "legacy", limit: 0 }]);
    expect(s.session).toEqual({ wallet: "lone.near", tg: W + 1 });
  });

  it("новый кошелёк — отказ: аккаунт только через Telegram, номер не выдаётся", async () => {
    await expect(login("fresh.near")).rejects.toThrow("walletLogin.newClosed");
    await expect(login("ab".repeat(32))).rejects.toThrow("walletLogin.newClosed");
    expect(s.claims).toEqual([]);
    expect(s.logs).toEqual([]);
    expect(s.session).toBeNull();
  });

  it("отвязанный и админские кошельки — отказ", async () => {
    s.users.set("gone.near", { wallet: "gone.near", telegram_id: 1, account_id: "a", disconnected: true });
    await expect(login("gone.near")).rejects.toThrow("walletLogin.unlinked");
    await expect(login("admin.near")).rejects.toThrow("walletLogin.adminWallet");
    await expect(login("darai_collection.near")).rejects.toThrow("walletLogin.adminWallet");
    expect(s.session).toBeNull();
  });

  it("подпись не сошлась — ничего не делаем", async () => {
    s.verify = false;
    await expect(login("fresh.near")).rejects.toThrow("Подпись неверна");
    expect(s.claims).toEqual([]);
    expect(s.session).toBeNull();
  });

  it("кошелёк, привязанный без подписи (до 18.10), открывает свой аккаунт", async () => {
    s.users.set("unv.near", { wallet: "unv.near", telegram_id: 777, account_id: "acc_u", ownership_verified: false });
    await login("unv.near");
    expect(s.session).toEqual({ wallet: "unv.near", tg: 777 });
    // Без подписи — вывод, новые кошельки и код входа закрыты до входа через Telegram.
    expect(s.walletOnly).toBe(true);
    s.users.set("unv2.near", { wallet: "unv2.near", telegram_id: null, account_id: "acc_u2" });
    s.accounts.set("acc_u2", { telegram_id: 778 });
    await login("unv2.near");
    expect(s.session).toEqual({ wallet: "unv2.near", tg: 778 });
  });

  it("подпись входа проверяется с живым ключом адреса", async () => {
    s.users.set("chk.near", { wallet: "chk.near", telegram_id: 779, account_id: "acc_c", ownership_verified: true });
    await login("chk.near");
    expect(s.onChain).toBe("ifExists");
    expect(s.walletOnly).toBe(false);
  });

  it("аккаунт админа — только через Telegram, даже если кошелёк без своего Telegram", async () => {
    s.users.set("side.near", { wallet: "side.near", telegram_id: null, account_id: "acc_y", ownership_verified: true });
    s.accounts.set("acc_y", { telegram_id: 700000002 });
    await expect(login("side.near")).rejects.toThrow("walletLogin.adminWallet");
    await expect(login("owner.near")).rejects.toThrow("walletLogin.adminWallet");
    expect(s.session).toBeNull();
  });

  it("журнал не записался — сессии нет; метка устройства с мусором — пустая", async () => {
    s.users.set("fresh.near", { wallet: "fresh.near", telegram_id: 777, account_id: "acc_f", ownership_verified: true });
    s.logFails = true;
    await expect(login("fresh.near")).rejects.toThrow("db");
    expect(s.session).toBeNull();
    s.logFails = false;
    await (api.loginWithWallet as unknown as (a: { data: unknown }) => Promise<unknown>)({
      data: { accountId: "fresh.near", publicKey: "ed25519:x", signature: "sig", nonce: "nonce", device: "\u0000bad" },
    });
    expect(s.logs.at(-1)).toMatchObject({ device: null });
  });

  it("повторный вход нового кошелька — его вид из базы (new)", async () => {
    s.users.set("again.near", { wallet: "again.near", telegram_id: W + 5, account_id: "acc_a" });
    expect(await login("again.near")).toMatchObject({ kind: "new", created: false });
    expect(s.sql).toContain("own_only again.near");
    expect(s.session).toEqual({ wallet: "again.near", tg: W + 5 });
  });

  it("новый кошелёк со ссылки «Короны» (entry crown) — свой аккаунт; без ссылки — отказ", async () => {
    const call = (entry?: string) =>
      (api.loginWithWallet as unknown as (a: { data: unknown }) => Promise<{ kind: string; created: boolean }>)({
        data: { accountId: "Crown.near", publicKey: "ed25519:x", signature: "sig", nonce: "nonce", device: "dev7", ...(entry ? { entry } : {}) },
      });
    await expect(call()).rejects.toThrow("walletLogin.newClosed");
    expect(s.crown).toEqual([]);
    expect(await call("crown")).toMatchObject({ kind: "new", created: true });
    expect(s.crown).toEqual([{ wallet: "crown.near", implicit: false, device: "dev7" }]);
    expect(s.session).toEqual({ wallet: "crown.near", tg: W + 9 });
    expect(s.walletOnly).toBe(false);
    expect(s.logs.at(-1)).toMatchObject({ wallet: "crown.near", kind: "new", created: true });
  });

  it("ссылка «Короны»: админ и владелец входят своим привязанным кошельком; без привязки — отказ", async () => {
    const crown = (accountId: string) =>
      (api.loginWithWallet as unknown as (a: { data: unknown }) => Promise<{ kind: string }>)({
        data: { accountId, publicKey: "ed25519:x", signature: "sig", nonce: "nonce", device: "dev8", entry: "crown" },
      });
    // Лимит входов с одного адреса (20/мин) — новая минута для этого теста.
    const now = vi.spyOn(Date, "now").mockReturnValue(Date.now() + 120_000);
    s.users.set("admin.near", { wallet: "admin.near", telegram_id: 700000002, account_id: "acc_adm", ownership_verified: true });
    expect(await crown("admin.near")).toMatchObject({ kind: "tg" });
    expect(s.session).toEqual({ wallet: "admin.near", tg: 700000002 });
    // Владелец «Выплат» (он же «Казна») — тоже свой кошелёк, пускаем.
    s.users.set("owner.near", { wallet: "owner.near", telegram_id: 700000001, account_id: "acc_own", ownership_verified: true });
    expect(await crown("owner.near")).toMatchObject({ kind: "tg" });
    expect(s.session).toEqual({ wallet: "owner.near", tg: 700000001 });
    // Админский кошелёк без привязки — нового аккаунта не заводим.
    await expect(crown("darai_collection.near")).rejects.toThrow("walletLogin.adminWallet");
    expect(s.crown).toEqual([]);
    now.mockRestore();
  });

  it("домен near.service (entry near) — новый кошелёк получает аккаунт без «Короны»; админу — отказ", async () => {
    const near = (accountId: string) =>
      (api.loginWithWallet as unknown as (a: { data: unknown }) => Promise<{ kind: string; created: boolean }>)({
        data: { accountId, publicKey: "ed25519:x", signature: "sig", nonce: "nonce", device: "dev9", entry: "near" },
      });
    const now = vi.spyOn(Date, "now").mockReturnValue(Date.now() + 240_000);
    // С другого домена «near» не в счёт — нового аккаунта нет.
    await expect(near("Other.near")).rejects.toThrow("walletLogin.newClosed");
    host.entry = "near";
    expect(await near("Fresh.near")).toMatchObject({ kind: "new", created: true });
    expect(s.crown).toEqual([{ wallet: "fresh.near", implicit: false, device: "dev9", entry: "near" }]);
    expect(s.session).toEqual({ wallet: "fresh.near", tg: W + 9 });
    // Поблажки админу — только на ссылке «Короны».
    s.users.set("admin.near", { wallet: "admin.near", telegram_id: 700000002, account_id: "acc_adm", ownership_verified: true });
    await expect(near("admin.near")).rejects.toThrow("walletLogin.adminWallet");
    host.entry = "google";
    now.mockRestore();
  });
});
