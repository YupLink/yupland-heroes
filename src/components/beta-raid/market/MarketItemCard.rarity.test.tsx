// Плитка витрины: у героя-товара видна редкость плашкой её цвета (владелец,
// 23.10.2026), а у скупки ломбарда «Любой … артефакт» нет полосы «100 %» — он
// берёт и изношенные. DOM нет: рендер в строку.
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { MarketItemView } from "@/lib/buildingEffect";

vi.mock("@/lib/i18n", () => ({
  useLang: () => "ru",
  useT: () => (key: string) => key,
}));
vi.mock("@/server/api/beta-raid/heroes-sellable", () => ({ listSellableHeroes: async () => [] }));
vi.mock("@/server/api/beta-raid/artifacts-sellable", () => ({
  listSellableArtifacts: async () => [],
}));
vi.mock("@/server/api/beta-raid/item-info", () => ({ getItemInfo: async () => null }));

const { MarketItemCard } = await import("./MarketItemCard");

const item = (o: Partial<MarketItemView>): MarketItemView => ({
  id: "pawn_1",
  side: "buy",
  kind: "hero",
  refId: "hero_A",
  name: "Drogg",
  image: null,
  giveAmount: 1,
  giveToken: null,
  priceResource: "gold",
  priceToken: null,
  priceAmount: 500,
  priceName: null,
  priceImage: null,
  price2Resource: null,
  price2Token: null,
  price2Amount: null,
  price2Name: null,
  price2Image: null,
  stock: 1,
  sold: 0,
  remaining: 1,
  buyable: true,
  lockKey: null,
  ...o,
});

const render = (it: MarketItemView) =>
  renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <MarketItemCard it={it} qty={0} onQty={() => {}} onPick={() => {}} />
    </QueryClientProvider>,
  );

describe("редкость героя на плитке", () => {
  it("герой из ломбарда — плашка «Легендарный» цвета легендарки", () => {
    const html = render(item({ heroRarity: "legendary" }));
    expect(html).toContain(">Легендарный<");
    expect(html).toContain("text-amber-300");
  });

  it("нет поля (старый снимок витрины) — плашки нет", () => {
    const html = render(item({}));
    expect(html).not.toContain("Легендарный");
    expect(html).not.toContain("text-amber-300");
  });
});

describe("полоса прочности", () => {
  it("скупка «Любой … артефакт» — без полосы; новый артефакт на витрине — с полной", () => {
    const pawn = render(item({ side: "sell", kind: "art", refId: "art_any_common" }));
    const art = render(item({ kind: "art", refId: "art_tpl" }));
    // ArtWearBar рисует полосу шириной прочности.
    expect(art).toContain("width:100%");
    expect(pawn).not.toContain("width:100%");
  });
});
