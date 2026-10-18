// Тап по разбитому кораблю издалека: герой идёт вплотную (с берега тоже), и по
// приходу открывается окно корабля с починкой (жалоба 12.10.2026: с верфи
// «не могу пойти на клетку, чтобы починить корабль»).
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ShipMark } from "./drawShips";

const toast = vi.hoisted(() => Object.assign(vi.fn(), { error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
vi.mock("@/lib/i18n", () => ({ useT: () => (k: string) => k }));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn(), getQueryData: vi.fn() }),
}));
// Хук прибытия живёт на useRef/useEffect — вне рендера даём им простые замены.
vi.mock("react", async (orig) => ({
  ...(await orig<typeof import("react")>()),
  useRef: (v: unknown) => ({ current: v }),
  useEffect: (fn: () => void) => void fn(),
}));

import { useCellTap } from "./useCellTap";
import { useApproachDone } from "./useApproachDone";

const mark = (over: Partial<ShipMark>): ShipMark => ({
  total: 1,
  busy: 0,
  free: 0,
  mine: false,
  big: true,
  mineBig: false,
  broken: 0,
  hp: 0,
  hpMax: 2000,
  ...over,
});

function useTapper(ships: Map<string, ShipMark>, playerPos = { q: 0, r: 0 }) {
  const spies = {
    approachCell: vi.fn(),
    handleCellClick: vi.fn(() => false),
    openShip: vi.fn(),
  };
  const tap = useCellTap({
    cells: {},
    objects: {},
    playerPos,
    ships,
    terrains: {},
    onShip: false,
    interact: vi.fn(),
    openBuilding: vi.fn(),
    ...spies,
  });
  return { tap, ...spies };
}

beforeEach(() => vi.clearAllMocks());

describe("тап по разбитому кораблю", () => {
  it("издалека — подойти вплотную с любой стороны, с починкой по приходу", () => {
    const { tap, approachCell, handleCellClick } = useTapper(
      new Map([["2,0", mark({ broken: 1 })]]),
    );
    tap(2, 0);
    expect(approachCell).toHaveBeenCalledWith(
      2,
      0,
      { kind: "ship", q: 2, r: 0, extraCost: 0 },
      "braid.ship_wreck_far",
      true,
    );
    // На сам обломок не садятся — маршрут «на борт» не ищем.
    expect(handleCellClick).not.toHaveBeenCalled();
  });

  it("рядом — сразу окно корабля, как и раньше", () => {
    const { tap, openShip, approachCell } = useTapper(new Map([["1,0", mark({ broken: 1 })]]));
    tap(1, 0);
    expect(openShip).toHaveBeenCalledTimes(1);
    expect(approachCell).not.toHaveBeenCalled();
  });

  it("свободное судно издалека — прежний маршрут на борт", () => {
    const { tap, handleCellClick, approachCell } = useTapper(
      new Map([["2,0", mark({ free: 1, broken: 1 })]]),
    );
    tap(2, 0);
    expect(handleCellClick).toHaveBeenCalledWith(2, 0);
    expect(approachCell).not.toHaveBeenCalled();
  });
});

describe("прибытие к разбитому кораблю", () => {
  const step = [{ q: 1, r: 0, cost: 3 }];
  const useDone = (ships: Map<string, ShipMark>, openShip = vi.fn()) => ({
    openShip,
    run: useApproachDone({
      cells: {},
      objects: {},
      pendingPath: step,
      pendingAction: { kind: "ship", q: 2, r: 0, extraCost: 0 },
      moveAlongPath: async () => true,
      openBuilding: vi.fn(),
      interact: vi.fn(),
      ships,
      openShip,
    }),
  });

  it("дошли — открываем окно этого корабля", async () => {
    const m = mark({ broken: 1 });
    const { run, openShip } = useDone(new Map([["2,0", m]]));
    await run();
    expect(openShip).toHaveBeenCalledWith({ q: 2, r: 0, mark: m });
  });

  it("корабля уже нет — говорим, что цель пропала", async () => {
    const { run, openShip } = useDone(new Map());
    await run();
    expect(openShip).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith("braid.target_gone");
  });
});
