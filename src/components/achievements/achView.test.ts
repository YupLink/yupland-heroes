// Карточка ачивки: взятая редкость, полоска до следующей, что даёт и шесть
// порогов с наградами (числа владельца, 17.10).
import { describe, expect, it } from "vitest";
import { achTrackView } from "./achView";

describe("achTrackView", () => {
  it("лестница из шести редкостей: порог, награда, взятые отмечены", () => {
    const v = achTrackView("lumber", 250);
    expect(v.rarity).toBe("uncommon");
    expect(v.bonus).toBe(3);
    expect(v.stat).toBe("hp");
    expect(v.ladder.map((s) => s.target)).toEqual([60, 200, 500, 1500, 4000, 10000]);
    expect(v.ladder.map((s) => s.bonus)).toEqual([1, 3, 6, 9, 12, 24]);
    expect(v.ladder.map((s) => s.done)).toEqual([true, true, false, false, false, false]);
    expect([v.from, v.target, v.pct]).toEqual([200, 500, 17]);
  });

  it("ничего не взято и всё взято", () => {
    expect(achTrackView("hunter", 0)).toMatchObject({ rarity: null, bonus: 0, target: 30 });
    expect(achTrackView("fisher", 9999)).toMatchObject({
      rarity: "mythic",
      bonus: 24,
      target: null,
    });
  });
});
