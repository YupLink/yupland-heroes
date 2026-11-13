// Плитка покупки при нехватке (владелец, 13.11.2026): недостающая строка цены
// красная, «+» не уводит дальше, чем по карману. Скупка — как была.
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { MarketItemView } from "@/lib/buildingEffect";

vi.mock("@/lib/i18n", () => ({
  useLang: () => "ru",
  useT: () => (key: string) => key,
}));
vi.mock("@/server/api/beta-raid/item-info", () => ({ getItemInfo: async () => null }));

const { MarketItemCard } = await import("./MarketItemCard");

const LOG = "cst_wtza7b6iq7va";
const ORE = "cst_izilsngrki5v";
const shovel = {
  id: "mkt_shovel",
  side: "buy",
  kind: "resource",
  refId: "gold",
  name: "Каменная Лопата",
  image: null,
  giveAmount: 1,
  giveToken: null,
  priceResource: "custom",
  priceToken: LOG,
  priceAmount: 1,
  priceName: "Бревна Дуба",
  priceImage: null,
  price2Resource: "custom",
  price2Token: ORE,
  price2Amount: 1,
  price2Name: "Горная Руда",
  price2Image: null,
  stock: null,
  sold: 0,
  remaining: null,
  buyable: true,
  lockKey: null,
} as MarketItemView;

const render = (p: { it?: MarketItemView; short?: Set<string>; buyCap?: number | null }) =>
  renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <MarketItemCard
        it={p.it ?? shovel}
        qty={0}
        onQty={() => {}}
        short={p.short}
        buyCap={p.buyCap}
      />
    </QueryClientProvider>,
  );

const shortTitles = (html: string) =>
  [...html.matchAll(/class="raid-market-amount is-short"[^>]*title="([^"]+)"/g)].map((m) => m[1]);

describe("нехватка на плитке", () => {
  it("руды нет — красная только руда", () => {
    const html = render({ short: new Set([`custom:${ORE}`]) });
    expect(shortTitles(html)).toEqual(["1 Горная Руда"]);
  });

  it("всего хватает — ничего не красное, «+» живой", () => {
    const html = render({ short: new Set(), buyCap: 3 });
    expect(shortTitles(html)).toEqual([]);
    expect(html).toMatch(/aria-label="\+ Каменная Лопата"(?![^>]*disabled)/);
  });

  it("по карману 0 — «+» погашен", () => {
    const html = render({ short: new Set([`custom:${LOG}`]), buyCap: 0 });
    expect(html).toMatch(/aria-label="\+ Каменная Лопата"[^>]*disabled/);
  });

  it("скупка не красится и «+» не режется потолком покупки", () => {
    const html = render({
      it: { ...shovel, side: "sell" },
      short: new Set([`custom:${LOG}`]),
      buyCap: 0,
    });
    expect(shortTitles(html)).toEqual([]);
    expect(html).toMatch(/aria-label="\+ Каменная Лопата"(?![^>]*disabled)/);
  });
});
