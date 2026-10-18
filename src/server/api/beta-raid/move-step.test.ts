// Шаг героя: один настоящий переход — одно очко «Шагов» и одно списание.
//
// Аудит турниров 06.10: пачка одинаковых запросов из одной клетки читала одну
// и ту же позицию, каждый платил энергию, писал позицию без условия и получал
// очко. Здесь база — подделка с теми же правилами, что у оператора шага
// (move-step-sql): позиция меняется только со своей клетки «откуда» (CAS), а
// энергия списывается только за записанный шаг и в том же «операторе».
import { beforeEach, describe, expect, it, vi } from "vitest";

type Cell = { q: number; r: number };
const s = vi.hoisted(() => ({
  pos: { q: 0, r: 0 } as Cell | null,
  energy: 100,
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
}));

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
  rateGate: async (key: string) => {
    s.gate.push(key);
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
vi.mock("./hero-power", () => ({ loadHeroPower: async () => null }));
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
    cost: 2,
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

const steps = () => s.points.filter((p) => p.metric === "steps");

beforeEach(() => {
  s.pos = { q: 0, r: 0 };
  s.energy = 100;
  s.spends = [];
  s.points = [];
  s.reads = 0;
  s.gate = [];
  s.gateFail = false;
  s.afterRead = null;
  s.lostReply = false;
  s.marks = new Set();
  s.water = false;
  s.toll = false;
  s.released = 0;
  s.refunds = 0;
});

describe("один переход — одно очко и одно списание", () => {
  it("5 одинаковых шагов разом: один принят, четыре — «позиция уже не та»", async () => {
    const res = await Promise.allSettled(
      Array.from({ length: 5 }, () => performStep("w.near", { q: 1, r: 0 })),
    );
    // Все пятеро прочли одну и ту же клетку — гонка настоящая.
    expect(s.reads).toBe(5);
    expect(res.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    const errs = res.flatMap((x) => (x.status === "rejected" ? [String(x.reason?.message)] : []));
    expect(errs).toEqual(Array(4).fill("braid.step_stale"));
    expect(s.spends).toEqual([2]);
    expect(s.energy).toBe(98);
    expect(steps()).toHaveLength(1);
    expect(s.points.filter((p) => p.metric === "step_energy")).toEqual([
      expect.objectContaining({ qty: 2 }),
    ]);
    expect(s.pos).toEqual({ q: 1, r: 0 });
  });

  it("первый выход на карту пачкой — тоже один", async () => {
    s.pos = null;
    // Без строки позиции шаг идёт от замка: центр карты 128 — клетка (32, 64).
    const res = await Promise.allSettled(
      Array.from({ length: 3 }, () => performStep("w.near", { q: 33, r: 64 })),
    );
    expect(s.pos).toEqual({ q: 33, r: 64 });
    expect(res.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(s.spends).toHaveLength(1);
    expect(steps()).toHaveLength(1);
  });

  it("строку замка успели закрепить между чтением и шагом — первый шаг проходит", async () => {
    s.pos = null;
    s.afterRead = () => void (s.pos = { q: 32, r: 64 });
    await performStep("w.near", { q: 33, r: 64 });
    expect(s.pos).toEqual({ q: 33, r: 64 });
    expect(steps()).toHaveLength(1);
  });

  it("обычная ходьба по очереди засчитывается каждым шагом", async () => {
    await performStep("w.near", { q: 1, r: 0 });
    const out = await performStep("w.near", { q: 2, r: 0 });
    expect(out.remainingEnergy).toBe(96);
    expect(steps()).toHaveLength(2);
    expect(new Set(steps().map((p) => p.ref)).size).toBe(2);
  });

  it("не хватило энергии — ни шага, ни очка, прежними словами", async () => {
    s.energy = 1;
    await expect(performStep("w.near", { q: 1, r: 0 })).rejects.toThrow(
      "Недостаточно энергии (нужно 2)",
    );
    expect(s.pos).toEqual({ q: 0, r: 0 });
    expect(s.points).toHaveLength(0);
  });

  it("тормоз частоты — по аккаунту, отказ до денег", async () => {
    s.gateFail = true;
    await expect(performStep("w.near", { q: 1, r: 0 })).rejects.toThrow("braid.step_too_fast");
    expect(s.gate).toEqual(["step:acc_me"]);
    expect(s.spends).toHaveLength(0);
    expect(s.points).toHaveLength(0);
  });
});

describe("слепой повтор моста после коммита", () => {
  it("посадка через дверь: борт не снят, плата не возвращена, шаг засчитан один раз", async () => {
    s.water = true;
    s.toll = true;
    s.lostReply = true;
    const out = await performStep("w.near", { q: 1, r: 0 });
    expect(out.position).toEqual({ q: 1, r: 0 });
    expect(s.released).toBe(0);
    expect(s.refunds).toBe(0);
    expect(s.spends).toHaveLength(1);
    expect(steps()).toHaveLength(1);
  });

  it("чужой ключ (другой запрос уже сдвинул) — по-прежнему отказ и откат брони", async () => {
    s.water = true;
    s.toll = true;
    s.afterRead = () => void (s.pos = { q: 1, r: 0 });
    await expect(performStep("w.near", { q: 1, r: 0 })).rejects.toThrow("braid.step_stale");
    expect(s.released).toBe(1);
    expect(s.refunds).toBe(1);
    expect(steps()).toHaveLength(0);
  });
});
