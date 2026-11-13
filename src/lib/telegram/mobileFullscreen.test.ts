import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  canToggleTgFrame,
  enterMobileFullscreen,
  isTgMobileClient,
  setTgFrame,
  tgFrameOn,
  tgFullscreenTop,
  type TgFullscreenApi,
} from "./mobileFullscreen";

let classes: Set<string>;
let store: Map<string, string>;
/** Экран устройства: телефон 390×844, планшет 820×1180. */
const screenOf = (width: number, height: number) => vi.stubGlobal("screen", { width, height });
beforeEach(() => {
  classes = new Set();
  store = new Map();
  const toggle = (name: string, on: boolean) => (on ? classes.add(name) : classes.delete(name));
  vi.stubGlobal("document", { documentElement: { classList: { toggle } } });
  vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) });
  screenOf(820, 1180);
});
afterEach(() => vi.unstubAllGlobals());

function fakeTg(platform: string, version = "8.0"): TgFullscreenApi & { fire: (e: string) => void } {
  const handlers = new Map<string, () => void>();
  const tg = {
    platform,
    isFullscreen: false,
    isVersionAtLeast: (v: string) => Number(version) >= Number(v),
    requestFullscreen: vi.fn(() => {
      tg.isFullscreen = true;
      handlers.get("fullscreenChanged")?.();
    }),
    exitFullscreen: vi.fn(() => {
      tg.isFullscreen = false;
      handlers.get("fullscreenChanged")?.();
    }),
    onEvent: (e: string, h: () => void) => handlers.set(e, h),
    fire: (e: string) => handlers.get(e)?.(),
  };
  return tg;
}

describe("Telegram на телефоне и планшете — во весь экран", () => {
  it("мобильный клиент: ios/android; ПК-клиенты и браузер — нет", () => {
    expect(isTgMobileClient({ platform: "ios" })).toBe(true);
    expect(isTgMobileClient({ platform: "android" })).toBe(true);
    expect(isTgMobileClient({ platform: "tdesktop" })).toBe(false);
    expect(isTgMobileClient({ platform: "macos" })).toBe(false);
    expect(isTgMobileClient({ platform: "weba" })).toBe(false);
    expect(isTgMobileClient({ platform: "unknown" })).toBe(false);
  });

  it.each(["ios", "android"])("%s, планшет: по умолчанию просит полный экран и ставит класс tg-fs", (platform) => {
    const tg = fakeTg(platform);
    enterMobileFullscreen(tg);
    expect(tg.requestFullscreen).toHaveBeenCalledOnce();
    expect(classes.has("tg-fs")).toBe(true);
  });

  it.each(["tdesktop", "macos", "web", "weba"])("%s: полного экрана не просит, класса нет", (platform) => {
    const tg = fakeTg(platform);
    enterMobileFullscreen(tg);
    expect(tg.requestFullscreen).not.toHaveBeenCalled();
    expect(classes.has("tg-fs")).toBe(false);
  });

  it("уже во весь экран (повторное открытие) — не просит снова, класс стоит", () => {
    const tg = fakeTg("ios");
    tg.isFullscreen = true;
    enterMobileFullscreen(tg);
    expect(tg.requestFullscreen).not.toHaveBeenCalled();
    expect(classes.has("tg-fs")).toBe(true);
  });

  it("клиент старше 8.0 — не просит (там метод бросает), остаётся как было", () => {
    const tg = fakeTg("ios", "7.10");
    enterMobileFullscreen(tg);
    expect(tg.requestFullscreen).not.toHaveBeenCalled();
    expect(classes.has("tg-fs")).toBe(false);
  });

  it("отказ клиента не роняет вход, класс снимается при выходе из полного экрана", () => {
    const tg = fakeTg("android");
    tg.requestFullscreen = vi.fn(() => {
      throw new Error("WebAppMethodUnsupported");
    });
    expect(() => enterMobileFullscreen(tg)).not.toThrow();
    expect(classes.has("tg-fs")).toBe(false);
    tg.isFullscreen = true;
    tg.fire("fullscreenChanged");
    expect(classes.has("tg-fs")).toBe(true);
    tg.isFullscreen = false;
    tg.fire("fullscreenChanged");
    expect(classes.has("tg-fs")).toBe(false);
  });

  it("высота полосы Telegram для окон, которые ставятся скриптом: только в полном экране", () => {
    const insets = { safeAreaInset: { top: 47 }, contentSafeAreaInset: { top: 46 } };
    expect(tgFullscreenTop({ ...insets, isFullscreen: true })).toBe(93);
    expect(tgFullscreenTop({ ...insets, isFullscreen: false })).toBe(0);
    expect(tgFullscreenTop({ isFullscreen: true })).toBe(0);
    expect(tgFullscreenTop(undefined)).toBe(0);
  });
});

describe("«Рамки Telegram» (владелец, 30.10.2026)", () => {
  it("телефон по умолчанию — с рамками: полного экрана не просит", () => {
    screenOf(390, 844);
    const tg = fakeTg("ios");
    enterMobileFullscreen(tg);
    expect(tg.requestFullscreen).not.toHaveBeenCalled();
    expect(tgFrameOn()).toBe(true);
    expect(classes.has("tg-fs")).toBe(false);
  });

  it("выбор игрока важнее размера: телефон без рамок, планшет с рамками", () => {
    screenOf(390, 844);
    store.set("gd_tg_frame", "off");
    const phone = fakeTg("ios");
    enterMobileFullscreen(phone);
    expect(phone.requestFullscreen).toHaveBeenCalledOnce();
    screenOf(820, 1180);
    store.set("gd_tg_frame", "on");
    const tablet = fakeTg("android");
    enterMobileFullscreen(tablet);
    expect(tablet.requestFullscreen).not.toHaveBeenCalled();
  });

  it("переключатель: запоминает и сразу применяет в обе стороны", () => {
    screenOf(390, 844);
    const tg = fakeTg("ios");
    enterMobileFullscreen(tg);
    setTgFrame(false, tg);
    expect(store.get("gd_tg_frame")).toBe("off");
    expect(tg.isFullscreen).toBe(true);
    expect(classes.has("tg-fs")).toBe(true);
    setTgFrame(true, tg);
    expect(store.get("gd_tg_frame")).toBe("on");
    expect(tg.exitFullscreen).toHaveBeenCalledOnce();
    expect(classes.has("tg-fs")).toBe(false);
  });

  it("пункт только там, где полный экран бывает: мобильный Telegram 8.0+", () => {
    expect(canToggleTgFrame(fakeTg("ios"))).toBe(true);
    expect(canToggleTgFrame(fakeTg("android", "7.10"))).toBe(false);
    expect(canToggleTgFrame(fakeTg("tdesktop"))).toBe(false);
    expect(canToggleTgFrame(undefined)).toBe(false);
  });
});
