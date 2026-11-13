// Окно снаряжения (список слота, надетое): строка несёт процент зачарования
// экземпляра, а зачарованный не схлопывается с обычными того же шаблона (§8.87).
import { describe, expect, it } from "vitest";
import { buildOptions, itemView } from "./heroes-gear-items";
import type { LoadedGearPiece } from "./beta-raid/hero-load";

const piece = (itemId: string, enchantPct?: number | null): LoadedGearPiece => ({
  itemId,
  templateId: "tpl_hat",
  name: "Fisherman's hat",
  slot: "Голова",
  rarity: "rare",
  imageUrl: null,
  statType: "attack",
  statAmount: 3,
  wear: 0,
  enchantPct,
});
const ctx = { race: null, spec: null };

describe("зачарование в окне снаряжения", () => {
  it("строка несёт enchantPct; у обычного поля нет вовсе (форма ответа прежняя)", () => {
    expect(itemView(piece("a", 15), ctx, ["a"]).enchantPct).toBe(15);
    expect(itemView(piece("b", -20), ctx, ["b"]).enchantPct).toBe(-20);
    expect("enchantPct" in itemView(piece("c", null), ctx, ["c"])).toBe(false);
    expect("enchantPct" in itemView(piece("d"), ctx, ["d"])).toBe(false);
  });

  it("обычные схлопнуты ×2, зачарованный — своей строкой с процентом", () => {
    const { available } = buildOptions([piece("a"), piece("e", 15), piece("b")], new Set(), ctx);
    const rows = available["Голова"].map((v) => ({ ids: v.itemIds, pct: v.enchantPct ?? null }));
    expect(rows).toEqual([
      { ids: ["a", "b"], pct: null },
      { ids: ["e"], pct: 15 },
    ]);
  });
});
