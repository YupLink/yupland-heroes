// «Призвать корабль»: занимается ИМЕННО кандидат, а не первый свободный на его
// клетке. У причала теперь бывает флот, и посадка «по клетке» уводила борт,
// который выборка кандидатов нарочно придержала (только что починен — рядом
// стоит тот, кто чинил: «починил корабль, и он испарился», 20.09).
import { beforeEach, describe, expect, it, vi } from "vitest";

type Seat = { q: number; r: number; bigOnly?: boolean; shipId?: string | null };

type Berth = { id: string; q: number; r: number };

const s = vi.hoisted(() => ({
  /** Что вернула выборка кандидатов (freeShipsNear). */
  candidates: [] as Berth[],
  /** Все свободные борта карты в порядке посадки «по клетке» (seatOnShip без id). */
  fleet: [] as Berth[],
  taken: new Set<string>(),
  seats: [] as Seat[],
  released: 0,
  sql: [] as string[],
}));

vi.mock("../../db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    s.sql.push(sql);
    const id = /WHERE s\.id = '([^']+)'/.exec(sql)?.[1];
    return sql.includes("UPDATE yuplink.beta_raid_ship s") && id ? [{ id }] : [];
  },
}));
vi.mock("../../raidLive", () => ({ publishRaid: () => {} }));
vi.mock("./owner", () => ({ raidOwner: async () => "acc_me" }));
vi.mock("./encounter-where", () => ({
  myMapId: async () => "map_1",
  ownCell: async () => ({ q: 5, r: 5 }),
}));
vi.mock("./castle", () => ({ castleCell: async () => ({ q: 0, r: 0 }) }));
vi.mock("./ships", () => ({
  blockedSql: () => "false",
  freeWaterAround: async () => ({ q: 6, r: 5 }),
}));
vi.mock("./ship-rescue", () => ({ nearestLand: async () => null }));
vi.mock("./ship-crew", () => ({
  myShip: async () => null,
  releaseShip: async () => void s.released++,
  seatOnShip: async (
    _w: string,
    _m: string,
    q: number,
    r: number,
    bigOnly?: boolean,
    shipId?: string | null,
  ) => {
    s.seats.push({ q, r, bigOnly, shipId });
    // Как настоящая посадка: с id — ровно этот борт, без id — первый
    // свободный на клетке в порядке посадки.
    const hit = s.fleet.find(
      (b) => b.q === q && b.r === r && !s.taken.has(b.id) && (!shipId || b.id === shipId),
    );
    return hit ? { id: hit.id, big: false } : null;
  },
}));
vi.mock("./spell-ship-spots", () => ({ freeShipsNear: async () => s.candidates }));
vi.mock("./portal-ship", () => ({
  movePlayerThroughPortal: async () => ({ moved: false, mode: "none" }),
  portalShipContext: async () => ({ exitWater: false, ship: null }),
}));
vi.mock("./spell-create-ship", () => ({ createShipNearHero: async () => null }));
vi.mock("./spell-repair-ship", () => ({ repairShipNearHero: async () => null }));
vi.mock("./hero-buff", () => ({ applyBoostRoll: async () => {} }));
vi.mock("@/lib/hero/boost", () => ({ rollBoostEffect: (e: unknown) => e }));

import { applySpellEffects } from "./spell-effects";
import type { SpellTpl } from "./spell-tpl";

const tpl: SpellTpl = {
  id: "spell_call",
  name: "Призвать корабль",
  description: "",
  image: null,
  effects: [],
  energyCost: 25,
  cooldownMinutes: 230,
  minInt: 5,
  kind: "summon_ship",
  active: true,
};

beforeEach(() => {
  // На клетке двое: только что починенный (его выборка придержала) и старый.
  s.fleet = [
    { id: "ship_fresh", q: 20, r: 20 },
    { id: "ship_old", q: 20, r: 20 },
  ];
  s.candidates = [{ id: "ship_old", q: 20, r: 20 }];
  s.taken = new Set();
  s.seats = [];
  s.released = 0;
  s.sql = [];
});

describe("призыв корабля", () => {
  it("занимает ровно кандидата по id, а не первый свободный на его клетке", async () => {
    const res = await applySpellEffects("w.near", tpl);
    expect(s.seats[0]).toMatchObject({ q: 20, r: 20, shipId: "ship_old" });
    expect(res).toMatchObject({ ok: true, ship: { id: "ship_old", q: 6, r: 5 } });
  });

  it("кандидата увели — следующий с той же клетки тоже берётся по своему id", async () => {
    s.fleet = [
      { id: "ship_a", q: 20, r: 20 },
      { id: "ship_b", q: 20, r: 20 },
    ];
    s.candidates = [...s.fleet];
    s.taken.add("ship_a");
    const res = await applySpellEffects("w.near", tpl);
    expect(s.seats.map((x) => x.shipId)).toEqual(["ship_a", "ship_b"]);
    expect(res).toMatchObject({ ok: true, ship: { id: "ship_b" } });
  });

  it("переезд не упирается в корабли на клетке и экипаж снимается", async () => {
    await applySpellEffects("w.near", tpl);
    const move = s.sql.find((x) => x.includes("UPDATE yuplink.beta_raid_ship s")) ?? "";
    expect(move).toContain("SET q = 6, r = 5");
    expect(move).not.toContain("NOT EXISTS");
    expect(s.released).toBe(1);
  });

  it("свободный и так рядом — отказ, борт отпущен", async () => {
    s.fleet = [{ id: "ship_near", q: 6, r: 5 }];
    s.candidates = [...s.fleet];
    const res = await applySpellEffects("w.near", tpl);
    expect(res).toEqual({ ok: false, reasonKey: "spell.ship_already_near" });
    expect(s.released).toBe(1);
    expect(s.sql.some((x) => x.includes("UPDATE yuplink.beta_raid_ship s"))).toBe(false);
  });
});
