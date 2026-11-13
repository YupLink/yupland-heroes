// Незнакомый вид постройки: тихая перезагрузка, намерение «открыть это окно»,
// защита от петли и срок жизни намерения (unknownExtra).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const reload = vi.fn();
vi.mock("@/lib/versionCheck", () => ({ forceReloadBustCache: () => reload() }));
const { isKnownExtraKind, reloadIfUnknownKind, takeReopenIntent, REOPEN_TTL_MS } =
  await import("./unknownExtra");

let store: Map<string, string>;
const at = { mapId: "map-1", q: 3, r: -2 };
const intent = () => store.get("reopen-building");

beforeEach(() => {
  vi.useFakeTimers();
  reload.mockClear();
  store = new Map();
  vi.stubGlobal("window", {});
  vi.stubGlobal("sessionStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, v),
    removeItem: (k: string) => store.delete(k),
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("незнакомый вид постройки", () => {
  it("перезагрузка пошла и окно запомнено", () => {
    expect(reloadIfUnknownKind("brand_new", at)).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(JSON.parse(intent() ?? "null")).toMatchObject(at);
  });

  it("знакомый вид — ни перезагрузки, ни намерения", () => {
    for (const kind of ["watchtower", "enchant", "casino", "market", "town_hall", undefined]) {
      expect(reloadIfUnknownKind(kind, at)).toBe(false);
    }
    expect(isKnownExtraKind("watchtower")).toBe(true);
    expect(isKnownExtraKind("brand_new")).toBe(false);
    expect(reload).not.toHaveBeenCalled();
    expect(intent()).toBeUndefined();
  });

  it("петля: не чаще раза в 60 с, отказ стирает намерение", () => {
    expect(reloadIfUnknownKind("brand_new", at)).toBe(true);
    expect(reloadIfUnknownKind("brand_new", at)).toBe(false);
    expect(intent()).toBeUndefined();
    vi.advanceTimersByTime(59_000);
    expect(reloadIfUnknownKind("brand_new", at)).toBe(false);
    vi.advanceTimersByTime(2_000);
    expect(reloadIfUnknownKind("brand_new", at)).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it("без карты в кэше — перезагрузка без намерения", () => {
    expect(reloadIfUnknownKind("brand_new", { ...at, mapId: null })).toBe(true);
    expect(intent()).toBeUndefined();
  });
});

describe("окно после перезагрузки", () => {
  it("свежее и та же карта — открыть один раз", () => {
    reloadIfUnknownKind("brand_new", at);
    vi.advanceTimersByTime(30_000);
    expect(takeReopenIntent("map-1")).toEqual({ q: 3, r: -2 });
    expect(intent()).toBeUndefined();
    expect(takeReopenIntent("map-1")).toBeNull();
  });

  it("протухло (больше 2 мин) — не открываем и стираем", () => {
    reloadIfUnknownKind("brand_new", at);
    vi.advanceTimersByTime(REOPEN_TTL_MS + 1_000);
    expect(takeReopenIntent("map-1")).toBeNull();
    expect(intent()).toBeUndefined();
  });

  it("другая карта — не открываем и стираем", () => {
    reloadIfUnknownKind("brand_new", at);
    expect(takeReopenIntent("map-2")).toBeNull();
    expect(intent()).toBeUndefined();
  });

  it("мусор в хранилище — не открываем и стираем", () => {
    store.set("reopen-building", "{oops");
    expect(takeReopenIntent("map-1")).toBeNull();
    expect(intent()).toBeUndefined();
  });
});
