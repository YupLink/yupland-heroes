// Генератор артефактов (§8.122): настройка клетки — цены по редкостям и уникальности.
import { describe, expect, it } from "vitest";
import { artGenConfigDraft, artGenConfigOf, artGenOpen } from "./artGenConfig";

const gold = (n: number) => ({ resource: "gold" as const, amount: n });

describe("artGenConfig", () => {
  it("клетка главнее шаблона; строки без суммы отброшены", () => {
    const cell = { artGen: { prices: { rare: [gold(100), gold(0)] }, unique: [gold(500)] } };
    const meta = { artGen: { prices: { common: [gold(1)] } } };
    const cfg = artGenConfigOf(cell, meta);
    expect(cfg.prices.rare).toEqual([gold(100)]);
    expect(cfg.prices.common).toEqual([]);
    expect(cfg.unique).toEqual([gold(500)]);
    expect(artGenOpen(cfg)).toBe(true);
  });
  it("своей настройки нет — шаблона; нигде нет — закрыт", () => {
    expect(artGenConfigOf(null, { artGen: { prices: { epic: [gold(7)] } } }).prices.epic).toEqual([
      gold(7),
    ]);
    const none = artGenConfigOf(null, null);
    expect(artGenOpen(none)).toBe(false);
    expect(none.unique).toEqual([]);
  });
  it("черновик для формы держит пустые строки", () => {
    const d = artGenConfigDraft({ artGen: { prices: { legendary: [gold(0)] } } });
    expect(d.prices.legendary).toEqual([gold(0)]);
    expect(d.prices.common).toEqual([]);
  });
  it("мусор вместо настройки не роняет", () => {
    expect(artGenOpen(artGenConfigOf({ artGen: "x" }, 5))).toBe(false);
    expect(artGenConfigOf({ artGen: { prices: { rare: "x" } } }, null).prices.rare).toEqual([]);
  });
});
