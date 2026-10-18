// Язык по умолчанию и память устройства.
//
// Правила владельца (22.09.2026): приложение открывается на английском; русский
// — только если устройство прямо про это сказало; выбор игрока не сбрасывается
// ни при каких сменах умолчания.
//
// Окружение тестов — node, браузера нет: подкладываем минимальные window,
// navigator и localStorage, ровно те поля, которые читает стор.
import { describe, expect, it, afterEach, vi } from "vitest";

type Store = typeof import("./store");

function fakeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}

/** Свежий модуль стора в поддельном браузере. */
async function boot(opts: { device?: string; tg?: string; stored?: string }): Promise<{
  store: Store;
  storage: ReturnType<typeof fakeStorage>;
}> {
  const storage = fakeStorage();
  if (opts.stored) storage.setItem("lang", opts.stored);
  const g = globalThis as Record<string, unknown>;
  g.window = opts.tg
    ? { Telegram: { WebApp: { initDataUnsafe: { user: { language_code: opts.tg } } } } }
    : {};
  // navigator в node — свойство только на чтение, подменяем через описание.
  Object.defineProperty(g, "navigator", {
    value: { language: opts.device ?? "" },
    configurable: true,
    writable: true,
  });
  g.localStorage = storage;
  // Стор читает окружение на уровне модуля — каждому случаю нужен свежий.
  vi.resetModules();
  const store = (await import("./store")) as Store;
  return { store, storage };
}

afterEach(() => {
  const g = globalThis as Record<string, unknown>;
  delete g.window;
  delete g.navigator;
  delete g.localStorage;
});

describe("язык по умолчанию", () => {
  it("на старте английский — тот же, что рендерит сервер", async () => {
    const { store } = await boot({ device: "ru-RU" });
    expect(store.useAppStore.getState().lang).toBe("en");
  });

  it("русское устройство получает русский", async () => {
    const { store } = await boot({ device: "ru-RU" });
    expect(store.resolveClientLang()).toBe("ru");
  });

  it.each(["en-US", "de-DE", "pt-BR", ""])("устройство «%s» — английский", async (device) => {
    const { store } = await boot({ device });
    expect(store.resolveClientLang()).toBe("en");
  });

  it("Telegram на русском важнее языка браузера", async () => {
    const { store } = await boot({ device: "en-US", tg: "ru" });
    expect(store.resolveClientLang()).toBe("ru");
  });
});

describe("память устройства", () => {
  it("выбор игрока сильнее устройства", async () => {
    const { store } = await boot({ device: "en-US", stored: "ru" });
    expect(store.resolveClientLang()).toBe("ru");
    expect(store.hasExplicitLang()).toBe(true);
  });

  it("язык закрепляется при запуске, даже если совпал с умолчанием", async () => {
    // Иначе смена умолчания молча переобувает игрока: в хранилище пусто —
    // значит «выбора не было» — значит новый умолчательный язык.
    const { store, storage } = await boot({ device: "ru-RU" });
    expect(storage.getItem("lang")).toBeNull();
    store.applyClientLang();
    expect(storage.getItem("lang")).toBe("ru");
    expect(store.useAppStore.getState().lang).toBe("ru");
  });

  it("закреплённый английский переживает запуск на русском устройстве", async () => {
    const { store, storage } = await boot({ device: "ru-RU", stored: "en" });
    store.applyClientLang();
    expect(store.useAppStore.getState().lang).toBe("en");
    expect(storage.getItem("lang")).toBe("en");
  });
});
