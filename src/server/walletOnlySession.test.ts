// Вход кошельком без подписи: метка внутри подписанной сессии — снять её, не потеряв
// сессию, нельзя; пересадка на другой кошелёк того же Telegram её сохраняет; вход
// через Telegram снимает.
import { beforeEach, describe, expect, it, vi } from "vitest";

const jar = vi.hoisted(() => new Map<string, string>());
vi.mock("@tanstack/react-start/server", () => ({
  getCookie: (k: string) => jar.get(k),
  setCookie: (k: string, v: string) => void (v ? jar.set(k, v) : jar.delete(k)),
}));
vi.mock("./db/pg", () => ({ pg: {} }));
process.env.SESSION_SECRET = "test-session-secret-0123456789";

const auth = await import("./auth");
const mod = await import("./walletOnlySession");
const { signCookieValue, readSignedCookieValue } = await import("./sessionCookie");

beforeEach(() => jar.clear());

describe("сессия по кошельку без подписи", () => {
  it("метка в сессии: кошелёк и Telegram читаются как обычно, действия закрыты", () => {
    auth.setCurrentWallet("alice.near", 777, { walletOnly: true });
    expect(auth.getCurrentWallet()).toBe("alice.near");
    expect(auth.getSessionTgId()).toBe(777);
    expect(mod.isWalletOnlySession()).toBe(true);
    expect(() => mod.assertNotWalletOnly()).toThrow("walletLogin.needTelegram");
  });

  it("пересадка на кошелёк того же Telegram метку сохраняет; вход через Telegram — снимает", () => {
    auth.setCurrentWallet("alice.near", 777, { walletOnly: true });
    auth.setCurrentWallet("bob.near", 777);
    expect(mod.isWalletOnlySession()).toBe(true);
    auth.setCurrentWallet("bob.near", 777, { proven: true });
    expect(mod.isWalletOnlySession()).toBe(false);
    expect(() => mod.assertNotWalletOnly()).not.toThrow();
  });

  it("убрать метку из cookie нельзя: без подписи сессии нет вовсе", () => {
    auth.setCurrentWallet("alice.near", 777, { walletOnly: true });
    const raw = readSignedCookieValue(jar.get("gd_wallet") ?? null);
    expect(raw).toBe("wl:alice.near#777");
    const signed = jar.get("gd_wallet") ?? "";
    jar.set("gd_wallet", signed.replace("wl:", ""));
    expect(auth.getCurrentWallet()).toBeNull();
    // Подписанная сессия без метки — обычная (старые сессии игроков не ломаются).
    jar.set("gd_wallet", signCookieValue("alice.near#777"));
    expect(auth.getCurrentWallet()).toBe("alice.near");
    expect(mod.isWalletOnlySession()).toBe(false);
  });

  it("другой Telegram — новая сессия без метки", () => {
    auth.setCurrentWallet("alice.near", 777, { walletOnly: true });
    auth.setCurrentWallet("carol.near", 888);
    expect(mod.isWalletOnlySession()).toBe(false);
  });
});
