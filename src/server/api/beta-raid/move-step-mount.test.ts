// Шаг с конём (§8.84): прыжок пегаса через клетку за 10 энергии + клетку, только пегасу и не на
// воду; тормоз частоты сервера — по коню героя; пачка шагов — по порядку до отказа.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { JUMP_ENERGY } from "@/lib/hero/mount";

type Cell = { q: number; r: number };
const s = vi.hoisted(() => ({
  pos: { q: 0, r: 0 } as Cell | null,
  energy: 100,
  mult: 1 as number | { step: number; ship: number },
  cellCost: 2,
  spends: [] as number[],
  points: [] as Array<{ metric: string; qty: number; ref: string }>,
  reads: 0,
  gate: [] as string[],
  gateFail: false,
  /** Что успело случиться между чтением позиции и записью шага. */
  afterRead: null as null | (() => void),
  /** Ответ первой попытки пропал после коммита — мост повторил вслепую. */
  lostReply: false,
  /** Метки записанных шагов (ключ нажатия). */
  marks: new Set<string>(),
  /** Клетка-цель — вода с причалом и дверь с платой. */
  water: false,
  toll: false,
  released: 0,
  refunds: 0,
  mount: "none" as string,
  mountPct: 0 as number,
  limits: [] as number[],
}));

vi.mock("./move-weather", () => ({ stepMultOf: async () => s.mult }));
vi.mock("../../db/mcpClient", () => ({
  mcpExec: async () => {
    throw new Error("в этом тесте база — только через подделки модулей");
  },
}));
vi.mock("../../db/pg", () => ({
  sb: { rpc: async () => ({ data: [{ energy_now: s.energy }], error: null }) },
}));
vi.mock("../../perf/trace", () => ({ stopwatch: () => ({ lap: () => {}, done: () => {} }) }));
vi.mock("../../raidLive", () => ({ publishRaid: () => {} }));
vi.mock("../../rateGate", () => ({
  rateGate: async (key: string, o: { limit: number }) => {
    s.gate.push(key);
    s.limits.push(o.limit);
    if (s.gateFail) throw new Error("braid.step_too_fast");
  },
}));
vi.mock("./owner", () => ({ raidOwner: async () => "acc_me" }));
vi.mock("./encounter-where", () => ({ playerMapId: async () => "map_1" }));
vi.mock("./castle", () => ({ mapSizeOf: async () => 128 }));
// Первый выход без позиции — у замка (castle-door.startCell); в тесте — центр
// карты 128, как давал прежний getCastlePosition.
vi.mock("./castle-door", () => ({ startCell: async () => ({ q: 32, r: 64 }) }));
vi.mock("./encounter-effects", () => ({ slowExtraCost: async () => 0 }));
vi.mock("./hero-mount", () => ({
  heroMountTier: async () => s.mount,
  heroMount: async () => ({ tier: s.mount, pct: s.mountPct ?? 0 }),
  dropHeroMount: () => {},
}));
vi.mock("./hero-power", () => ({
  loadHeroPower: async () => ({
    heroId: "h1",
    field: { stepDiscountPct: 0 },
    satiety: { now: 100, max: 100, hungry: false },
    mount: s.mount,
  }),
  invalidateHeroPower: () => {},
}));
vi.mock("./flee-move", () => ({ fleeAroundStep: async () => [] }));
vi.mock("./step-object", () => ({ objectInfoOf: async () => null }));
vi.mock("./econ/energy-note", () => ({ noteEnergySpend: async () => {} }));
vi.mock("./move-energy-spent", () => ({ bumpMoveEnergy: async () => {} }));
vi.mock("./gate-toll", () => ({
  chargeGateOnStep: async () =>
    s.toll ? { refund: async () => void s.refunds++, note: () => {} } : null,
}));
vi.mock("../tournament/tour-note", () => ({
  noteTournament: async (_acc: string, metric: string, qty: number, ref: string) =>
    void s.points.push({ metric, qty, ref }),
}));
vi.mock("./step-facts", () => ({
  stepBlockedReason: () => null,
  loadStepFacts: async () => ({
    terrainId: "grass",
    decorationId: null,
    decorationBlocks: false,
    objectId: null,
    objectKnown: false,
    voidFog: false,
    hpFound: false,
    hpValue: null,
    water: s.water,
    ocean: false,
    cost: s.cellCost,
    berth: s.water ? { ships: 1, busy: 0 } : null,
    gate: s.toll ? { name: "Дверь", config: { prices: [] } } : null,
  }),
}));
// Позиция читается обычным SELECT — снимок в момент чтения, и все запросы
// пачки успевают прочитать её до первой записи (как на живой базе).
vi.mock("./ship-move", () => ({
  loadRide: async () => {
    s.reads++;
    const cell = s.pos ? { ...s.pos } : null;
    await new Promise((r) => setTimeout(r, 5));
    s.afterRead?.();
    return { cell, ship: null };
  },
}));
// Оператор шага: CAS позиции + плата за применённый шаг, всё или ничего.
vi.mock("./ship-crew", () => ({
  releaseShip: async () => void s.released++,
  seatOnShip: async () => ({ id: "ship_1", big: false }),
  stepOpDone: async (op: string) => s.marks.has(op),
  seatRefusal: () => "Все корабли здесь заняты",
  applyStep: async (
    _w: string,
    _m: string,
    q: number,
    r: number,
    _mode: string,
    guard?: { from: Cell; cost: number; op: string },
  ) => {
    await Promise.resolve();
    // Строки нет — вставка; есть — переезд только с клетки «откуда».
    const same = !s.pos || (guard?.from.q === s.pos.q && guard?.from.r === s.pos.r);
    if (!guard || !same) return { ships: 0, moved: 0, energy: null };
    if (s.energy < guard.cost) throw new Error(`not_enough_energy:${s.energy}:${guard.cost}`);
    s.energy -= guard.cost;
    s.spends.push(guard.cost);
    s.pos = { q, r };
    s.marks.add(guard.op);
    // Ответ пропал — мост повторил тот же SQL: CAS промахнулся, ноль строк.
    if (s.lostReply) return { ships: 0, moved: 0, energy: null };
    return { ships: 0, moved: 1, energy: s.energy };
  },
}));

import { performStep } from "@/server/api/beta-raid/move-step";
import { performSteps } from "@/server/api/beta-raid/move-steps";
import { stepRateLimit } from "@/lib/hero/mount";

beforeEach(() => {
  s.pos = { q: 0, r: 0 };
  s.energy = 100;
  s.spends = [];
  s.points = [];
  s.gate = [];
  s.limits = [];
  s.gateFail = false;
  s.afterRead = null;
  s.lostReply = false;
  s.marks = new Set();
  s.water = false;
  s.toll = false;
  s.mount = "none";
  s.mult = 1;
});

describe("шаг с конём", () => {
  it("пегас прыгает через клетку: 10 + цена клетки приземления", async () => {
    s.mount = "unique";
    const res = await performStep("w", { q: 2, r: 0 });
    expect(res.moveCost).toBe(JUMP_ENERGY + s.cellCost);
    expect(s.pos).toEqual({ q: 2, r: 0 });
    expect(s.spends).toEqual([JUMP_ENERGY + s.cellCost]);
  });

  it("погода ×5 множит только клетку, 10 за прыжок — ровно (владелец 01.11)", async () => {
    s.mount = "unique";
    s.mult = { step: 5, ship: 1 };
    const res = await performStep("w", { q: 2, r: 0 });
    expect(res.moveCost).toBe(JUMP_ENERGY + s.cellCost * 5);
  });

  it("не пегас — через клетку нельзя; пегас — не дальше 2 и только по прямой", async () => {
    s.mount = "legendary";
    await expect(performStep("w", { q: 2, r: 0 })).rejects.toThrow("соседние");
    s.mount = "unique";
    await expect(performStep("w", { q: 3, r: 0 })).rejects.toThrow("соседние");
    await expect(performStep("w", { q: 1, r: 1 })).rejects.toThrow("соседние");
    expect(s.spends).toEqual([]);
  });

  it("на воду пегас не прыгает", async () => {
    s.mount = "unique";
    s.water = true;
    await expect(performStep("w", { q: 2, r: 0 })).rejects.toThrow("braid.jump_water");
    expect(s.spends).toEqual([]);
  });

  it("обычный шаг пегаса — по цене клетки, тормоз — по коню", async () => {
    s.mount = "unique";
    const res = await performStep("w", { q: 1, r: 0 });
    expect(res.moveCost).toBe(2);
    expect(s.limits).toEqual([stepRateLimit("unique")]);
    s.mount = "none";
    await performStep("w", { q: 2, r: 0 });
    expect(s.limits.at(-1)).toBe(stepRateLimit("none"));
  });

  it("зачарованный конь — тормоз выше ровно на скорость зачарования (03.11)", async () => {
    s.mount = "epic";
    s.mountPct = 20;
    await performStep("w", { q: 1, r: 0 });
    expect(s.limits.at(-1)).toBe(stepRateLimit("epic", 20));
    expect(stepRateLimit("epic", 20)).toBeGreaterThan(stepRateLimit("epic"));
    s.mountPct = 0;
  });

  it("пачка шагов — по порядку, отказ останавливает остальные", async () => {
    const ok = await performSteps("w", [
      { q: 1, r: 0 },
      { q: 2, r: 0 },
      { q: 3, r: 0 },
    ]);
    expect(ok.error).toBeNull();
    expect(ok.results.map((r) => r.position)).toEqual([
      { q: 1, r: 0 },
      { q: 2, r: 0 },
      { q: 3, r: 0 },
    ]);
    const bad = await performSteps("w", [
      { q: 4, r: 0 },
      { q: 9, r: 9 },
      { q: 5, r: 0 },
    ]);
    expect(bad.results).toHaveLength(1);
    expect(bad.error).toMatch("соседние");
    expect(s.pos).toEqual({ q: 4, r: 0 });
  });
});
