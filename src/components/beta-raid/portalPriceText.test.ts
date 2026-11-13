// Цена ворот словами и строкой плашки: ресурс с картинкой — только число,
// токен/товар — словами, как в окне портала. Билеты — золотом ×500 (§8.61).
import { describe, expect, it } from "vitest";
import { priceRow, priceText } from "./portalPriceText";
import type { PortalPrice } from "@/lib/portal";

const t = (key: string) => `[${key}]`;

describe("priceRow", () => {
  it("золото и алмазы — картинка и число", () => {
    expect(priceRow({ resource: "gold", amount: 50 }, t)).toEqual({
      icon: "/resources/gold.webp",
      label: "50",
    });
    expect(priceRow({ resource: "diamonds", amount: 1 }, t)).toEqual({
      icon: "/resources/crystal.webp",
      label: "1",
    });
  });

  it("цена в билетах — золотом ×500: картинка золота и число", () => {
    expect(priceRow({ resource: "tickets", amount: 3 }, t)).toEqual({
      icon: "/resources/gold.webp",
      label: "1500",
    });
    expect(priceText([{ resource: "tickets", amount: 1 }], t)).toBe("500 [market.res.gold]");
  });

  it("токен и товар — без картинки, словами", () => {
    expect(priceRow({ resource: "token", token: "Darai", amount: 1000 }, t)).toEqual({
      icon: null,
      label: "1000 Darai",
    });
    const apple: PortalPrice = {
      resource: "item",
      itemKey: "custom:x",
      itemName: "Яблоко",
      amount: 100,
    };
    expect(priceRow(apple, t)).toEqual({ icon: null, label: "100 × Яблоко" });
  });
});

describe("priceText", () => {
  it("строки через точку", () => {
    expect(
      priceText(
        [
          { resource: "gold", amount: 50 },
          { resource: "token", token: "Darai", amount: 1000 },
        ],
        t,
      ),
    ).toBe("50 [market.res.gold] · 1000 Darai");
  });
});
