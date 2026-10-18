// Окно «Выставить фишки» у держателя тысяч фишек (жалоба 14.10): рисует
// первую порцию, одинаковые фишки стоят рядом, остальное — «Показать ещё».
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("react-dom", async (orig) => ({
  ...(await orig<typeof import("react-dom")>()),
  createPortal: (node: unknown) => node,
}));
vi.mock("@/lib/i18n", () => ({ useLang: () => "ru", useT: () => (k: string) => k }));
vi.mock("@/server/api/chips-pack", () => ({ myChipInventory: async () => [] }));
vi.mock("@/server/api/chipsMarket", () => ({ createMarketListingsBatch: async () => ({}) }));
vi.mock("@/components/ui/ResourceGlyph", () => ({ ResourceGlyph: () => null }));
vi.mock("./market-create-listing.css", () => ({}));

// 3000 фишек: три вида по 1000 штук, в инвентаре вперемешку.
const groups = ["a", "b", "c"].map((k) => ({
  level: 1,
  imageUrl: `/img/${k}.webp`,
  collectionId: "col",
  collectionName: "Коллекция",
  chips: Array.from({ length: 1000 }, (_, i) => ({ id: `${k}${i}`, serialNo: i + 1, studying: false })),
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: groups, isPending: false, isSuccess: true, isError: false, isFetching: true }),
  useQueryClient: () => ({}),
  useMutation: () => ({ isPending: false, mutate: () => {} }),
}));

const { MarketCreateListing } = await import("./MarketCreateListing");
// Окно рисуется порталом в body: в node — заглушка (createPortal выше отдаёт узел).
(globalThis as { document?: unknown }).document ??= { body: {} };

describe("Выставить фишки — тысячи фишек", () => {
  const html = renderToStaticMarkup(<MarketCreateListing onClose={() => {}} />);
  const ids = [...html.matchAll(/data-sweep-id="([^"]+)"/g)].map((m) => m[1]);

  it("рисует 120 карточек, а не 3000; дальше — «Показать ещё»", () => {
    expect(ids).toHaveLength(120);
    expect(html).toContain("Показать ещё · 2880");
  });

  it("одинаковые фишки рядом, по номеру", () => {
    expect(ids.slice(0, 3)).toEqual(["a0", "a1", "a2"]);
    expect(ids.every((id) => id.startsWith("a"))).toBe(true);
  });

  it("открыли с карточки фишки — она первой", () => {
    const one = renderToStaticMarkup(<MarketCreateListing onClose={() => {}} initialChipId="c777" />);
    expect(/data-sweep-id="([^"]+)"/.exec(one)?.[1]).toBe("c777");
  });

  it("фоновая перечитка инвентаря не прячет сетку за спиннером; есть «Все видимые»", () => {
    expect(html).not.toContain("Загрузка…");
    expect(html).toContain("Все видимые");
  });
});
