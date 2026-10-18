// Кто открывает карту мира: только с предметом «Карта» у выбранного героя;
// «Вся карта» — с предметом и только админу. Обхода без предмета нет никому.
import { describe, expect, it } from "vitest";
import { canOpenWorldMap, hasMapIn, worldMapAccess, type WorldMapWho } from "./worldMapAccess";

const who = (over: Partial<WorldMapWho>): WorldMapWho => ({
  admin: false,
  hasMapItem: false,
  ...over,
});

describe("worldMapAccess", () => {
  it("без предмета — ничего: ни игроку, ни админу, ни владельцу", () => {
    for (const w of [who({}), who({ admin: true }), who({ owner: true, admin: true })]) {
      const a = worldMapAccess(w);
      expect(a).toEqual({ seen: false, all: false });
      expect(canOpenWorldMap(a, "seen")).toBe(false);
      expect(canOpenWorldMap(a, "all")).toBe(false);
    }
  });

  it("игроку с предметом — только разведанное", () => {
    const a = worldMapAccess(who({ hasMapItem: true }));
    expect(canOpenWorldMap(a, "seen")).toBe(true);
    expect(canOpenWorldMap(a, "all")).toBe(false);
  });

  it("админу с предметом — и вся карта", () => {
    expect(worldMapAccess(who({ admin: true, hasMapItem: true }))).toEqual({
      seen: true,
      all: true,
    });
  });

  it("владелец — старшая ступень админа: с предметом и вся карта", () => {
    // Его кошелька может не быть в ADMIN_WALLETS — признак «владелец» сам по себе.
    expect(worldMapAccess(who({ owner: true, hasMapItem: true }))).toEqual({
      seen: true,
      all: true,
    });
  });
});

describe("hasMapIn", () => {
  const stack = (over: { map?: boolean; count?: number }) => ({ count: 1, ...over });

  it("целая штука с галочкой «Карта» — есть карта", () => {
    expect(hasMapIn([stack({}), stack({ map: true })])).toBe(true);
    expect(hasMapIn([stack({ map: true, count: 3 })])).toBe(true);
  });

  it("нет галочки, меньше штуки, пусто или старый ответ — карты нет", () => {
    expect(hasMapIn([stack({ map: false })])).toBe(false);
    expect(hasMapIn([stack({ map: true, count: 0.5 })])).toBe(false);
    expect(hasMapIn([stack({ map: true, count: 0 })])).toBe(false);
    expect(hasMapIn([stack({})])).toBe(false);
    expect(hasMapIn([])).toBe(false);
    expect(hasMapIn(undefined)).toBe(false);
    expect(hasMapIn(null)).toBe(false);
  });
});
