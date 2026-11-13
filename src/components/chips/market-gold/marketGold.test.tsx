// Маркет фишек за золото в интерфейсе (владелец, 21.10.2026): цена — целое золото
// от 10 (с 22.10.2026), подпись «Цена в золоте», «Купить за N»; не хватает — кнопка неактивна и
// «Не хватает золота: нужно N, у тебя M», как отказ сервера.
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("react-dom", async (orig) => ({
  ...(await orig<typeof import("react-dom")>()),
  createPortal: (node: unknown) => node,
}));
vi.mock("@/lib/i18n", () => ({ useLang: () => "ru", useT: () => (k: string) => k }));
vi.mock("@/components/ui/ResourceGlyph", () => ({
  ResourceGlyph: ({ kind }: { kind: string }) => <i data-glyph={kind} />,
}));
vi.mock("@/components/chips/TirageStats", () => ({ TirageStatBlock: () => null }));
vi.mock("@/components/ChipImage", () => ({ ChipImage: () => null, chipPanelClasses: () => "" }));

const { parseGoldPrice, goldSellerGets, goldShortfall, goldShortText } = await import("./goldMarket");
const { MarketCardBuy } = await import("./MarketCardBuy");
const { MarketListingModal } = await import("./MarketListingModal");
const { GoldPrice } = await import("./GoldPrice");
(globalThis as { document?: unknown }).document ??= { body: {} };

const listing = {
  id: "L1", chipId: "c1", sellerWallet: "s.near", sellerUsername: "seller", priceGold: 1500,
  collectionId: "col", collectionName: "Коллекция", createdAt: "2026-10-21T00:00:00Z",
  chip: { id: "c1", level: 2, name: "Юпик", imageUrl: null, templateNo: 7, serialNo: 42, tirage: 1000, isPremium: false },
};

describe("цена лота в золоте", () => {
  it("целое золото 10…1 000 000 (минимум с 22.10.2026)", () => {
    expect(parseGoldPrice("1")).toBeNull();
    expect(parseGoldPrice("9")).toBeNull();
    expect(parseGoldPrice("10")).toBe(10);
    expect(parseGoldPrice(" 250 ")).toBe(250);
    expect(parseGoldPrice("0")).toBeNull();
    expect(parseGoldPrice("1.5")).toBeNull();
    expect(parseGoldPrice("0,1")).toBeNull();
    expect(parseGoldPrice("1000001")).toBeNull();
  });

  it("продавцу 91 % тем же округлением, что у сервера", () => {
    expect(goldSellerGets(100)).toBe(91);
    expect(goldSellerGets(1)).toBe(0.91);
    expect(goldSellerGets(333)).toBe(303.03);
  });

  it("нехватка — только при известном балансе, фраза как у сервера", () => {
    expect(goldShortfall(100, null)).toBeNull();
    expect(goldShortfall(100, 100)).toBeNull();
    expect(goldShortfall(100, 99.6)).toEqual({ need: 100, have: 99 });
    expect(goldShortText({ need: 100, have: 99 }, true)).toBe("Не хватает золота: нужно 100, у тебя 99");
    expect(goldShortText({ need: 100, have: 99 }, false)).toBe("Not enough gold: need 100, you have 99");
  });
});

describe("карточка и окно лота", () => {
  it("цена со значком золота и подписью «Цена в золоте»", () => {
    const html = renderToStaticMarkup(<GoldPrice value={1500} caption />);
    expect(html).toContain('data-glyph="gold"');
    expect(html).toContain("Цена в золоте");
    expect(html).toMatch(/1\s500/);
  });

  it("хватает — «Купить за N» со значком золота, кнопка активна", () => {
    const html = renderToStaticMarkup(<MarketCardBuy price={1500} gold={2000} pending={false} onBuy={() => {}} />);
    expect(html).toContain("Купить за");
    expect(html).toContain('data-glyph="gold"');
    expect(html).not.toContain('disabled=""');
    expect(html).not.toContain("Не хватает");
  });

  it("не хватает — кнопка неактивна и рядом «Не хватает золота: нужно N, у тебя M»", () => {
    const card = renderToStaticMarkup(<MarketCardBuy price={1500} gold={120.5} pending={false} onBuy={() => {}} />);
    expect(card).toContain('disabled=""');
    expect(card).toContain("Не хватает золота: нужно 1500, у тебя 120");
    const modal = renderToStaticMarkup(
      <MarketListingModal listing={listing} mine={false} buying={false} gold={120} onBuy={() => {}} onClose={() => {}} />,
    );
    expect(modal).toContain("Цена в золоте");
    expect(modal).toMatch(/<button[^>]*disabled=""[^>]*>Купить за/);
    expect(modal).toContain("Не хватает золота: нужно 1500, у тебя 120");
  });

  it("баланс ещё не пришёл — кнопку не гасим (отказ, если что, скажет сервер)", () => {
    const html = renderToStaticMarkup(<MarketCardBuy price={1500} gold={null} pending={false} onBuy={() => {}} />);
    expect(html).not.toContain('disabled=""');
  });
});
