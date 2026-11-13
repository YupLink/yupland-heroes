// «Хижина шаманов»: карточка в Ратуше, иконка в замке и игровое окно.
// Начальное состояние окна — вкладка покупки; цена и характеристики приходят
// из игровых данных. Серверные действия проверяются отдельно.
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { ShamanHutView } from "@/server/api/shaman-hut/shaman-hut";

vi.mock("@/server/api/castle-townhall/townhall-state", () => ({ getTownHall: vi.fn(), upgradeTownHall: vi.fn() }));
vi.mock("@/server/api/castle-townhall/townhall-buy", () => ({ buyCastleBuilding: vi.fn() }));
vi.mock("@/server/api/beta-raid/my-resources", () => ({ getMyResources: vi.fn() }));
vi.mock("@/server/api/mine-office/mine-office-own", () => ({ getMineOffice: vi.fn() }));
vi.mock("@/server/api/weather-station/wstation-own", () => ({ getWeatherStationOwned: vi.fn() }));
vi.mock("@/server/api/weather-station/wstation-list", () => ({ getWeatherStation: vi.fn() }));
vi.mock("@/server/api/weather-station/wstation-ritual", () => ({ castWeatherRitual: vi.fn() }));
vi.mock("@/server/api/shaman-hut/shaman-own", () => ({ getShamanHutOwned: vi.fn() }));
vi.mock("@/server/api/shaman-hut/shaman-hut", () => ({ getShamanHut: vi.fn(), buyShaman: vi.fn() }));
vi.mock("@/server/api/shaman-hut/shaman-take", () => ({ takeShamanToBackpack: vi.fn() }));
vi.mock("@/server/api/user-auth", () => ({ getSession: vi.fn() }));
vi.mock("@/server/api/game-auction", () => ({ listAuctions: vi.fn() }));
vi.mock("@/server/api/beta-raid/harvest-summary", () => ({ getHarvestSummary: vi.fn() }));
vi.mock("@/server/api/gifts", () => ({ getMyGifts: vi.fn() }));
// Язык — русский (стор zustand при рендере на сервере берёт начальное «en»).
vi.mock("@/lib/i18n", async (orig) => {
  const real = await orig<typeof import("@/lib/i18n")>();
  return {
    ...real,
    useLang: () => "ru",
    useT: () => (key: string, params?: Record<string, string | number>) => real.tFor("ru", key, params),
  };
});

const { TownHallShamanHut } = await import("../TownHallShamanHut");
const { TOWN_HALL_KEY } = await import("../useTownHall");
const { SHAMAN_HUT_OWNED_KEY } = await import("../useWithShamanHut");
const { CastleRewardRail } = await import("../CastleRewardRail");
const { ShamanHutModal } = await import("./ShamanHutModal");
const { SHAMAN_HUT_VIEW_KEY } = await import("./useShamanHut");
const { RESOURCES_KEY } = await import("@/lib/hooks/useResources");

const render = (node: ReactNode, data: Array<[readonly unknown[], unknown]> = []) => {
  const qc = new QueryClient();
  for (const [key, value] of data) qc.setQueryData(key, value);
  return renderToStaticMarkup(<QueryClientProvider client={qc}>{node}</QueryClientProvider>);
};
const flat = (html: string) => html.replace(/\u00a0/g, " ").replace(/<!-- -->/g, "");

const hall = (o: Record<string, unknown>) => ({
  level: 1,
  catalog: [
    {
      kind: "shaman_hut",
      cost: { wood: 2_000, stone: 1_000, gold: 1_000, diamonds: 0 },
      max: 1,
      needLevel: 1,
      owned: 0,
      problem: null,
      ...o,
    },
  ],
  buildings: [],
  resources: { wood: 5_000, stone: 5_000, gold: 5_000, diamonds: 0 },
});

describe("карточка в Ратуше", () => {
  it("цена владельца и «Построить»", () => {
    const html = flat(render(<TownHallShamanHut ru />, [[TOWN_HALL_KEY, hall({})]]));
    expect(html).toContain("Хижина шаманов");
    for (const n of ["2 000", "1 000"]) expect(html).toContain(n);
    expect(html).toContain("Построить");
    expect(html).not.toContain('disabled=""');
  });
  it("построена — без покупки", () => {
    const html = render(<TownHallShamanHut ru />, [[TOWN_HALL_KEY, hall({ owned: 1, problem: "max" })]]);
    expect(html).toContain("Построено");
    expect(html).not.toContain("Построить");
  });
});

describe("иконка в замке", () => {
  it("нет хижины — нет иконки; есть — появляется", () => {
    const label = "Хижина шаманов";
    expect(render(<CastleRewardRail lang="ru" />, [[SHAMAN_HUT_OWNED_KEY, { owned: false }]])).not.toContain(label);
    expect(render(<CastleRewardRail lang="ru" />, [[SHAMAN_HUT_OWNED_KEY, { owned: true }]])).toContain(label);
  });
});

const view = (o: Partial<ShamanHutView> = {}, shaman: Partial<ShamanHutView["shaman"]> = {}): ShamanHutView => ({
  count: 0,
  price: null,
  ...o,
  shaman: { name: "Шаман", image: "/raid/shaman.webp", hp: 0, attack: null, guard: false, ...shaman },
});
const hut = (v: ShamanHutView, gold = 1_000) =>
  flat(
    render(<ShamanHutModal icon="/raid/shaman.webp" onClose={() => {}} />, [
      [SHAMAN_HUT_VIEW_KEY, v],
      [RESOURCES_KEY, { gold, stone: 0, wood: 0, diamonds: 0 }],
    ]),
  );

describe("окно хижины", () => {
  it("цены нет — шаман и вкладки видны, покупка недоступна", () => {
    const html = hut(view());
    expect(html).toContain("Хижина шаманов");
    expect(html).toContain('src="/raid/shaman.webp"');
    expect(html).toContain(">Шаман<");
    expect(html).toContain("В хижине шаманов: 0");
    expect(html).toContain('role="tablist"');
    expect(html).toContain("В хижине");
    expect(html).toContain("Покупка недоступна");
    expect(html).not.toContain("Скоро в продаже");
    expect(html).toContain('disabled=""');
  });
  it("цена есть — сумма, игровой значок ресурса и действие покупки", () => {
    const html = hut(view({ price: { currency: "gold", amount: 500 } }));
    expect(html).toContain(">500<");
    expect(html).toContain('src="/resources/gold.webp"');
    expect(html).toContain("Купить");
    expect(html).not.toContain("Скоро в продаже");
    expect(html).not.toContain('disabled=""');
  });
  it("не хватает — «Купить» неактивна", () => {
    const html = hut(view({ price: { currency: "gold", amount: 5_000 } }), 100);
    expect(html).toContain("Купить");
    expect(html).toContain('disabled=""');
  });
  it("HP и атака заданы — характеристики видны в карточке", () => {
    const html = hut(view({ count: 2 }, { hp: 5000, attack: "80-120", guard: true }));
    expect(html).toContain("5 000");
    expect(html).toContain("80-120");
    expect(html).toContain("В хижине шаманов: 2");
    expect(html).toContain("+3% к шансу выбранной погоды или температуры");
  });
  it("характеристик охраны нет — карточка не выдаёт выдуманные значения", () => {
    const html = hut(view({ count: 3 }));
    expect(html).toContain("характеристики не указаны");
    expect(html).not.toContain("HP 120");
  });
});
