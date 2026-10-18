// Витрина привязанной лавки = товары ратуши, в обе стороны (владелец,
// 04.10.2026). Id позиции собирается и разбирается одинаково; золото — валюта
// города, его на витрине нет. Базы нет: подписи шаблонов подменены.
import { describe, expect, it, vi } from "vitest";
import { defaultTownRules } from "@/lib/townRules";
import type { CityShop } from "./town-shop";

vi.mock("./market-payout-meta", () => ({
  priceMetaBatch: async () => new Map([["custom:cst_bread", { name: "Хлеб", image: "/b.png" }]]),
  priceMetaOf: (m: Map<string, { name: string; image: string }>, res: string, token: string) =>
    m.get(`${res}:${token}`) ?? null,
}));

const { cityItems, parseTownItemId, townItemId } = await import("./town-shop-items");

const good = (
  id: string,
  kind: "custom" | "resource",
  refId: string,
  token: string | null = null,
) => ({
  id,
  kind,
  refId,
  token,
  operation: "both" as const,
  marketPrice: 2,
  consumePerResident: 0.02,
  producePerDay: 5,
});

const city: CityShop = {
  town: { mapId: "m", q: 33, r: 53 },
  cfg: {
    name: "",
    residents: 500,
    rules: defaultTownRules(),
    goods: [
      good("tg_bread", "custom", "cst_bread"),
      good("tg_wood", "resource", "wood"),
      good("tg_tok", "resource", "token", "Darai"),
      good("tg_gold", "resource", "gold"),
    ],
  },
  stock: {},
  starving: false,
};

describe("id позиции ратуши", () => {
  it("собирается и разбирается обратно", () => {
    const id = townItemId(-35, 53, "tg_bread", "sell");
    expect(parseTownItemId(id)).toEqual({ q: -35, r: 53, goodId: "tg_bread", side: "sell" });
  });
  it("обычная позиция лавки — не ратуши", () => {
    expect(parseTownItemId("mkt_abc123")).toBeNull();
  });
});

describe("cityItems", () => {
  it("каждый товар — покупка и скупка; золота на витрине нет", async () => {
    const items = await cityItems(35, 53, city);
    expect(items.map((i) => i.id)).toEqual([
      "town:35,53:tg_bread:buy",
      "town:35,53:tg_bread:sell",
      "town:35,53:tg_wood:buy",
      "town:35,53:tg_wood:sell",
      "town:35,53:tg_tok:buy",
      "town:35,53:tg_tok:sell",
    ]);
  });
  it("подписи: шаблон — из справочника, ресурс — по-русски, токен — символом", async () => {
    const items = await cityItems(35, 53, city);
    const byId = new Map(items.map((i) => [i.id, i]));
    expect(byId.get("town:35,53:tg_bread:buy")).toMatchObject({ name: "Хлеб", image: "/b.png" });
    expect(byId.get("town:35,53:tg_wood:buy")?.name).toBe("Дерево");
    expect(byId.get("town:35,53:tg_tok:sell")).toMatchObject({ name: "Darai", giveToken: "Darai" });
    expect(items.every((i) => i.giveAmount === 1 && i.priceResource === "gold")).toBe(true);
  });
});
