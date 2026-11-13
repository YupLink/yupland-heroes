// Лопата в руках: «Копать» издалека ведёт сразу, двойной тап — дело одним жестом
// (12.11.2026, тестер: «два раза два тыка, хотя лопата уже в руках»).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const waitFor = (f: () => void) => vi.waitFor(f, { timeout: 500 });

// Хук зовём как функцию: эффекты — сразу, мутация — её mutationFn (DOM-среды в проекте нет).
vi.mock("react", async (orig) => ({
  ...(await orig<typeof import("react")>()),
  useEffect: (f: () => void) => void f(),
  useRef: <T,>(v: T) => ({ current: v }),
}));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ getQueryData: () => undefined }),
  useMutation: (o: { mutationFn: (v: unknown) => unknown }) => ({
    mutate: (v: unknown) => void o.mutationFn(v),
  }),
}));

const s = vi.hoisted(() => ({ dig: vi.fn(async (_: unknown) => ({ found: 0 })) }));

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock("@/lib/i18n", () => ({ useT: () => (k: string) => k }));
vi.mock("@/lib/query", () => ({ invalidateBackpack: vi.fn() }));
vi.mock("@/components/beta-raid/hud/useHarvest", () => ({ HARVEST_KEY: ["harvest"] }));
vi.mock("@/components/beta-raid/market/priceLabel", () => ({ resPriceText: () => "" }));
vi.mock("@/components/beta-raid/market/num", () => ({ numText: String }));
vi.mock("@/server/api/beta-raid/main-tool/ground-dig", () => ({
  digGround: (a: { data: unknown }) => s.dig(a.data),
}));
vi.mock("@/server/api/beta-raid/main-tool/hole-bury", () => ({ buryHole: vi.fn() }));
vi.mock("@/server/api/beta-raid/plain-chest/pchest-dig", () => ({ buryChest: vi.fn() }));
vi.mock("@/server/api/beta-raid/loot-bag/bag-read", () => ({ getLootBagsAt: vi.fn() }));
vi.mock("@/components/beta-raid/usePathfinding", () => ({
  DIRS: [
    { q: 1, r: 0 },
    { q: 1, r: -1 },
    { q: 0, r: -1 },
    { q: -1, r: 0 },
    { q: -1, r: 1 },
    { q: 0, r: 1 },
  ],
  isWaterCell: () => false,
}));
vi.mock("@/components/beta-raid/loot-bag/useLootBagActions", () => ({
  useLootBagActions: () => ({ dig: { mutate: vi.fn() } }),
}));
vi.mock("@/components/beta-raid/plain-chest/plainChestLive", () => ({ refreshPlain: vi.fn() }));
vi.mock("@/components/beta-raid/loot-bag/lootBagLive", () => ({ invalidateBags: vi.fn() }));
vi.mock("@/components/beta-raid/open-pass/useOpenStorage", () => ({ invalidateEnergy: vi.fn() }));
vi.mock("@/components/beta-raid/tool/useMainTool", () => ({
  useMainTool: () => ({ main: { shovel: true } }),
}));
vi.mock("@/components/beta-raid/tool/shovelAct", () => ({ shovelActAt: () => "dig" }));
vi.mock("@/components/beta-raid/mergeBlocks", () => ({ inBuildingBlock: () => false }));
vi.mock("@/components/beta-raid/mapStore", () => ({ storeOf: () => ({}) }));
vi.mock("@/components/beta-raid/hand/handStore", () => ({ getHand: () => null }));

import { useShovel } from "./useShovel";
import { shovelOffer } from "./shovelOffer";

type Approach = (...a: unknown[]) => Promise<boolean> | void;

function setup(approach: Approach) {
  const approachCell = vi.fn(approach);
  const clearPending = vi.fn();
  const tap = useShovel({
    pos: { q: 0, r: 0 },
    cells: {},
    bags: {},
    chests: undefined,
    ships: new Map(),
    holes: new Set<string>(),
    approachCell,
    clearPending,
  });
  return { tap, approachCell, clearPending };
}

let now = 1_000_000;
beforeEach(() => {
  s.dig.mockClear();
  vi.spyOn(Date, "now").mockImplementation(() => now);
});
afterEach(() => {
  vi.restoreAllMocks();
  shovelOffer.set(null);
});

describe("useShovel: копать за один-два тапа", () => {
  it("«Копать» издалека — герой идёт сразу, по приходу копает", async () => {
    const h = setup(() => Promise.resolve(true));
    h.tap(5, 5);
    let closed = false;
    closed = shovelOffer.go();
    expect(closed).toBe(true);
    expect(h.approachCell.mock.calls[0]?.[5]).toBe(true);
    await waitFor(() => expect(s.dig).toHaveBeenCalledTimes(1));
    expect(s.dig.mock.calls[0]?.[0]).toMatchObject({ q: 5, r: 5 });
  });

  it("дверь на пути (маршрут предложен плашкой) — кнопка не закрывает плашку, копки нет", () => {
    const h = setup(() => undefined);
    h.tap(5, 5);
    let closed = true;
    closed = shovelOffer.go();
    expect(closed).toBe(false);
    expect(shovelOffer.get()).toMatchObject({ q: 5, r: 5, near: false });
    expect(s.dig).not.toHaveBeenCalled();
  });

  it("не дошёл (кончилась энергия) — не копает, предложение снято", async () => {
    const h = setup(() => Promise.resolve(false));
    h.tap(5, 5);
    shovelOffer.go();
    await waitFor(() => expect(shovelOffer.get()).toBeNull());
    expect(s.dig).not.toHaveBeenCalled();
  });

  it("двойной тап вплотную — копает сразу, плашка маршрута снята", async () => {
    const h = setup(() => Promise.resolve(true));
    let taken = false;
    h.tap(1, 0);
    now += 200;
    taken = h.tap(1, 0);
    expect(taken).toBe(true);
    expect(h.clearPending).toHaveBeenCalled();
    expect(h.approachCell).not.toHaveBeenCalled();
    await waitFor(() => expect(s.dig).toHaveBeenCalledTimes(1));
  });

  it("двойной тап издалека — сразу идёт и копает", async () => {
    const h = setup(() => Promise.resolve(true));
    h.tap(5, 5);
    now += 300;
    h.tap(5, 5);
    await waitFor(() => expect(s.dig).toHaveBeenCalledTimes(1));
    expect(h.approachCell.mock.calls[0]?.[5]).toBe(true);
  });

  it("два тапа реже 0,4 с — это два обычных тапа, копки нет", () => {
    const h = setup(() => Promise.resolve(true));
    h.tap(5, 5);
    now += 1000;
    let taken = true;
    taken = h.tap(5, 5);
    expect(taken).toBe(false);
    expect(h.approachCell).not.toHaveBeenCalled();
    expect(s.dig).not.toHaveBeenCalled();
  });
});
