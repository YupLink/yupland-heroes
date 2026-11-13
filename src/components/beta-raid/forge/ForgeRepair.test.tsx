// Ремонт у кузницы (§8.72): в окне постройки — вкладки, только когда сервер
// разрешил (offer.repair): у кузницы-лавки «Лавка | Ремонт» (лавка первой), у
// декоративной — одна «Ремонт». Во вкладке — строки с полосой износа и ценой
// (целых нет — их не выбрать), итог золото/алмазы отдельно, пустое — короткое
// «Всё целое»; «Починить все» серая, когда на всё не хватает. Рендер на сервере
// (окружение node, без jsdom).
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const res = vi.hoisted(() => ({ gold: 100, diamonds: 0 }));
const rows = vi.hoisted(() => ({ items: [] as unknown[] }));
vi.mock("sonner", () => ({
  toast: Object.assign(() => {}, { error: () => {}, success: () => {} }),
}));
vi.mock("@/lib/i18n", () => ({
  useT: () => (key: string, p?: Record<string, unknown>) =>
    p ? `${key}${JSON.stringify(p)}` : key,
  useLang: () => "ru",
}));
vi.mock("@/server/api/beta-raid/building-action", () => ({
  getBuildingOffer: vi.fn(),
  buildNextTier: vi.fn(),
}));
// Список — уже загружен и свежий (в окне кнопки серые, пока он перечитывается).
vi.mock("./useForgeRepair", () => ({
  useForgeRepairList: () => ({
    data: { items: rows.items },
    isLoading: false,
    isError: false,
    isFetching: false,
  }),
  useForgeRepair: () => ({ isPending: false, mutate: vi.fn(), variables: undefined }),
}));
vi.mock("@/server/api/beta-raid/home-castle", () => ({ getHomeCastle: vi.fn() }));
vi.mock("../BuildingExtraActions", () => ({ BuildingExtraActions: () => <i>extra</i> }));
vi.mock("../town/TownExtra", () => ({ TownExtra: () => null }));
vi.mock("../castleMode", () => ({ useCastleMode: () => null }));
vi.mock("@/lib/hooks/useResources", () => ({
  RESOURCES_KEY: ["my-resources"],
  useResources: () => ({ data: res }),
}));
vi.mock("@/lib/hooks/useEnergy", () => ({ ENERGY_KEY: ["my-energy"] }));
vi.mock("@/lib/hooks/useArtBroken", () => ({ useArtBrokenOn: () => false }));

const { BuildModal } = await import("../BuildModal");
const { ForgeRepairPanel } = await import("./ForgeRepairPanel");

const MARKET = { kind: "market", items: [] };
const offer = (repair?: boolean, extra: unknown = null) => ({
  effect: null,
  built: true,
  extra,
  ...(repair === undefined ? {} : { repair }),
  name: "Кузница",
  tier: 0,
  tierName: null,
  imageUrl: null,
  nextName: null,
  nextImageUrl: null,
  final: true,
  price: null,
  costs: null,
  requires: null,
  canBuild: false,
  blockReason: null,
});

function buildHtml(repair?: boolean, extra: unknown = null): string {
  const qc = new QueryClient();
  qc.setQueryData(["beta-raid-building", 1, 0], offer(repair, extra));
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <BuildModal q={1} r={0} onClose={() => {}} />
    </QueryClientProvider>,
  );
}

const item = (id: string, rarity: string, gold: number, diamonds: number, hero: string | null) => ({
  id,
  name: `Арт ${id}`,
  imageUrl: null,
  rarity,
  durability: 40,
  heroName: hero,
  price: { gold, diamonds },
});

function modalHtml(items: unknown[]): string {
  rows.items = items;
  return renderToStaticMarkup(<ForgeRepairPanel q={1} r={0} />);
}

/** Кнопка с этим текстом выключена? */
const disabled = (html: string, text: string): boolean => {
  const at = html.indexOf(text);
  const open = html.lastIndexOf("<button", at);
  return /\sdisabled=""/.test(html.slice(open, html.indexOf(">", open)));
};

/** Подписи вкладок по порядку. */
const tabs = (html: string): string[] =>
  [
    ...html.matchAll(
      /role="tab" aria-selected="(true|false)"[^>]*>[\s\S]*?<span[^>]*>([^<]+)<\/span>/g,
    ),
  ].map((m) => `${m[2]}${m[1] === "true" ? "*" : ""}`);

describe("вкладки кузницы в окне постройки", () => {
  it("кузница-лавка: «Лавка | Ремонт», открыта лавка (витрина на месте)", () => {
    rows.items = [];
    const html = buildHtml(true, MARKET);
    expect(html).toContain('role="tablist"');
    expect(tabs(html)).toEqual(["artfix.tab_shop*", "artfix.tab_repair"]);
    expect(html).toContain("<i>extra</i>");
    expect(html).not.toContain("artfix.empty");
  });

  it("декоративная: одна вкладка «Ремонт» — сразу список", () => {
    rows.items = [];
    const html = buildHtml(true);
    expect(tabs(html)).toEqual(["artfix.tab_repair*"]);
    expect(html).toContain("artfix.empty");
    expect(html).not.toContain("<i>extra</i>");
  });

  it("ремонт не открыт (не админ, нет флага) или старый ответ — вкладок нет, окно прежнее", () => {
    for (const html of [buildHtml(false, MARKET), buildHtml(undefined, MARKET)]) {
      expect(html).not.toContain('role="tablist"');
      expect(html).toContain("<i>extra</i>");
      expect(html).not.toContain("artfix.");
    }
  });

  it("старой кнопки поверх окна больше нет", () => {
    expect(buildHtml(true, MARKET)).not.toContain("artfix.open");
  });
});

describe("вкладка «Ремонт»", () => {
  it("строки: имя, полоса износа, на ком, цена; итог — золото и алмазы", () => {
    res.gold = 100;
    res.diamonds = 1;
    const html = modalHtml([
      item("a1", "common", 5, 0, "Эльф"),
      item("a2", "legendary", 0, 1, null),
    ]);
    expect(html).toContain("Арт a1");
    expect(html).toContain("Арт a2");
    expect(html).toContain("artfix.worn_by{&quot;name&quot;:&quot;Эльф&quot;}");
    expect(html.match(/data-art-wear="40"/g)).toHaveLength(2);
    expect(html).toContain("/resources/gold.webp");
    expect(html).toContain("/resources/crystal.webp");
    expect(html).toContain("artfix.pick_all");
    // Ничего не выбрано: «Починить (0)» серая, «Починить все» — нет (хватает).
    expect(disabled(html, "artfix.repair_n{&quot;n&quot;:0}")).toBe(true);
    expect(disabled(html, "artfix.repair_all")).toBe(false);
  });
  it("на всё не хватает — «Починить все» серая", () => {
    res.gold = 100;
    res.diamonds = 0;
    const html = modalHtml([item("a2", "legendary", 0, 1, null)]);
    expect(disabled(html, "artfix.repair_all")).toBe(true);
  });
  it("пусто — короткое состояние без кнопок", () => {
    const html = modalHtml([]);
    expect(html).toContain("artfix.empty");
    expect(html).not.toContain("artfix.repair_all");
  });
});
