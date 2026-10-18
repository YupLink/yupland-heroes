import { describe, expect, it } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import {
  CHEST_GUARD_KEY,
  CHEST_NET_KEY,
  CHEST_PICKUP_KEY,
  CHESTS_KEY,
  HARVEST_LIVE_KEY,
  chestLiveKeys,
  invalidateChests,
} from "@/components/beta-raid/chest/chestLive";

const withChest = (): QueryClient => {
  const qc = new QueryClient();
  qc.setQueryData(CHESTS_KEY, { chests: { "3,4": { mine: false, image: null, name: "x" } } });
  return qc;
};

describe("chestLiveKeys", () => {
  it("задет известный сундук (захват, «Забрать сундук») — слой и «Добыча»", () => {
    expect(chestLiveKeys(withChest(), ["3,4"])).toEqual([
      CHEST_NET_KEY,
      CHEST_GUARD_KEY,
      CHEST_PICKUP_KEY,
      CHESTS_KEY[0],
      HARVEST_LIVE_KEY,
    ]);
  });
  it("клетки не названы — слой перечитываем, «Добычу» не трогаем", () => {
    const keys = chestLiveKeys(withChest(), []);
    expect(keys).toContain(CHESTS_KEY[0]);
    expect(keys).not.toContain(HARVEST_LIVE_KEY);
  });
  it("чужая клетка при известной карте — только окна", () => {
    const qc = withChest();
    qc.setQueryData(["beta-raid-map"], { packed: null });
    expect(chestLiveKeys(qc, ["9,9"])).not.toContain(HARVEST_LIVE_KEY);
  });
});

describe("invalidateChests", () => {
  it("гасит слой карты и окна сундука", () => {
    const qc = withChest();
    qc.setQueryData([CHEST_PICKUP_KEY, 3, 4], { last: true });
    invalidateChests(qc);
    expect(qc.getQueryState([CHEST_PICKUP_KEY, 3, 4])?.isInvalidated).toBe(true);
    expect(qc.getQueryState(CHESTS_KEY)?.isInvalidated).toBe(true);
  });
});
