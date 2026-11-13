// Окружение лесопилки и каменоломни (владелец, 25.10.2026, §8.80): n соседей из 6
// → n/3 ставки уровня; как SQL raid_mine_nature_mult / raid_mine_v2_std.
import { describe, expect, it } from "vitest";
import { mineNatureMult, minePendingV2, mineStdYield, natureNOf, natureNText } from "./mineV2";
import { mineV2PendingArgs } from "./mineV2Row";

describe("множитель окружения", () => {
  it("0 → 0 %, 3 → 100 %, 6 → 200 %; дерево и камень", () => {
    expect(mineNatureMult("wood", false, 0)).toBe(0);
    expect(mineNatureMult("wood", false, 2)).toBeCloseTo(2 / 3, 12);
    expect(mineNatureMult("stone", false, "3")).toBe(1);
    expect(mineNatureMult("stone", false, 6)).toBe(2);
  });

  it("нет числа, мусор, золото, алмазы и остров — ×1", () => {
    for (const raw of [null, undefined, "", "7", "6.5", "-1", "1e1", "abc"]) {
      expect(mineNatureMult("wood", false, raw), String(raw)).toBe(1);
    }
    expect(mineNatureMult("gold", false, 0)).toBe(1);
    expect(mineNatureMult("diamonds", false, 6)).toBe(1);
    expect(mineNatureMult("wood", true, 0)).toBe(1);
    expect(natureNOf("")).toBeNull();
    expect(natureNOf(4)).toBe(4);
  });

  it("доли (09.11.2026): дерево у двух шахт — по половинке, у трёх — по трети", () => {
    expect(natureNOf("2.5")).toBe(2.5);
    expect(natureNOf(1.3333)).toBe(1.3333);
    expect(mineNatureMult("stone", false, "1.3333")).toBeCloseTo(0.4444, 4);
    expect(mineNatureMult("wood", false, 0.5)).toBeCloseTo(1 / 6, 12);
    expect(natureNText(1.3333, "ru")).toBe("1,3");
    expect(natureNText(2.5, "en")).toBe("2.5");
    expect(natureNText(6, "ru")).toBe("6");
  });

  it("ставка: уровень × окружение; остров — своя", () => {
    expect(mineStdYield("wood", false, 2, 6)).toBe(40);
    expect(mineStdYield("stone", false, 4, 0)).toBe(0);
    expect(mineStdYield("wood", false, 1)).toBe(10);
    expect(mineStdYield("wood", true, 1, 0)).toBe(1);
  });

  it("накопленное: 3 часа при 2 деревьях из 6 на уровне 1 — 20", () => {
    const at = Date.parse("2026-10-25T00:00:00Z");
    const n = minePendingV2(
      {
        resource: "wood",
        mode: "base",
        accrueFrom: new Date(at).toISOString(),
        claimedHours: 0,
        breakAt: at + 100 * 3_600_000,
        natureN: 2,
      },
      at + 3 * 3_600_000 + 1,
    );
    expect(n).toBe(20);
  });

  it("ноль из базы — настоящий: лесопилка без деревьев не копит", () => {
    const a = mineV2PendingArgs({
      resource: "wood",
      mode: "base",
      accrueFromMs: 0,
      breakAt: 10 * 3_600_000,
      std: 0,
    });
    expect(a.yield).toBe(0);
    // Нет числа из базы — по виду, как раньше.
    expect(
      mineV2PendingArgs({ resource: "wood", mode: "base", accrueFromMs: 0, breakAt: 3_600_000 })
        .yield,
    ).toBe(10);
  });
});
