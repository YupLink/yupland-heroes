// Свой лот героя (жалоба 05.11): продавец видит свою цену, а не одну «Снять».
import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/lib/i18n", () => ({ useLang: () => "ru", useT: () => (k: string) => k }));
vi.mock("@/server/api/hero-market", () => ({ listHeroMarketLots: async () => ({}), buyHeroLot: async () => ({}), withdrawHeroLot: async () => ({}) }));
vi.mock("@/server/api/chipsMarket", () => ({ getMarketAccess: async () => ({}) }));
vi.mock("@/hooks/usePurchaseMusic", () => ({ usePurchaseMusic: () => {} }));
vi.mock("@/components/castle-live/TavernDialog", () => ({ TavernDialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
const hero = { itemId: "h", heroId: "h", templateId: "t", name: "Мой герой", imageUrl: null, rarity: "epic", race: "Кабан", specialization: "Воин", level: 5, maxLevel: 20, baseLevel: 1, skills: {}, skillEarned: 0, skillFree: 0, stats: {}, satiety: null, artifacts: [], spells: [] };
const lot = { id: "a", status: "active", mine: true, sellerName: "me", priceGold: 1500, priceDarai: 250000, createdAt: "", closedAt: null, hero, sale: null };
vi.mock("@tanstack/react-query", () => ({
  useInfiniteQuery: () => ({ data: { pages: [{ lots: [lot], total: 1 }] }, isPending: false, isError: false }),
  useQuery: () => ({ data: { locked: false }, isPending: false, isError: false }),
  useQueryClient: () => ({}),
}));
const { HeroMarketScreen } = await import("./HeroMarketScreen");
const { HeroMarketReview } = await import("./HeroMarketDialogs");

it("карточка своего лота: обе цены текстом и «Снять», кнопок «Купить» нет", () => {
  const html = renderToStaticMarkup(<HeroMarketScreen saleRequest={0} />);
  expect(html.match(/market-heroes-visual__own-price/g)).toHaveLength(2);
  expect(html).toMatch(/1\s500/);
  expect(html).toMatch(/250\s000/);
  expect(html).toContain(">Снять</button>");
  expect(html).not.toContain("Купить Мой герой");
});

it("окно «Снять с продажи?» показывает цену лота", () => {
  const html = renderToStaticMarkup(<HeroMarketReview review={{ items: [{ lot: lot as never, op: "1" }], currency: "gold", withdraw: true }} ru busy={false} blocked={false} onConfirm={() => {}} onClose={() => {}} />);
  expect(html).toContain("Снять с продажи?");
  expect(html).toContain("hero-market-own-prices");
  expect(html).toMatch(/1\s500/);
  expect(html).toMatch(/250\s000/);
});
