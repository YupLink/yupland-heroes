// Архитектор глазами игрока: карточка Ратуши (постройка/улучшение, что откроет,
// вход к заготовкам — с 1-го уровня, Строителю или админу) и окно заготовок
// (дерево — «Изготовить», камень — «с 2-го ур.», золото — «с 3-го», алмазы —
// «с 4-го»; не хватает ресурса или товара — кнопка выключена, товар красный).
// «Хватает ли» ресурсов — по общему кэшу ресурсов, а не по снимку Архитектора.
// Админу — «Изменить цены». ru и en. Рендер на сервере.
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { CastleArchitectState } from "@/server/api/castle-architect/architect-state";
import type { ArchitectGoodView } from "@/lib/castleArchitectGoods";
import { BLUEPRINT_LEVEL, DEFAULT_ARCHITECT_CONFIG as D, craftProblem } from "@/lib/castleArchitect";
import { BLUEPRINT_RESOURCES } from "@/lib/mineBlueprint";

vi.mock("sonner", () => ({ toast: Object.assign(() => {}, { error: () => {}, success: () => {} }) }));
vi.mock("@/server/api/castle-architect/architect-state", () => ({
  getCastleArchitect: () => Promise.reject(new Error("в тесте — из кэша")),
  upgradeCastleArchitect: () => Promise.reject(new Error("в тесте сети нет")),
}));
vi.mock("@/server/api/castle-architect/craft", () => ({
  craftMineBlueprint: () => Promise.reject(new Error("в тесте сети нет")),
}));
vi.mock("@/server/api/user-auth", () => ({
  getSession: () => Promise.reject(new Error("в тесте — из кэша")),
}));
vi.mock("@/server/api/castle-architect/architect-config", () => ({
  getArchitectAdmin: () => Promise.reject(new Error("в тесте сети нет")),
  saveArchitectAdmin: () => Promise.reject(new Error("в тесте сети нет")),
}));

const { TownHallArchitect } = await import("../TownHallArchitect");
const { ArchitectScreen } = await import("./ArchitectScreen");
const { ARCHITECT_KEY } = await import("../useWithArchitect");
const { RESOURCES_KEY } = await import("@/lib/hooks/useResources");

function state(
  level: number,
  builder = false,
  resources: Record<string, number> = {},
  goods: ArchitectGoodView[] = [],
): CastleArchitectState {
  return {
    level,
    maxLevel: 4,
    cost: level >= 4 ? null : D.levels[level],
    costGoods: goods,
    resources,
    hero: { name: "Юпик", builder },
    blueprints: BLUEPRINT_RESOURCES.map((kind) => ({
      kind,
      needLevel: BLUEPRINT_LEVEL[kind],
      cost: D.blueprints[kind],
      goods,
      problem: craftProblem(kind, level, builder),
      boost: { level: 0, mult: 1, capture: 10, next: { diamonds: 2, mult: 2 } },
    })),
  };
}

/** shared — общий кэш ресурсов (RESOURCES_KEY); нет — карточка берёт снимок. */
function html(
  s: CastleArchitectState,
  node: ReactNode,
  shared?: Record<string, number>,
  admin = false,
): string {
  const qc = new QueryClient();
  qc.setQueryData(ARCHITECT_KEY, s);
  qc.setQueryData(["session"], { isAdmin: admin });
  if (shared) qc.setQueryData(RESOURCES_KEY, shared);
  return renderToStaticMarkup(<QueryClientProvider client={qc}>{node}</QueryClientProvider>);
}

const RICH = { wood: 1e6, stone: 1e6, gold: 1e6, diamonds: 1e6 };
const BOARD: ArchitectGoodView = { key: "custom:cst_board", name: "Доска", qty: 3, image: null, have: 5 };

describe("карточка в Ратуше", () => {
  it("не построен: «Построить», что откроет, без входа к заготовкам", () => {
    const h = html(state(0), <TownHallArchitect ru />);
    expect(h).toContain("Архитектор");
    expect(h).toContain("ур. 0/4");
    expect(h).toContain("откроет: Лесопилка");
    expect(h).toContain("Построить");
    expect(h).not.toContain("Заготовки шахт");
  });

  it("герою-Строителю вход к заготовкам есть и без постройки", () => {
    expect(html(state(0, true), <TownHallArchitect ru />)).toContain("Заготовки шахт");
  });

  it("4-й уровень: ни цены, ни «Улучшить»; en", () => {
    const h = html(state(4, false, RICH), <TownHallArchitect ru={false} />);
    expect(h).toContain("Lv 4/4");
    expect(h).not.toContain("Upgrade");
    expect(h).toContain("Mine blueprints");
  });

  it("ресурсов мало — кнопка выключена, улучшение — «Улучшить»", () => {
    const h = html(state(1), <TownHallArchitect ru />);
    expect(h).toContain("Улучшить");
    expect(h).toMatch(/<button[^>]*disabled=""[^>]*>.*Улучшить/);
  });

  it("ресурсы — из общего кэша: снимок «беден», а после банка хватает", () => {
    const UP = /<button[^>]*disabled=""[^>]*>.*Улучшить/;
    expect(html(state(1), <TownHallArchitect ru />, RICH)).not.toMatch(UP);
    expect(html(state(1, false, RICH), <TownHallArchitect ru />, {})).toMatch(UP);
  });

  it("золотая и алмазная делаются — без «(скоро)»", () => {
    expect(html(state(1), <TownHallArchitect ru />)).toContain("откроет: Каменная шахта<");
    expect(html(state(2), <TownHallArchitect ru />)).toContain("откроет: Золотая шахта<");
    expect(html(state(3), <TownHallArchitect ru={false} />)).toContain("unlocks: Diamond mine<");
  });

  it("товар в цене уровня: имя и штуки; не хватает — красный, кнопка выключена", () => {
    const UP = /<button[^>]*disabled=""[^>]*>.*Улучшить/;
    const lack = [{ ...BOARD, have: 1 }];
    const h = html(state(1, false, RICH, lack), <TownHallArchitect ru />, RICH);
    expect(h).toMatch(/class="town-hall-build__lack"[^>]*><svg.*?Доска<\/span>×3/);
    expect(h).toMatch(UP);
    expect(html(state(1, false, RICH, [BOARD]), <TownHallArchitect ru />, RICH)).not.toMatch(UP);
  });

  it("админу вход к заготовкам есть и без постройки (правка цен — в окне)", () => {
    expect(html(state(0), <TownHallArchitect ru />, undefined, true)).toContain("Заготовки шахт");
  });
});

describe("окно заготовок", () => {
  it("уровень 1: дерево — изготовить, камень — со 2-го, золото — с 3-го, алмазы — с 4-го", () => {
    const h = html(state(1, false, RICH), <ArchitectScreen ru />);
    expect(h).toContain("Лесопилка");
    expect(h).toContain("Изготовить");
    expect(h).toContain("с 2-го ур.");
    expect(h).toContain("с 3-го ур.");
    expect(h).toContain("с 4-го ур.");
    expect(h).not.toContain("скоро");
    expect(h).not.toMatch(/<button[^>]*disabled=""[^>]*>[^<]*Изготовить/);
  });

  it("Строитель на уровне 0 делает все четыре; en", () => {
    const h = html(state(0, true, RICH), <ArchitectScreen ru={false} />);
    expect(h.match(/>Craft</g)).toHaveLength(4);
    expect(h).toContain("Builder");
    expect(h).not.toContain("soon");
  });

  it("товары в цене заготовки: не хватает — красные, «Изготовить» выключена", () => {
    const OFF = /<button[^>]*disabled=""[^>]*>[^<]*Изготовить/g;
    const lack = html(state(4, false, RICH, [{ ...BOARD, have: 2 }]), <ArchitectScreen ru />, RICH);
    expect(lack).toContain("text-[#f0948a]");
    expect(lack).toMatch(/Доска<\/span>×3/);
    expect(lack.match(OFF)).toHaveLength(4);
    expect(html(state(4, false, RICH, [BOARD]), <ArchitectScreen ru />, RICH).match(OFF)).toBeNull();
  });

  it("«Изменить цены» — только админу; en", () => {
    expect(html(state(1, false, RICH), <ArchitectScreen ru />)).not.toContain("Изменить цены");
    expect(html(state(1, false, RICH), <ArchitectScreen ru />, RICH, true)).toContain("Изменить цены");
    expect(html(state(1), <ArchitectScreen ru={false} />, RICH, true)).toContain("Edit prices");
  });

  it("не хватает ресурсов — «Изготовить» выключена", () => {
    const h = html(state(2), <ArchitectScreen ru />);
    expect(h.match(/<button[^>]*disabled=""[^>]*>[^<]*Изготовить/g)).toHaveLength(2);
  });

  it("хватает ли — по общему кэшу ресурсов, а не по снимку Архитектора", () => {
    const OFF = /<button[^>]*disabled=""[^>]*>[^<]*Изготовить/g;
    expect(html(state(2), <ArchitectScreen ru />, RICH).match(OFF)).toBeNull();
    expect(html(state(2, false, RICH), <ArchitectScreen ru />, {}).match(OFF)).toHaveLength(2);
  });
});
