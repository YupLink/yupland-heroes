import { describe, expect, it } from "vitest";
import { townPriceHints } from "./town-price-hints";

describe("town-price-hints", () => {
  it("цена последнего города главнее медианы лавок; нули и мусор — мимо", () => {
    const h = townPriceHints([
      { lvl: "ref", k: "custom:banana", med: 10 },
      { lvl: "town", k: "custom:banana", med: "0.5" },
      { lvl: "ref", k: "custom:bread", med: 10 },
      { lvl: "town", k: "custom:oil", med: 1 },
      { lvl: "town", k: "custom:zero", med: 0 },
      { lvl: "cat", k: "icat_food", med: 10 },
      { lvl: "cat", k: "kind:custom", med: "x" },
    ]);
    expect(h.byRef).toEqual({ "custom:banana": 0.5, "custom:bread": 10, "custom:oil": 1 });
    expect(h.byCat).toEqual({ icat_food: 10 });
  });
});
