// Сессия = кошелёк + проверенный Telegram (18.10.2026): старая сессия «просто
// кошельком» недействительна; админка — по списку кошельков или Telegram админа;
// выплаты — только по своему списку, пустой список = закрыто.
import { beforeEach, describe, expect, it, vi } from "vitest";

const jar = vi.hoisted(() => new Map<string, string>());
vi.mock("@tanstack/react-start/server", () => ({
  getCookie: (k: string) => jar.get(k),
  setCookie: (k: string, v: string) => {
    if (v) jar.set(k, v);
    else jar.delete(k);
  },
}));
vi.mock("./db/pg", () => ({ pg: {} }));

process.env.SESSION_SECRET = "test-session-secret-0123456789";
process.env.ADMIN_WALLETS = "owner.example.tg,darai_collection.near";
process.env.ADMIN_TG_ACCOUNTS = "100000002";
process.env.PAYOUTS_ADMIN_WALLETS = "owner.example.tg";

const auth = await import("./auth");
const { signCookieValue } = await import("./sessionCookie");

beforeEach(() => jar.clear());

describe("сессия", () => {
  it("ставится только с Telegram и читается обратно", () => {
    auth.setCurrentWallet("yupland_nfts.near", 100000002);
    expect(auth.getCurrentWallet()).toBe("yupland_nfts.near");
    expect(auth.getSessionTgId()).toBe(100000002);
    expect(() => auth.setCurrentWallet("x.near", 0)).toThrow(/Telegram/);
  });

  it("старая подписанная сессия без Telegram — недействительна, метка аккаунта тоже", () => {
    jar.set("gd_wallet", signCookieValue("darai_collection.near"));
    jar.set("gd_acc", signCookieValue("acc_player44"));
    expect(auth.getCurrentWallet()).toBeNull();
    expect(auth.getSessionTgId()).toBeNull();
    expect(auth.getCurrentAccountId()).toBeNull();
  });

  it("подделанный Telegram в cookie не проходит подпись", () => {
    auth.setCurrentWallet("evil.near", 111);
    const raw = jar.get("gd_wallet")!;
    jar.set("gd_wallet", raw.replace("#111~", "#100000002~"));
    expect(auth.getCurrentWallet()).toBeNull();
  });
});

describe("метка аккаунта", () => {
  it("годится только при той же сессии", () => {
    auth.setCurrentWallet("me.near", 111);
    auth.setCurrentAccountId("acc_me");
    expect(auth.getCurrentAccountId()).toBe("acc_me");
    // чужая метка (от другой сессии) рядом с моей сессией — не принимается
    jar.set("gd_acc", signCookieValue("acc_victim|victim.near#222"));
    expect(auth.getCurrentAccountId()).toBeNull();
  });
});

describe("админка", () => {
  it("кошелёк из списка — админ", () => {
    expect(auth.isAdminWallet("owner.example.tg")).toBe(true);
  });

  it("любой кошелёк сессии Telegram админа — админ, но не выплаты", () => {
    auth.setCurrentWallet("any_new.near", 100000002);
    expect(auth.isAdminWallet("any_new.near")).toBe(true);
    expect(auth.isPayoutsAdminWallet("any_new.near")).toBe(false);
    // чужой кошелёк, о котором спросили в этой сессии, — не админ
    expect(auth.isAdminWallet("someone.near")).toBe(false);
  });

  it("сессия другого Telegram — не админ", () => {
    auth.setCurrentWallet("any_new.near", 999);
    expect(auth.isAdminWallet("any_new.near")).toBe(false);
  });

  it("выплаты — только по своему списку", () => {
    expect(auth.isPayoutsAdminWallet("owner.example.tg")).toBe(true);
    expect(auth.isPayoutsAdminWallet("darai_collection.near")).toBe(false);
  });
});
