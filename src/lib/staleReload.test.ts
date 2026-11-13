import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const reload = vi.fn();
vi.mock("@/lib/versionCheck", () => ({ forceReloadBustCache: () => reload() }));
const { isStaleChunkError, noteActivity, reloadForStaleChunk, scheduleQuietUpdate } =
  await import("./staleReload");

class Target {
  private on = new Map<string, Set<() => void>>();
  addEventListener(type: string, fn: () => void) {
    if (!this.on.has(type)) this.on.set(type, new Set());
    this.on.get(type)?.add(fn);
  }
  removeEventListener(type: string, fn: () => void) {
    this.on.get(type)?.delete(fn);
  }
  fire(type: string) {
    for (const fn of this.on.get(type) ?? []) fn();
  }
}
let win: Target & { setInterval: typeof setInterval; clearInterval: typeof clearInterval };
let doc: Target & { visibilityState: string };

beforeEach(() => {
  vi.useFakeTimers();
  reload.mockClear();
  const store = new Map<string, string>();
  win = Object.assign(new Target(), { setInterval, clearInterval });
  doc = Object.assign(new Target(), { visibilityState: "visible" });
  vi.stubGlobal("window", win);
  vi.stubGlobal("document", doc);
  vi.stubGlobal("sessionStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, v),
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("тихая перезагрузка", () => {
  it("узнаёт сбой подгрузки куска кода", () => {
    expect(
      isStaleChunkError(
        new TypeError("Failed to fetch dynamically imported module: /assets/tavern-x.js"),
      ),
    ).toBe(true);
    expect(isStaleChunkError(new Error("Importing a module script failed."))).toBe(true);
    expect(isStaleChunkError(new Error("Cannot read properties of undefined"))).toBe(false);
  });

  it("из-за куска кода — один раз в 30 с, без петли", () => {
    expect(reloadForStaleChunk()).toBe(true);
    expect(reloadForStaleChunk()).toBe(false);
    vi.advanceTimersByTime(31_000);
    expect(reloadForStaleChunk()).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it("новая версия — пока игрок жмёт, не трогаем; полторы минуты тишины — обновляемся", () => {
    scheduleQuietUpdate();
    for (let i = 0; i < 12; i++) {
      vi.advanceTimersByTime(10_000);
      win.fire("pointerdown");
    }
    expect(reload).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100_000);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("герой идёт маршрутом без касаний — тоже не трогаем", () => {
    scheduleQuietUpdate();
    for (let i = 0; i < 20; i++) {
      vi.advanceTimersByTime(10_000);
      noteActivity();
    }
    expect(reload).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100_000);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("новая версия — свернул игру, обновляемся сразу; второй раз не раньше чем через 10 мин", () => {
    const stop = scheduleQuietUpdate();
    doc.visibilityState = "hidden";
    doc.fire("visibilitychange");
    expect(reload).toHaveBeenCalledTimes(1);
    stop();
    scheduleQuietUpdate();
    doc.fire("visibilitychange");
    vi.advanceTimersByTime(200_000);
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
