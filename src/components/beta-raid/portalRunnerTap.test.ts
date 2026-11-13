// Тап по постройке, под которой спрятался беглец (жалоба 21.10.2026: портал
// среди воды, герой стоит на нём, тап — «Туда не пройти»). Стоишь на постройке
// — открывается её окно; рядом — бой с беглецом; издалека — подойти к нему.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }));
vi.mock("@/lib/i18n", () => ({ useT: () => (k: string) => k }));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn(), getQueryData: vi.fn() }),
}));

import { useCellTap } from "./useCellTap";
import type { Cell } from "./unpackMap";

const portal = {
  terrainId: "t",
  buildingId: "building_portal",
  objectId: "obj_1",
  runner: true,
} as unknown as Cell;

function useTapper(playerPos: { q: number; r: number }) {
  const spies = {
    approachCell: vi.fn(),
    handleCellClick: vi.fn(() => false),
    openShip: vi.fn(),
    interact: vi.fn(),
    openBuilding: vi.fn(),
  };
  const tap = useCellTap({
    cells: { "0,0": portal },
    objects: { obj_1: { id: "obj_1", meta: {} } } as never,
    playerPos,
    ships: new Map(),
    terrains: {},
    onShip: false,
    ...spies,
  });
  return { tap, ...spies };
}

beforeEach(() => vi.clearAllMocks());

describe("постройка с беглецом под ней", () => {
  it("стою на портале — открывается портал, никуда не уводит", () => {
    const s = useTapper({ q: 0, r: 0 });
    s.tap(0, 0);
    expect(s.openBuilding).toHaveBeenCalledWith({ q: 0, r: 0 });
    expect(s.approachCell).not.toHaveBeenCalled();
    expect(s.interact).not.toHaveBeenCalled();
  });

  it("рядом — бой с беглецом, как раньше", () => {
    const s = useTapper({ q: 1, r: 0 });
    s.tap(0, 0);
    expect(s.interact).toHaveBeenCalledTimes(1);
    expect(s.openBuilding).not.toHaveBeenCalled();
  });

  it("издалека — подойти к беглецу, как раньше", () => {
    const s = useTapper({ q: 3, r: 0 });
    s.tap(0, 0);
    expect(s.approachCell).toHaveBeenCalledTimes(1);
    expect(s.openBuilding).not.toHaveBeenCalled();
  });
});
