// Окна улучшения фишки (владелец, 21.10.2026): цена — «Требуется золото» со значком
// золота; золота не хватает — кнопка неактивна, рядом «Не хватает золота: нужно N,
// у тебя M» (та же фраза, что у отказа сервера).
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const st = vi.hoisted(() => ({ gold: 0 }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: { queryKey: unknown[] }) => {
    if (queryKey[0] === "my-resources")
      return { data: { gold: st.gold }, isError: false, isFetching: false };
    if (queryKey[0] === "craft-gold-price")
      return { data: { multiplier: 1 }, isError: false, isFetching: false };
    return { data: [], isError: false, isFetching: false, isLoading: false };
  },
  useMutation: () => ({ isPending: false, mutate: () => {} }),
  useQueryClient: () => ({}),
}));
vi.mock("@/lib/i18n", async () => {
  const real = await vi.importActual<typeof import("@/lib/i18n")>("@/lib/i18n");
  return {
    ...real,
    useLang: () => "ru",
    useT: () => (k: string, p?: Record<string, string | number>) => real.tFor("ru", k, p),
  };
});
vi.mock("@/server/api/chips-craft", () => ({
  CRAFT_RULES: { "4": { sacrifices: 1, costGold: 1059, requireIdentical: true } },
  craftChip: async () => null,
}));
vi.mock("@/server/api/chips-pack", () => ({ myChipInventory: async () => [] }));
vi.mock("@/server/api/craft-gold-price", () => ({
  getCraftGoldPrice: async () => ({ multiplier: 1 }),
}));
vi.mock("@/server/api/beta-raid/my-resources", () => ({
  getMyResources: async () => ({ gold: 0 }),
}));
vi.mock("@/components/chips/AutoUpgradeModal", () => ({ AutoUpgradeModal: () => null }));

const { SingleChipCraftModal } = await import("./SingleChipCraftModal");
const { BarracksChipDetailView } = await import("./castle-barracks/BarracksChipDetailView");

const template = { id: "tpl", templateNo: 7, name: "Юпик", imageUrl: "/img/yupik.webp" };
const norm = (s: string) => s.replace(/\u00a0|\u202f/g, " ");
const craftHtml = () =>
  norm(
    renderToStaticMarkup(
      <SingleChipCraftModal
        chipId="c1"
        chipLevel={4}
        template={template}
        onClose={() => {}}
        onCrafted={() => {}}
      />,
    ),
  );
const confirmButton = (html: string) =>
  /<button[^>]*chip-upgrade__confirm[^>]*>/.exec(html)?.[0] ?? "";

describe("окно улучшения", () => {
  it("цена подписана «Требуется золото» со значком", () => {
    st.gold = 5000;
    const html = craftHtml();
    expect(html).toContain("Требуется золото:");
    expect(html).toContain("/resources/gold.png");
    expect(html).not.toContain("Не хватает золота");
  });

  it("не хватает — кнопка неактивна и отказ в форме сервера", () => {
    st.gold = 120;
    const html = craftHtml();
    expect(confirmButton(html)).toContain("disabled");
    expect(html).toContain("Не хватает золота: нужно 1 059, у тебя 120");
  });
});

const viewProps = {
  sellDisabled: false,
  onSell: () => {},
  template: { name: "Юпик", collectionName: "", imageUrl: "/x.webp", templateNo: 7 },
  chip: { level: 4, serialNo: 1 },
  supply: 1000,
  isPremium: false,
  bonusEnabled: true,
  bonusError: false,
  onBonusRetry: () => {},
  busy: null,
  resting: false,
  restLeft: "",
  isMax: false,
  upgradeCost: 1059,
  goldMult: 1,
  heroLikes: null,
  onCraft: () => {},
  onHero: () => {},
  onClose: () => {},
};
const upgradeButton = (html: string) => /<button class="bcd-upgrade"[^>]*>/.exec(html)?.[0] ?? "";

describe("карточка в Казарме", () => {
  it("хватает — «Требуется золото», кнопка активна", () => {
    const html = norm(
      renderToStaticMarkup(<BarracksChipDetailView {...viewProps} haveGold={2000} />),
    );
    expect(html).toContain("Требуется золото:");
    expect(upgradeButton(html)).not.toContain("disabled");
  });

  it("не хватает на шаг — кнопка неактивна, отказ в форме сервера", () => {
    const html = norm(
      renderToStaticMarkup(<BarracksChipDetailView {...viewProps} haveGold={120} />),
    );
    expect(upgradeButton(html)).toContain("disabled");
    expect(html).toContain("Не хватает золота: нужно 1 059, у тебя 120");
  });

  it("пакетная проверка сказала «золото» — её числа, без дубля причины", () => {
    const state = {
      can: false as const,
      reason: { kind: "gold" as const, need: 2118, have: 1500 },
    };
    const html = norm(
      renderToStaticMarkup(
        <BarracksChipDetailView {...viewProps} haveGold={1500} upgradeState={state} />,
      ),
    );
    expect(upgradeButton(html)).toContain("disabled");
    expect(html).toContain("Не хватает золота: нужно 2 118, у тебя 1 500");
    expect(html).not.toContain("Сейчас нельзя улучшить");
  });
});
