// Окно снаряжения: у каждого артефакта своя прочность. Одинаковые шаблоны с
// разным износом — разные строки (своя полоса, надевается ровно увиденный).
import { describe, expect, it } from "vitest";
import { buildOptions, itemView } from "./heroes-gear-items";
import type { LoadedGearPiece } from "./beta-raid/hero-load";

const piece = (itemId: string, wear: number): LoadedGearPiece => ({
  itemId,
  templateId: "tpl_sword",
  name: "Меч",
  slot: "Правая рука",
  rarity: "rare",
  imageUrl: null,
  statType: "attack",
  statAmount: 3,
  wear,
});
const ctx = { race: null, spec: null };

describe("прочность в окне снаряжения", () => {
  it("строка предмета несёт прочность: снято 40 — 60 %, сломанный — 0", () => {
    expect(itemView(piece("a", 40), ctx, ["a"]).durability).toBe(60);
    expect(itemView(piece("b", 100), ctx, ["b"]).durability).toBe(0);
    expect(itemView({ ...piece("c", 0), wear: undefined }, ctx, ["c"]).durability).toBe(100);
  });

  it("сломанный в разборе — как целый: штрафа нет до ремонта (владелец, 23.10)", () => {
    const ok = itemView(piece("a", 99), ctx, ["a"]);
    const broken = itemView(piece("b", 100), ctx, ["b"]);
    expect(ok.total).toBe(3);
    expect(ok.parts.every((x) => x.applied)).toBe(true);
    expect(broken.durability).toBe(0);
    expect(broken.total).toBe(3);
    expect(broken.parts.length).toBeGreaterThan(0);
    expect(broken.parts.every((x) => x.applied)).toBe(true);
  });

  it("одинаковый износ схлопывается, разный — отдельные строки; надетое не в списке", () => {
    const all = [piece("a", 0), piece("b", 0), piece("c", 40), piece("d", 100), piece("e", 0)];
    const { available } = buildOptions(all, new Set(["e"]), ctx);
    const rows = available["Правая рука"].map((v) => ({ ids: v.itemIds, d: v.durability }));
    expect(rows).toEqual([
      { ids: ["a", "b"], d: 100 },
      { ids: ["c"], d: 60 },
      { ids: ["d"], d: 0 },
    ]);
  });
});
