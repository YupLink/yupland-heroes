// Чем объяснить отказ по тапу на судно/воду и что при этом перечитать.
import { describe, expect, it, vi } from "vitest";
import type { QueryClient } from "@tanstack/react-query";
import { farShipRefusalKey, isWreckOnly, refreshBerths, waterRefusalKey } from "./shipTapRefusal";

describe("isWreckOnly", () => {
  it("только разбитые борта — к ним подходят чинить; есть свободный или занятый — нет", () => {
    expect(isWreckOnly({ free: 0, busy: 0, broken: 1 })).toBe(true);
    expect(isWreckOnly({ free: 1, busy: 0, broken: 1 })).toBe(false);
    expect(isWreckOnly({ free: 0, busy: 1, broken: 1 })).toBe(false);
    expect(isWreckOnly({ free: 0, busy: 0, broken: 0 })).toBe(false);
  });
});

describe("farShipRefusalKey", () => {
  it("свободное судно, а пути нет — «не добраться посуху»", () => {
    expect(farShipRefusalKey({ free: 1, busy: 0, broken: 0 })).toBe("braid.ship_unreachable");
  });

  it("разбитый борт без экипажа — «разбит, доплыви на другом», а не «занят»", () => {
    expect(farShipRefusalKey({ free: 0, busy: 0, broken: 1 })).toBe("braid.ship_wreck_far");
  });

  it("занятый борт — «занят другим»", () => {
    expect(farShipRefusalKey({ free: 0, busy: 1, broken: 0 })).toBe("braid.ship_busy");
  });
});

describe("waterRefusalKey", () => {
  it("где-то на карте есть свободное судно — «не добраться», иначе «нужен корабль»", () => {
    expect(waterRefusalKey(new Map([["1,1", { free: 1 }]]))).toBe("braid.ship_unreachable");
    expect(waterRefusalKey(new Map([["1,1", { free: 0 }]]))).toBe("braid.need_ship");
    expect(waterRefusalKey(new Map())).toBe("braid.need_ship");
  });
});

describe("refreshBerths", () => {
  it("сбрасывает причалы и позицию — следующий тап идёт по свежему кэшу без F5", () => {
    const invalidateQueries = vi.fn();
    refreshBerths({ invalidateQueries } as unknown as QueryClient);
    expect(invalidateQueries.mock.calls.map((c) => c[0].queryKey)).toEqual([
      ["beta-raid-ships"],
      ["beta-raid-state"],
    ]);
  });
});
