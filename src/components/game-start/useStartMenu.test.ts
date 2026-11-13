// Меню входа решается один раз на загрузку страницы и только для новичка:
// вернувшийся игрок, упавший запрос и потолок ожидания закрывают меню насовсем —
// оно не встаёт посреди игры, даже если запрос потом ответит или экран
// смонтируется заново. Хук гоняем на маленьком «React» (окружение тестов — node, без DOM).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Effect = () => void | (() => void);
const R = vi.hoisted(() => {
  let slots: unknown[] = [];
  let deps: Array<unknown[] | undefined> = [];
  let cleanups: Array<void | (() => void)> = [];
  let effects: Array<[Effect, unknown[] | undefined]> = [];
  let i = 0;
  const same = (a?: unknown[], b?: unknown[]) =>
    !!a && !!b && a.length === b.length && a.every((v, k) => Object.is(v, b[k]));
  return {
    /** Размонтировать: новый экземпляр компонента. */
    unmount() {
      cleanups.forEach((c) => c?.());
      slots = [];
      deps = [];
      cleanups = [];
    },
    render<T>(fn: () => T): T {
      i = 0;
      effects = [];
      const out = fn();
      effects.forEach(([e, d], j) => {
        if (same(d, deps[j])) return;
        cleanups[j]?.();
        cleanups[j] = e();
        deps[j] = d;
      });
      return out;
    },
    useState(init: unknown) {
      const k = i++;
      if (!(k in slots)) slots[k] = typeof init === "function" ? (init as () => unknown)() : init;
      return [slots[k], (v: unknown) => void (slots[k] = v)];
    },
    useCallback(fn: unknown) {
      const k = i++;
      if (!(k in slots)) slots[k] = fn;
      return slots[k];
    },
    useEffect(e: Effect, d?: unknown[]) {
      effects.push([e, d]);
    },
  };
});
vi.mock("react", () => ({
  useState: R.useState,
  useCallback: R.useCallback,
  useEffect: R.useEffect,
}));

const S = vi.hoisted(() => ({
  status: { isError: false } as { data?: { fresh: boolean; options: unknown[] }; isError: boolean },
  enabled: [] as boolean[],
}));
vi.mock("./useGameStart", () => ({
  useGameStartStatus: (enabled: boolean) => {
    S.enabled.push(enabled);
    return S.status;
  },
}));

const PLAYING = { data: { fresh: false, options: [] }, isError: false };
const FRESH = { data: { fresh: true, options: [{ id: "hero_bee" }] }, isError: false };

/** Полная загрузка страницы: модуль заново, флаг «меню закрыто» сброшен. */
async function pageLoad() {
  vi.resetModules();
  R.unmount();
  S.enabled = [];
  return import("./useStartMenu");
}

beforeEach(() => vi.stubGlobal("window", { location: { search: "" } }));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("useStartMenu", () => {
  it("п.1: запрос упал — меню закрыто насовсем, ответ позже и новый монтаж его не вернут", async () => {
    const { useStartMenu } = await pageLoad();
    S.status = { isError: true };
    expect(R.render(() => useStartMenu(true, "w", false)).mode).toBe("skip");
    // Сеть вернулась, запрос ответил — меню посреди игры не встаёт и запрос не включается.
    S.status = PLAYING;
    expect(R.render(() => useStartMenu(true, "w", false)).mode).toBe("skip");
    expect(S.enabled.at(-1)).toBe(false);
    R.unmount();
    expect(R.render(() => useStartMenu(true, "w", false)).mode).toBe("skip");
    expect(S.enabled.at(-1)).toBe(false);
  });

  it("вернувшемуся игроку меню не показывается — и не вернётся при новом монтаже", async () => {
    const { useStartMenu } = await pageLoad();
    S.status = PLAYING;
    expect(R.render(() => useStartMenu(true, "w", false)).mode).toBe("skip");
    expect(R.render(() => useStartMenu(true, "w", true)).mode).toBe("skip");
    expect(S.enabled.at(-1)).toBe(false);
    R.unmount();
    expect(R.render(() => useStartMenu(true, "w", true)).mode).toBe("skip");
  });

  it("новичку — меню, после «Начать игру» больше нет", async () => {
    const { useStartMenu } = await pageLoad();
    S.status = FRESH;
    const m = R.render(() => useStartMenu(true, "w", false));
    expect(m.mode).toBe("new");
    expect(m.options).toEqual([{ id: "hero_bee" }]);
    m.close();
    R.unmount();
    expect(R.render(() => useStartMenu(true, "w", false)).mode).toBe("skip");
  });

  it("гость меню не решает: войдёт — увидит", async () => {
    const { useStartMenu } = await pageLoad();
    S.status = { isError: true };
    expect(R.render(() => useStartMenu(false, null, false)).mode).toBe("skip");
    S.status = FRESH;
    expect(R.render(() => useStartMenu(true, "w", false)).mode).toBe("new");
  });

  it("ссылка на аукцион из бота: новичку меню остаётся, вернувшемуся его нет", async () => {
    window.location.search = "?auction=1";
    const { useStartMenu } = await pageLoad();
    S.status = FRESH;
    expect(R.render(() => useStartMenu(true, "w", false)).mode).toBe("new");
    const again = await pageLoad();
    S.status = PLAYING;
    expect(R.render(() => again.useStartMenu(true, "w", false)).mode).toBe("skip");
  });

  it("п.5: игра готова, а ответа нет — через потолок входим без меню насовсем", async () => {
    vi.useFakeTimers();
    const { useStartMenu, START_MENU_WAIT_MS } = await pageLoad();
    S.status = { isError: false };
    expect(R.render(() => useStartMenu(true, "w", false)).mode).toBe("pending");
    vi.advanceTimersByTime(START_MENU_WAIT_MS * 2); // игра ещё грузится — ждём сколько надо
    expect(R.render(() => useStartMenu(true, "w", true)).mode).toBe("pending");
    vi.advanceTimersByTime(START_MENU_WAIT_MS - 1);
    expect(R.render(() => useStartMenu(true, "w", true)).mode).toBe("pending");
    vi.advanceTimersByTime(1);
    S.status = PLAYING; // ответ опоздал
    expect(R.render(() => useStartMenu(true, "w", true)).mode).toBe("skip");
  });

  it("п.5: ответ новичку успел до потолка — меню стоит, таймер его не снимает", async () => {
    vi.useFakeTimers();
    const { useStartMenu, START_MENU_WAIT_MS } = await pageLoad();
    S.status = { isError: false };
    R.render(() => useStartMenu(true, "w", true));
    vi.advanceTimersByTime(START_MENU_WAIT_MS / 2);
    S.status = FRESH;
    expect(R.render(() => useStartMenu(true, "w", true)).mode).toBe("new");
    vi.advanceTimersByTime(START_MENU_WAIT_MS * 2);
    expect(R.render(() => useStartMenu(true, "w", true)).mode).toBe("new");
  });
});
