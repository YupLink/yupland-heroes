import { describe, expect, it } from "vitest";
import { BOOT_WATCHDOG } from "./bootWatchdog";

// Окно-подделка: таймеры по часам теста, файлы — список времён окончания загрузки.
function page(href = "https://service.yupland.io/chips") {
  let now = 0;
  const timers: Array<{ at: number; fn: () => void }> = [];
  const listeners: Record<string, (e: unknown) => void> = {};
  const store = new Map<string, string>();
  const loads: number[] = [];
  const replaced: string[] = [];
  const w = {
    __gdBooted: false,
    sessionStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    },
    performance: {
      now: () => now,
      getEntriesByType: () => loads.map((responseEnd) => ({ responseEnd })),
    },
    location: { href, replace: (u: string) => void replaced.push(u) },
    addEventListener: (type: string, fn: (e: unknown) => void) => void (listeners[type] = fn),
    setTimeout: (fn: () => void, ms: number) => void timers.push({ at: now + ms, fn }),
  };
  new Function("window", BOOT_WATCHDOG)(w);
  const advance = (ms: number) => {
    const end = now + ms;
    for (;;) {
      timers.sort((a, b) => a.at - b.at);
      const t = timers[0];
      if (!t || t.at > end) break;
      timers.shift();
      now = t.at;
      t.fn();
    }
    now = end;
  };
  const reject = (message: string) =>
    listeners.unhandledrejection?.({ reason: new Error(message) });
  return { w, advance, reject, loads, replaced, store };
}

describe("сторож запуска", () => {
  it("главный файл не загрузился (Safari) — тихая перезагрузка с новым _v", () => {
    const p = page("https://service.yupland.io/chips?_v=1793878587383");
    p.reject("Importing a module script failed.");
    p.advance(1000);
    expect(p.replaced).toEqual([]);
    p.advance(600);
    expect(p.replaced).toHaveLength(1);
    expect(p.replaced[0]).toMatch(/^https:\/\/service\.yupland\.io\/chips\?_v=\d+$/);
    expect(p.replaced[0]).not.toContain("1793878587383");
  });

  it("Chrome и «Load failed» — тоже", () => {
    for (const m of [
      "Failed to fetch dynamically imported module: /assets/index-x.js",
      "Load failed",
    ]) {
      const p = page();
      p.reject(m);
      p.advance(2000);
      expect(p.replaced).toHaveLength(1);
    }
  });

  it("не больше двух попыток за вкладку", () => {
    const p = page();
    p.store.set("gd-boot-retry", "2");
    p.reject("Importing a module script failed.");
    p.advance(200_000);
    expect(p.replaced).toEqual([]);
  });

  it("игра поднялась — не трогает ни ошибки, ни таймер", () => {
    const p = page();
    p.w.__gdBooted = true;
    p.reject("Importing a module script failed.");
    p.advance(200_000);
    expect(p.replaced).toEqual([]);
  });

  it("чужая ошибка до запуска — не повод перезагружаться", () => {
    const p = page();
    p.reject("Cannot read properties of undefined");
    p.advance(5000);
    expect(p.replaced).toEqual([]);
  });

  it("загрузка встала (30 с без файлов) — перезагрузка на 90-й секунде", () => {
    const p = page();
    p.loads.push(2000, 9000);
    p.advance(89_000);
    expect(p.replaced).toEqual([]);
    p.advance(2000);
    expect(p.replaced).toHaveLength(1);
  });

  it("медленная, но идущая загрузка — ждёт, не перезагружает", () => {
    const p = page();
    for (let t = 5000; t <= 180_000; t += 15_000) p.loads.push(t);
    p.advance(185_000);
    expect(p.replaced).toEqual([]);
  });
});
