// Выключатели видов меток карты мира: тап переключает, выбор помнится на
// устройстве, а битая или недоступная запись — значит «всё включено».
import { afterEach, describe, expect, it, vi } from "vitest";
import { WORLD_MARK_KINDS } from "@/lib/raid/worldMapCodec";
import {
  BUILDING_LAYERS,
  countMarks,
  loadHidden,
  parseHidden,
  saveHidden,
  toggleBuildings,
  toggleLayer,
  WORLD_LAYERS,
  type WorldLayer,
} from "./worldMapLayers";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("worldMapLayers", () => {
  it("выключаются объекты — каждый вид меток, замок, герой; местности в списке нет", () => {
    expect([...WORLD_LAYERS].sort()).toEqual([...WORLD_MARK_KINDS, "castle", "hero"].sort());
    expect(new Set(WORLD_LAYERS).size).toBe(WORLD_LAYERS.length);
    // Своё сверху, постройки — все виды, кроме клада, каждый своей строкой.
    expect(WORLD_LAYERS.slice(0, 3)).toEqual(["hero", "castle", "treasure"]);
    expect([...BUILDING_LAYERS].sort()).toEqual(
      WORLD_MARK_KINDS.filter((k) => k !== "treasure").sort(),
    );
  });

  it("«Все постройки»: прячет все виды построек и возвращает их; своё не трогает", () => {
    const start: ReadonlySet<WorldLayer> = new Set<WorldLayer>(["hero", "portal"]);
    const off = toggleBuildings(start, true);
    for (const k of BUILDING_LAYERS) expect(off.has(k)).toBe(true);
    expect(off.has("hero")).toBe(true);
    expect(off.has("treasure")).toBe(false);
    expect(off.has("castle")).toBe(false);
    const on = toggleBuildings(off, false);
    expect([...on]).toEqual(["hero"]);
    // Прежний набор не трогаем.
    expect([...start].sort()).toEqual(["hero", "portal"]);
  });

  it("счёт меток по видам — для строк легенды", () => {
    const c = countMarks([{ kind: "portal" }, { kind: "mine" }, { kind: "portal" }]);
    expect(c.get("portal")).toBe(2);
    expect(c.get("mine")).toBe(1);
    expect(c.get("field")).toBeUndefined();
  });

  it("тап прячет вид, повторный — возвращает; прежний набор не трогаем", () => {
    const none: ReadonlySet<WorldLayer> = new Set();
    const off = toggleLayer(none, "treasure");
    expect([...off]).toEqual(["treasure"]);
    expect(none.size).toBe(0);
    expect([...toggleLayer(off, "treasure")]).toEqual([]);
  });

  it("запись разбирается терпимо: мусор и незнакомые виды — мимо", () => {
    expect(parseHidden(null).size).toBe(0);
    expect(parseHidden("{").size).toBe(0);
    expect(parseHidden('{"mine":true}').size).toBe(0);
    expect([...parseHidden('["mine","boss",5,"hero"]')]).toEqual(["mine", "hero"]);
  });

  it("помнится на устройстве: записали — прочитали то же", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => store.set(k, v),
      },
    });
    saveHidden(new Set<WorldLayer>(["shop", "castle"]));
    expect([...loadHidden()].sort()).toEqual(["castle", "shop"]);
  });

  it("хранилище недоступно — всё включено и ничего не падает", () => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => {
          throw new Error("SecurityError");
        },
        setItem: () => {
          throw new Error("QuotaExceededError");
        },
      },
    });
    expect(loadHidden().size).toBe(0);
    expect(() => saveHidden(new Set<WorldLayer>(["mine"]))).not.toThrow();
  });
});
