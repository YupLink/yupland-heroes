// Вход в портал по комнатам этажей (владелец, 07.10.2026): выход — любой другой
// портал комнаты на открытом этаже; на закрытый этаж не пускает до оплаты;
// переход на другой этаж оставляет судно у входа, пишет игроку новую карту и
// отдаёт её клиенту; своя комната — как раньше, с кораблём и без смены карты.
import { beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({
  cfg: {} as Record<string, unknown>,
  live: true,
  exits: [] as Array<{ mapId: string; q: number; r: number }>,
  rooms: [] as unknown[],
  paid: 0,
  refunded: 0,
  left: 0,
  moved: true,
  moves: [] as unknown[][],
  ctxs: [] as unknown[][],
  events: [] as unknown[],
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const fn = { inputValidator: () => fn, handler: (h: unknown) => h };
    return fn;
  },
}));
vi.mock("./gate", () => ({ requireBetaRaid: async () => "me.near" }));
vi.mock("./encounter-where", () => ({
  myMapId: async () => "map_a",
  playerCell: async () => ({ q: 1, r: 1 }),
  requireAdjacent: () => {},
}));
vi.mock("./voidGate", () => ({ requireNotVoid: async () => {} }));
vi.mock("./building-action", () => ({
  loadCellBuilding: async () => ({
    effect: "portal",
    tier: 0,
    tiers: [{}],
    config: { portal: s.cfg },
  }),
}));
vi.mock("./hero-current", () => ({ selectedHeroRow: async () => ({ level: 10 }) }));
vi.mock("./floors", () => ({ isLiveMap: async () => s.live }));
vi.mock("./portal-exits", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  portalExits: async (room: unknown) => {
    s.rooms.push(room);
    return s.exits;
  },
  pickExit: (cells: unknown[]) => cells[0] ?? null,
}));
vi.mock("./portal-pay", () => ({
  payPortal: async () => void s.paid++,
  refundPortal: async () => void s.refunded++,
}));
vi.mock("./portal-ship", () => ({
  portalShipContext: async (...a: unknown[]) => {
    s.ctxs.push(a);
    return { ship: { id: "ship_me" }, exitWater: a[1] === "map_b" };
  },
  leaveShipBehind: async () => {
    s.left++;
    return true;
  },
  movePlayerThroughPortal: async (...a: unknown[]) => {
    s.moves.push(a);
    return { moved: s.moved, mode: "none" };
  },
}));
vi.mock("../../raidLive", () => ({ publishRaid: (e: unknown) => s.events.push(e) }));
vi.mock("./owner", () => ({ raidOwner: async () => "acc_me" }));
vi.mock("./econ/trade-hooks", () => ({ notePricesPaid: async () => {} }));

const { enterBetaPortal } = await import("./portal-use");
const enter = enterBetaPortal as unknown as (a: {
  data: { q: number; r: number };
}) => Promise<{ map: string | null; q: number; r: number }>;

beforeEach(() => {
  Object.assign(s, {
    cfg: { group: 3 },
    live: true,
    exits: [],
    rooms: [],
    paid: 0,
    refunded: 0,
    left: 0,
    moved: true,
    moves: [],
    ctxs: [],
    events: [],
  });
});

describe("enterBetaPortal: комнаты по этажам", () => {
  it("своя комната — выход на своём этаже, с кораблём, без смены карты", async () => {
    s.exits = [{ mapId: "map_a", q: 5, r: 5 }];
    const res = await enter({ data: { q: 1, r: 2 } });
    expect(s.rooms).toEqual([{ mapId: "map_a", group: 3 }]);
    expect(s.ctxs[0]?.[1]).toBe("map_a");
    expect(s.left).toBe(0);
    expect(s.moves[0]?.[1]).toBe("map_a");
    expect(s.moves[0]?.[3]).toEqual({ ship: { id: "ship_me" }, exitWater: false });
    expect(s.moves[0]?.[4]).toBeUndefined();
    expect(res.map).toBeNull();
  });

  it("комната другого этажа — переход туда: судно у входа, новая карта игроку", async () => {
    s.cfg = { group: 1, targetMap: "map_b" };
    s.exits = [{ mapId: "map_b", q: 7, r: 8 }];
    const res = await enter({ data: { q: 1, r: 2 } });
    expect(s.rooms).toEqual([{ mapId: "map_b", group: 1 }]);
    expect(s.left).toBe(1);
    // Вода выхода — на этаже назначения; судна там у игрока нет.
    expect(s.moves[0]?.[1]).toBe("map_b");
    expect(s.moves[0]?.[3]).toEqual({ ship: null, exitWater: true });
    expect(res).toMatchObject({ map: "map_b", q: 7, r: 8 });
    // Судно осталось у входа — событие прежнему этажу; «ушёл» и «пришёл» — каждому свой.
    expect(s.events).toContainEqual({ mapId: "map_a", type: "ships" });
    expect(s.events).toContainEqual({ mapId: "map_a", type: "moved" });
    expect(s.events).toContainEqual({ mapId: "map_b", type: "moved" });
  });

  it("своя комната, но выход на другом этаже — тоже переход между картами", async () => {
    s.exits = [{ mapId: "map_c", q: 0, r: 0 }];
    const res = await enter({ data: { q: 1, r: 2 } });
    expect(s.rooms).toEqual([{ mapId: "map_a", group: 3 }]);
    expect(s.moves[0]?.[1]).toBe("map_c");
    expect(res.map).toBe("map_c");
  });

  it("этаж комнаты закрыт — отказ до оплаты", async () => {
    s.cfg = { group: 1, targetMap: "map_b" };
    s.live = false;
    s.exits = [{ mapId: "map_b", q: 7, r: 8 }];
    await expect(enter({ data: { q: 1, r: 2 } })).rejects.toThrow("braid.portal_floor_closed");
    expect(s.paid).toBe(0);
    expect(s.moves).toHaveLength(0);
  });

  it("в комнате нет второго портала — отказ до оплаты", async () => {
    await expect(enter({ data: { q: 1, r: 2 } })).rejects.toThrow("braid.portal_alone");
    s.cfg = { group: 1, targetMap: "map_b" };
    await expect(enter({ data: { q: 1, r: 2 } })).rejects.toThrow("braid.portal_floor_empty");
    expect(s.paid).toBe(0);
  });

  it("перенос не удался — деньги назад", async () => {
    s.exits = [{ mapId: "map_b", q: 7, r: 8 }];
    s.moved = false;
    await expect(enter({ data: { q: 1, r: 2 } })).rejects.toThrow("Портал не сработал");
    expect(s.paid).toBe(1);
    expect(s.refunded).toBe(1);
  });
});
