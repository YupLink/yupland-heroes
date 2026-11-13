// «Управление шахтами» на экране: карточка в Ратуше (цена владельца,
// «Построить» / «Построено», нет места — погашено), иконка в замке только со
// зданием, строка окна — режим и починка у своей работающей шахты мира, у
// острова и сломанной — без них; «Собрать» — только когда есть что.
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { OfficeMine } from "@/server/api/mine-office/mine-office-list";

vi.mock("@/server/api/castle-townhall/townhall-state", () => ({ getTownHall: vi.fn(), upgradeTownHall: vi.fn() }));
vi.mock("@/server/api/castle-townhall/townhall-buy", () => ({ buyCastleBuilding: vi.fn() }));
vi.mock("@/server/api/beta-raid/my-resources", () => ({ getMyResources: vi.fn() }));
vi.mock("@/server/api/mine-office/mine-office-own", () => ({ getMineOffice: vi.fn() }));
vi.mock("@/server/api/mine-office/mine-office-list", () => ({ getMineOfficeMines: vi.fn() }));
vi.mock("@/server/api/mine-office/mine-office-act", () => ({
  officeRepairMine: vi.fn(),
  officeSetMineMode: vi.fn(),
}));
vi.mock("@/server/api/mine-office/mine-office-claim", () => ({
  officeClaimMine: vi.fn(),
  officeClaimAllMines: vi.fn(),
}));
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

const { TownHallMineOffice } = await import("../TownHallMineOffice");
const { TOWN_HALL_KEY } = await import("../useTownHall");
const { MINE_OFFICE_OWNED_KEY } = await import("../useWithMineOffice");
const { CastleRewardRail } = await import("../CastleRewardRail");
const { MineOfficeRow } = await import("./MineOfficeRow");

const render = (node: ReactNode, data: Array<[readonly unknown[], unknown]> = []) => {
  const qc = new QueryClient();
  for (const [key, value] of data) qc.setQueryData(key, value);
  return renderToStaticMarkup(<QueryClientProvider client={qc}>{node}</QueryClientProvider>);
};

const offer = {
  kind: "mine_office",
  cost: { wood: 10_000, stone: 5_000, gold: 5_000, diamonds: 5 },
  max: 1,
  needLevel: 1,
};
const hall = (o: Record<string, unknown>) => ({
  level: 1,
  catalog: [{ ...offer, owned: 0, problem: null, ...o }],
  buildings: [],
  resources: { wood: 20_000, stone: 9_000, gold: 9_000, diamonds: 9 },
});

describe("карточка в Ратуше", () => {
  it("цена владельца и «Построить»", () => {
    const html = render(<TownHallMineOffice ru />, [[TOWN_HALL_KEY, hall({})]]);
    expect(html).toContain("Управление шахтами");
    for (const n of ["10 000", "5 000", ">5<"]) expect(html.replace(/ /g, " ")).toContain(n);
    expect(html).toContain("Построить");
    expect(html).not.toContain('disabled=""');
  });
  it("нет места — погашено с подсказкой; построено — без покупки", () => {
    const slot = render(<TownHallMineOffice ru />, [[TOWN_HALL_KEY, hall({ problem: "slot" })]]);
    expect(slot).toContain("улучши Ратушу");
    expect(slot).toContain('disabled=""');
    const built = render(<TownHallMineOffice ru />, [[TOWN_HALL_KEY, hall({ owned: 1, problem: "max" })]]);
    expect(built).toContain("Построено");
    expect(built).not.toContain("Построить");
  });
});

describe("иконка в замке", () => {
  it("нет здания — нет иконки; есть — появляется", () => {
    const label = "Управление шахтами";
    expect(render(<CastleRewardRail lang="ru" />, [[MINE_OFFICE_OWNED_KEY, { owned: false }]])).not.toContain(label);
    expect(render(<CastleRewardRail lang="ru" />, [[MINE_OFFICE_OWNED_KEY, { owned: true }]])).toContain(label);
  });
});

const NOW = Date.parse("2026-10-25T12:00:00Z");
const mine = (o: Partial<OfficeMine["view"]> = {}): OfficeMine => ({
  mapId: "map_a",
  q: 4,
  r: -1,
  resource: "wood",
  token: null,
  yield: 20,
  claimedHours: 0,
  capturedAt: NOW - 3 * 3_600_000,
  maxHours: 100,
  stepHours: 1,
  kind: "wood",
  level: 2,
  place: "Мир Альфа",
  view: {
    mode: "mid",
    lifeLeft: 1,
    lifeAt: new Date(NOW).toISOString(),
    breakAt: NOW + 72 * 3_600_000,
    broken: false,
    stdYield: 10,
    mult: 2,
    repairCost: { gold: 20 },
    island: false,
    level: 2,
    ...o,
  },
});

describe("строка окна", () => {
  it("своя работающая: место, готово к сбору, режимы и починка", () => {
    const html = render(<MineOfficeRow m={mine()} now={NOW} />);
    expect(html).toContain("Лесопилка");
    expect(html).toContain("Мир Альфа");
    expect(html).toContain("4,-1");
    expect(html).toContain("60");
    expect(html).toContain('role="radiogroup"');
    expect(html).toContain("Починить");
    expect(html).toContain(">Собрать<");
  });
  it("собирать нечего — «Собрать» нет", () => {
    const m = { ...mine(), capturedAt: NOW - 60_000 };
    const html = render(<MineOfficeRow m={m} now={NOW} />);
    expect(html).toContain("готово 0");
    expect(html).not.toContain(">Собрать<");
  });
  it("остров — только запас; сломанная — без кнопок", () => {
    const isle = render(<MineOfficeRow m={mine({ island: true, mode: "base" })} now={NOW} />);
    expect(isle).not.toContain('role="radiogroup"');
    expect(isle).not.toContain("Починить");
    const broken = render(<MineOfficeRow m={mine({ broken: true, breakAt: NOW - 1 })} now={NOW} />);
    expect(broken).toContain("Шахта сломана");
    expect(broken).not.toContain("Починить");
  });
});
