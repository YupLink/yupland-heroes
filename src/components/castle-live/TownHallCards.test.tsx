// Карточки Ратуши (ПРАВИЛА §8.64): уровень и места; Храм — «Купить» с ценой,
// «есть · альфа-тест» у выданного, без кнопки при «нет места».
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/server/api/castle-townhall/townhall-state", () => ({ getTownHall: vi.fn(), upgradeTownHall: vi.fn() }));
vi.mock("@/server/api/castle-townhall/townhall-buy", () => ({ buyCastleBuilding: vi.fn() }));
vi.mock("@/server/api/beta-raid/my-resources", () => ({ getMyResources: vi.fn() }));
const { TownHallLevel } = await import("./TownHallLevel");
const { TownHallTemple } = await import("./TownHallTemple");
const { TOWN_HALL_KEY } = await import("./useTownHall");

const temple = { kind: "temple", cost: { wood: 20, stone: 0, gold: 0, diamonds: 0 }, max: 1, needLevel: 1 };
const view = (over: Record<string, unknown>) => ({
  level: 2,
  maxLevel: 9,
  cost: { wood: 4_000, stone: 600, gold: 2_000, diamonds: 5 },
  slots: { limit: 15, used: 3, free: 12, nextLimit: 22, base: 0 },
  buildings: [],
  legacy: { casino: false, auction: true, architect: true },
  catalog: [{ ...temple, owned: 0, problem: null }],
  decor: { owned: [], prices: {} },
  resources: { wood: 5_000, stone: 100, gold: 3_000, diamonds: 0 },
  ...over,
});
const render = (node: React.ReactNode, data: unknown) => {
  const qc = new QueryClient();
  qc.setQueryData(TOWN_HALL_KEY, data);
  return renderToStaticMarkup(<QueryClientProvider client={qc}>{node}</QueryClientProvider>);
};

describe("карточка уровня Ратуши", () => {
  it("уровень, занято мест, лимит после улучшения, нехватка подсвечена", () => {
    const html = render(<TownHallLevel ru />, view({}));
    expect(html).toContain("ур. 2/9");
    expect(html).toContain("зданий: 3/15");
    expect(html).toContain(" → 22");
    expect(html).toContain("town-hall-build__lack");
    expect(html).toContain("Улучшить");
  });
  it("9-й уровень — без цены и кнопки", () => {
    const html = render(<TownHallLevel ru={false} />, view({ level: 9, cost: null }));
    expect(html).not.toContain("Upgrade");
  });
});

describe("карточка Храма", () => {
  it("нет храма — цена 20 дерева и «Купить»", () => {
    const html = render(<TownHallTemple ru />, view({}));
    expect(html).toContain("Купить");
    expect(html).toContain(">20<");
    expect(html).not.toContain('disabled=""');
  });
  it("нет места — кнопка погашена, подсказка «улучши Ратушу»", () => {
    const html = render(<TownHallTemple ru />, view({ catalog: [{ ...temple, owned: 0, problem: "slot" }] }));
    expect(html).toContain("улучши Ратушу");
    expect(html).toContain('disabled=""');
  });
  it("храм альфа-тестера — «есть», без покупки", () => {
    const html = render(
      <TownHallTemple ru />,
      view({
        buildings: [{ id: "cb_a", kind: "temple", source: "alpha", createdAt: "" }],
        catalog: [{ ...temple, owned: 1, problem: "max" }],
      }),
    );
    expect(html).toContain("есть · альфа-тест");
    expect(html).not.toContain("Купить");
  });
});
