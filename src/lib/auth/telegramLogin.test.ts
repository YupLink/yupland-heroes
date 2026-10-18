import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/api/user-telegram", () => ({ loginViaTelegramInitData: vi.fn() }));

import { loginViaTelegramInitData } from "@/server/api/user-telegram";
import { inTelegramMiniApp, runTelegramLogin, tgLoginPending, useTgLogin } from "./telegramLogin";
import { useAppStore } from "@/lib/store";

const qc = { invalidateQueries: vi.fn(), resetQueries: vi.fn(async () => {}) } as never;
const setTg = (tg: unknown) =>
  ((globalThis as unknown as { window: unknown }).window = {
    Telegram: { WebApp: tg },
    location: { href: "https://x/?ref=tg1" },
  });

afterEach(() => {
  useTgLogin.setState({ state: "idle", error: null, wallet: null });
  useAppStore.getState().setWallet(null);
  vi.mocked(loginViaTelegramInitData).mockReset();
  delete (globalThis as unknown as { window?: unknown }).window;
});

describe("вход по Telegram первым и без кошелька", () => {
  it("в мини-апке до старта входа экран ждёт, вне Telegram — нет", () => {
    setTg({ initData: "query_id=1&user=%7B%7D&hash=x", platform: "tdesktop" });
    expect(inTelegramMiniApp()).toBe(true);
    expect(tgLoginPending("idle")).toBe(true);
    setTg({ initData: "", platform: "unknown" });
    expect(tgLoginPending("idle")).toBe(false);
    expect(tgLoginPending("pending")).toBe(true);
  });

  it("новичок: сервер завёл tg<id> — сессия в сторе, состояние ok", async () => {
    setTg({ initData: "query_id=1&user=%7B%7D&hash=x", platform: "android" });
    vi.mocked(loginViaTelegramInitData).mockResolvedValue({ ok: true, wallet: "tg42" } as never);
    const r = await runTelegramLogin(qc);
    expect(r).toEqual({ result: "ok", wallet: "tg42" });
    expect(useAppStore.getState().walletAddress).toBe("tg42");
    expect(useTgLogin.getState()).toMatchObject({ state: "ok", wallet: "tg42" });
  });

  it("отказ сервера — failed с кодом, без повтора; сеть — две попытки", async () => {
    setTg({ initData: "query_id=1&user=%7B%7D&hash=x", platform: "ios" });
    vi.mocked(loginViaTelegramInitData).mockResolvedValue({ ok: false, error: "stale" } as never);
    expect((await runTelegramLogin(qc)).result).toBe("failed");
    expect(useTgLogin.getState()).toMatchObject({ state: "failed", error: "stale" });
    expect(loginViaTelegramInitData).toHaveBeenCalledTimes(1);
    vi.mocked(loginViaTelegramInitData).mockReset().mockRejectedValue(new Error("fetch failed"));
    expect((await runTelegramLogin(qc)).result).toBe("failed");
    expect(loginViaTelegramInitData).toHaveBeenCalledTimes(2);
    expect(useTgLogin.getState().error).toBe("network");
  });

  it("Ярослав (нет ТГ-аккаунта) — skipped, вход кошельком устройства", async () => {
    setTg({ initData: "query_id=1&user=%7B%7D&hash=x", platform: "android" });
    vi.mocked(loginViaTelegramInitData).mockResolvedValue({
      ok: false,
      error: "no_wallet_linked",
    } as never);
    expect((await runTelegramLogin(qc)).result).toBe("skipped");
    expect(tgLoginPending(useTgLogin.getState().state)).toBe(false);
  });

  it("вернувшийся игрок с той же кукой — кэш не сбрасывается (замок не перезагружается)", async () => {
    setTg({ initData: "query_id=1&user=%7B%7D&hash=x", platform: "android" });
    useAppStore.getState().setWallet("tg42");
    const resetQueries = vi.fn(async () => {});
    vi.mocked(loginViaTelegramInitData).mockResolvedValue({ ok: true, wallet: "tg42" } as never);
    await runTelegramLogin({ invalidateQueries: vi.fn(), resetQueries } as never);
    expect(resetQueries).not.toHaveBeenCalled();
  });
});
