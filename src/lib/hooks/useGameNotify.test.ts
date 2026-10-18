// «Уведомления в игре» — настройка на устройстве. С 08.10.2026 по умолчанию
// ВЫКЛЮЧЕНО (владелец: «очень надоедают»), включает игрок сам; никакая беда с
// хранилищем (нет window, нет localStorage, исключение, запись не прошла) не
// роняет экран и не включает уведомления молча.
//
// Окружение тестов — node: window с localStorage подкладываем руками, модуль
// берём свежий на каждый случай — невыписанный выбор он держит в памяти.
import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

type Mod = typeof import("./useGameNotify");

function fakeStorage(init: Record<string, string> = {}, failWrite = false) {
  const map = new Map(Object.entries(init));
  const write = (fn: () => void) => {
    if (failWrite) throw new Error("QuotaExceededError");
    fn();
  };
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => write(() => map.set(k, v)),
    removeItem: (k: string) => write(() => map.delete(k)),
  };
}

/** Свежий модуль в поддельном окне; undefined — окна нет вовсе (сервер). */
async function boot(win?: object): Promise<Mod> {
  const g = globalThis as Record<string, unknown>;
  if (win) g.window = win;
  else delete g.window;
  vi.resetModules();
  return import("./useGameNotify");
}

afterEach(() => {
  delete (globalThis as Record<string, unknown>).window;
});

describe("readGameNotify: по умолчанию выключено", () => {
  it("окна нет (сервер) — выключено", async () => {
    const m = await boot();
    expect(m.readGameNotify()).toBe(false);
  });

  it("в окне нет localStorage — выключено", async () => {
    const m = await boot({});
    expect(m.readGameNotify()).toBe(false);
  });

  it("доступ к localStorage бросает исключение — выключено", async () => {
    const m = await boot({
      get localStorage(): Storage {
        throw new Error("SecurityError");
      },
    });
    expect(m.readGameNotify()).toBe(false);
  });

  it("хранилище пустое или с чужим значением — выключено", async () => {
    const m = await boot({ localStorage: fakeStorage() });
    expect(m.readGameNotify()).toBe(false);
    const n = await boot({ localStorage: fakeStorage({ [m.GAME_NOTIFY_KEY]: "off" }) });
    expect(n.readGameNotify()).toBe(false);
  });

  it("включено только явным «on»", async () => {
    const m = await boot({ localStorage: fakeStorage({ "game-info-toasts": "on" }) });
    expect(m.readGameNotify()).toBe(true);
  });
});

describe("setGameNotify", () => {
  it("включение пишет «on», выключение стирает ключ", async () => {
    const storage = fakeStorage();
    const m = await boot({ localStorage: storage });
    m.setGameNotify(true);
    expect(storage.map.get(m.GAME_NOTIFY_KEY)).toBe("on");
    expect(m.readGameNotify()).toBe(true);
    m.setGameNotify(false);
    expect(storage.map.has(m.GAME_NOTIFY_KEY)).toBe(false);
    expect(m.readGameNotify()).toBe(false);
  });

  it("запись не прошла — выбор держится в памяти, а не откатывается", async () => {
    const m = await boot({ localStorage: fakeStorage({}, true) });
    m.setGameNotify(false);
    expect(m.readGameNotify()).toBe(false);
    m.setGameNotify(true);
    expect(m.readGameNotify()).toBe(true);
  });

  it("без хранилища выключатель всё равно работает до перезагрузки", async () => {
    const m = await boot({});
    m.setGameNotify(true);
    expect(m.readGameNotify()).toBe(true);
  });

  it("подписчики узнают о каждом переключении, отписка работает", async () => {
    const m = await boot({ localStorage: fakeStorage() });
    const seen: boolean[] = [];
    const off = m.subscribeGameNotify(() => seen.push(m.readGameNotify()));
    m.setGameNotify(true);
    m.setGameNotify(false);
    off();
    m.setGameNotify(true);
    expect(seen).toEqual([true, false]);
  });
});

describe("useGameNotify", () => {
  it("на сервере хук отдаёт «выключено», хранилище не читает", async () => {
    const m = await boot({ localStorage: fakeStorage({ "game-info-toasts": "on" }) });
    const Probe = () => createElement("i", null, String(m.useGameNotify()[0]));
    expect(renderToStaticMarkup(createElement(Probe))).toBe("<i>false</i>");
  });
});
