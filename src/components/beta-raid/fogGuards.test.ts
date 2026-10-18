import { describe, expect, it } from "vitest";
import { fogOfMap, serverForgot } from "./fogGuards";

describe("маска тумана при смене этажа", () => {
  const seen = { mask: {} };

  it("маска своей карты — годится, даже если сетка пересоздана правкой", () => {
    expect(fogOfMap(seen, "alpha", "alpha")).toBe(seen);
  });
  it("карта уже новая (переход порталом), маска прежняя — чужая", () => {
    expect(fogOfMap(seen, "alpha", "maze")).toBeNull();
  });
  it("нет маски или карты — нечего", () => {
    expect(fogOfMap(null, "alpha", "alpha")).toBeNull();
    expect(fogOfMap(seen, "alpha", null)).toBeNull();
    expect(fogOfMap(seen, null, "alpha")).toBeNull();
  });
});

describe("сервер забыл этаж", () => {
  it("на сверке ноль, а устройство отправляло — сбросить память устройства", () => {
    expect(serverForgot("2026-10-07T12:00:00Z", 0, 27449)).toBe(true);
  });
  it("полный список (без since), ничего не отправлено или подсчёт не удался — не трогаем", () => {
    expect(serverForgot(undefined, 0, 100)).toBe(false);
    expect(serverForgot("t", 0, 0)).toBe(false);
    expect(serverForgot("t", null, 100)).toBe(false);
    expect(serverForgot("t", 5, 100)).toBe(false);
  });
});
