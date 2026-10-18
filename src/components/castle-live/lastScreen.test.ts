// Последний экран: после перезагрузки — туда, где игрок был.
import { beforeEach, describe, expect, it } from "vitest";
import { readLastScreen, startScreen, writeLastScreen } from "./lastScreen";

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  (globalThis as { window?: unknown }).window = {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    },
  };
});

describe("startScreen", () => {
  it("был на карте — на карте, даже стоя у замка", () => {
    expect(startScreen("raid", true)).toBe("raid");
    expect(startScreen("raid", false)).toBe("raid");
  });

  it("был в замке — в замок, если герой у замка; ушёл далеко — в мир", () => {
    expect(startScreen("castle", true)).toBe("castle");
    expect(startScreen("castle", false)).toBe("raid");
  });

  it("памяти нет — как раньше: у замка замок, иначе мир", () => {
    expect(startScreen(null, true)).toBe("castle");
    expect(startScreen(null, false)).toBe("raid");
  });
});

describe("память на устройстве", () => {
  it("своя у каждого кошелька", () => {
    writeLastScreen("a.near", "raid");
    writeLastScreen("b.near", "castle");
    expect(readLastScreen("a.near")).toBe("raid");
    expect(readLastScreen("b.near")).toBe("castle");
    expect(readLastScreen("c.near")).toBeNull();
    expect(readLastScreen(null)).toBeNull();
  });

  it("мусор в хранилище — как будто памяти нет", () => {
    store.set("gd-last-screen:a.near", "кухня");
    expect(readLastScreen("a.near")).toBeNull();
  });
});
