import { afterEach, describe, expect, it } from "vitest";
import { setStarsForDarai, starsForDarai } from "./starsForDarai";
import { priceLine, priceShort } from "@/components/beta-raid/portalPriceText";
import { priceLabel } from "./buildingEffect";

const t = (k: string) => k;
afterEach(() => setStarsForDarai(null));

describe("цена в DARAI глазами звездочника", () => {
  it("подмены нет — DARAI как есть (полноценный игрок, сервер)", () => {
    expect(starsForDarai(1000)).toBeNull();
    expect(priceLine({ resource: "token", token: "Darai", amount: 1000 } as never, t)).toBe("1000 Darai");
  });
  it("звездочник без DARAI — звёзды в подписях", () => {
    setStarsForDarai((d) => (d > 500 ? Math.ceil(d / 100) : null));
    expect(priceLine({ resource: "token", token: "Darai", amount: 1000 } as never, t)).toBe("10 ★");
    expect(priceLine({ resource: "token", token: "Darai", amount: 400 } as never, t)).toBe("400 Darai");
    expect(priceLabel({ kind: "token", token: "Darai", amount: 1000 } as never)).toEqual({
      key: "braid.price_tokens",
      params: { n: 10, token: "★" },
    });
  });
  it("«не хватает» сверяет звёзды, когда платит звёздами", () => {
    setStarsForDarai(() => 10);
    const line = { resource: "token", token: "Darai", amount: 1000 } as never;
    expect(priceShort(line, (r, tok) => (tok === "STARS" ? 12 : 0))).toBe(false);
    expect(priceShort(line, (r, tok) => (tok === "STARS" ? 5 : 0))).toBe(true);
  });
  it("другие токены не трогаем", () => {
    setStarsForDarai(() => 10);
    expect(priceLine({ resource: "token", token: "HOPE", amount: 1000 } as never, t)).toBe("1000 HOPE");
  });
});
