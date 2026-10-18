// Вывод фишки в NFT убран словом владельца 17.10.2026. Карточки фишки (игроков
// и Казармы замка) рисуются без кнопки «Превратить в NFT» и не спрашивают
// у сервера цену вывода; остальные действия на месте.
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const queryKeys: string[] = [];
vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: { queryKey: unknown[] }) => {
    queryKeys.push(String(queryKey[0]));
    if (queryKey[0] === "session") return { data: { features: { heroes: true } }, isLoading: false, isError: false };
    if (queryKey[0] === "chip-collections-public") {
      return { data: [{ id: "col", initialSupply: 1000, isPremium: false }], isLoading: false, isError: false };
    }
    return { data: true, isLoading: false, isError: false, refetch: async () => {} };
  },
  useQueryClient: () => ({}),
  useMutation: () => ({ isPending: false, mutate: () => {} }),
}));
vi.mock("@/lib/i18n", () => ({ useLang: () => "ru", useT: () => (k: string) => k }));
vi.mock("@/server/api/chips-stake", () => ({
  listChipCollectionsPublic: async () => [],
  getTirageBonusEnabled: async () => true,
}));
vi.mock("@/server/api/chips-craft", () => ({ CRAFT_RULES: { "3": { costTickets: 5 }, "4": { costTickets: 9 } } }));
vi.mock("@/server/api/chips-pack", () => ({ myChipInventory: async () => [] }));
vi.mock("@/server/api/user-auth", () => ({ getSession: async () => null }));
vi.mock("@/components/heroes/ConvertToHeroModal", () => ({ ConvertToHeroModal: () => null }));
vi.mock("@/components/chips/SingleChipCraftModal", () => ({ SingleChipCraftModal: () => null }));
vi.mock("@/components/castle-live/CastleConvertToHeroModal", () => ({ CastleConvertToHeroModal: () => null }));
vi.mock("@/components/chips/castle-market/MarketCreateListing", () => ({ MarketCreateListing: () => null }));
vi.mock("@/components/ui/ResourceGlyph", () => ({ ResourceGlyph: () => null }));

const { ChipDetailModal } = await import("./ChipDetailModal");
const { BarracksChipDetailModal } = await import("./castle-barracks/BarracksChipDetailModal");

const template = {
  id: "tpl",
  templateNo: 7,
  name: "Юпик",
  imageUrl: "/img/yupik.webp",
  collectionId: "col",
  collectionName: "Коллекция",
};
// 4★ — раньше на этом уровне карточка показывала «Превратить в NFT».
const chips = [{ id: "c1", level: 4, obtainedAt: "2026-10-01T00:00:00Z", serialNo: 42 }];

describe("карточка фишки без вывода в NFT", () => {
  it("у игроков: нет кнопки NFT, улучшение и герой на месте", () => {
    queryKeys.length = 0;
    const html = renderToStaticMarkup(
      <ChipDetailModal chipId="c1" template={template} chips={chips} onClose={() => {}} />,
    );
    expect(html).not.toMatch(/nft/i);
    expect(html).toContain("chips.upgrade_for");
    expect(html).toContain("Превратить в героя");
    expect(html).toContain("common.close");
    expect(queryKeys).not.toContain("mint-quote");
  });

  it("в Казарме: в «Других действиях» только «Продать в Маркете»", () => {
    queryKeys.length = 0;
    const html = renderToStaticMarkup(
      <BarracksChipDetailModal chipId="c1" template={template} chips={chips} onClose={() => {}} />,
    );
    expect(html).not.toMatch(/nft/i);
    expect(html).toContain("Продать в Маркете");
    expect(html).toContain("Улучшить");
    expect(html).toContain("Сделать героем");
    expect(queryKeys).not.toContain("mint-quote");
  });
});
