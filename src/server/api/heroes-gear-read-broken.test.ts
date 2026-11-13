// Окно снаряжения при запущенной механике поломки (§8.63 п.3): сломанный виден
// в списке (с накладкой и неактивной кнопкой — это клиент), но стрелка «надеть
// лучшее» его не обещает — ровно как не наденет сама кнопка.
import { describe, expect, it, vi } from "vitest";
import type { LoadedGearPiece, LoadedHero } from "./beta-raid/hero-load";

vi.mock("@/server/db/mcpClient", () => ({ mcpExec: async () => [] }));

const { gearView } = await import("./heroes-gear-read");

const piece = (itemId: string, wear: number, statAmount: number): LoadedGearPiece => ({
  itemId,
  templateId: `t_${itemId}`,
  name: `Арт ${itemId}`,
  slot: "Голова",
  rarity: "common",
  imageUrl: null,
  statType: "attack",
  statAmount,
  wear,
});
const hero = {
  heroId: "h1",
  name: "Герой",
  imageUrl: null,
  race: null,
  spec: null,
  level: 1,
  rarity: "rare",
  skills: {},
  equipped: {},
  gear: [],
} as unknown as LoadedHero;
const all = [piece("broken", 100, 10), piece("whole", 0, 4)];

describe("стрелка «надеть лучшее» и сломанный", () => {
  it("механика запущена — обещает только целый", () => {
    const v = gearView(hero, all, {}, {}, true);
    const plain = gearView(hero, [piece("whole", 0, 4)], {}, {}, true);
    expect(v.bestGain).toBe(plain.bestGain);
    expect(v.bestGain).toBeGreaterThan(0);
  });

  it("не запущена — сломанный кандидат, как целый (прирост больше)", () => {
    const off = gearView(hero, all, {}, {}, false);
    const on = gearView(hero, all, {}, {}, true);
    expect(off.bestGain).toBeGreaterThan(on.bestGain);
    expect(gearView(hero, all, {}, {}).bestGain).toBe(off.bestGain);
  });

  it("сломанный остаётся в списке «что можно надеть» с прочностью 0", () => {
    const v = gearView(hero, all, {}, {}, true);
    const head = v.available["Голова"].map((x) => [x.itemId, x.durability]);
    expect(head).toEqual(
      expect.arrayContaining([
        ["broken", 0],
        ["whole", 100],
      ]),
    );
  });
});
