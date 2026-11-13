// Плитка городской лавки: при 2+ шт. «/шт» — средняя из итога корзины с
// пометкой «ср. цена» (владелец, 04.11.2026). DOM нет: рендер в строку;
// разделитель дроби — по языку стора, поэтому [.,].
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { MarketItemView } from "@/lib/buildingEffect";
import { townCurve } from "@/lib/townPricing";

vi.mock("@/lib/i18n", () => ({
  useLang: () => "ru",
  useT: () => (key: string) => key,
}));
vi.mock("@/server/api/beta-raid/item-info", () => ({ getItemInfo: async () => null }));

const { MarketItemCard } = await import("./MarketItemCard");

// Пальмовое масло в Зу-Гре: штука 3,95, 120 шт. — 267,05 (сверено с продом).
const curve = townCurve({ marketPrice: 2, consumePerResident: 0.02 }, 200, {
  markupPct: 20,
  reservePct: 10,
});
const palm = {
  id: "town:74,48:tg_palm:sell",
  side: "sell",
  kind: "custom",
  refId: "cst_palm",
  name: "Пальмовое масло",
  image: null,
  giveAmount: 1,
  giveToken: null,
  priceResource: "gold",
  priceToken: null,
  priceAmount: 3.95,
  remaining: null,
  buyable: true,
  lockKey: null,
  town: { stock: 4.27, curve },
} as MarketItemView;

const render = (qty: number, cityTotal: number | null) =>
  renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <MarketItemCard it={palm} qty={qty} onQty={() => {}} cityTotal={cityTotal} />
    </QueryClientProvider>,
  );

describe("средняя цена на плитке города", () => {
  it("120 шт. за 267,05 — «2,23 /шт» и «ср. цена»", () => {
    const html = render(120, 267.05);
    expect(html).toMatch(/<b>2[.,]23<\/b><small>\/шт<\/small>/);
    expect(html).toContain("market.avg_price");
  });

  it("1 шт. — цена штуки 3,95 без пометки", () => {
    const html = render(1, 3.95);
    expect(html).toMatch(/<b>3[.,]95<\/b>/);
    expect(html).not.toContain("market.avg_price");
  });
});
