// Постройка «Забвение»: платит и выдаёт по паре «уровень + минуты» (правило
// 28.09: заряды, заряды со сроком, «0» — без счёта на время), без цены и с
// неверной парой — отказ без оплаты, повтор нажатия не платит дважды, сорвалась
// выдача — деньги назад (а потерянный ответ — не повод возвращать), ключ
// нажатия после оплаты не отпускается.
import { beforeEach, describe, expect, it, vi } from "vitest";

type Building = {
  effect: string | null;
  tier: number;
  tiers: unknown[];
  config: unknown;
  meta: unknown;
} | null;

const s = vi.hoisted(() => ({
  building: null as Building,
  ops: new Set<string>(),
  paid: [] as string[],
  refunded: [] as string[],
  grants: [] as Array<{ account: string; roll: { amount: number; minutes: number }; ref: string }>,
  grantFails: false,
  marks: new Set<string>(),
  payFails: false,
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const fn = { inputValidator: () => fn, handler: (h: unknown) => h };
    return fn;
  },
}));
vi.mock("./gate", () => ({ requireBetaRaid: async () => "w1" }));
vi.mock("./owner", () => ({ raidOwner: async () => "acc_me" }));
vi.mock("./encounter-where", () => ({
  myMapId: async () => "map1",
  playerCell: async () => ({ q: 0, r: 0 }),
  requireAdjacent: () => {},
}));
vi.mock("./voidGate", () => ({ requireNotVoid: async () => {} }));
vi.mock("./building-action", () => ({ loadCellBuilding: async () => s.building }));
vi.mock("./hero-boost", () => ({
  claimBoostOp: async ({ op }: { op: string }) => !s.ops.has(op) && !!s.ops.add(op),
}));
vi.mock("./resource-pay", () => ({
  payResources: async (_w: string, _p: unknown, ref: string) => {
    if (s.payFails) throw new Error("Не хватает ресурсов");
    s.paid.push(ref);
  },
  refundResources: async (_w: string, _p: unknown, ref: string) => void s.refunded.push(ref),
}));
vi.mock("./econ/trade-hooks", () => ({ noteEnergyInPrices: async () => {} }));
vi.mock("./oblivion", () => ({
  grantOblivion: async (
    account: string,
    roll: { amount: number; minutes: number },
    ref: string,
  ) => {
    if (s.grantFails) throw new Error("MCP timeout");
    s.grants.push({ account, roll: { amount: roll.amount, minutes: roll.minutes }, ref });
    return true;
  },
  opMarked: async (ref: string) => s.marks.has(ref),
}));

import * as temple from "./oblivion-temple";
import { oblivionExtra } from "./oblivion-extra";

type Res = { ok: true; repeat: boolean; level: number; minutes: number };
const take = temple.takeOblivion as unknown as (a: {
  data: Record<string, unknown>;
}) => Promise<Res>;
const call = (op = "op000001") => take({ data: { q: 1, r: 2, op } });
const gold = [{ resource: "gold", token: null, itemKey: null, itemName: null, amount: 50 }];
const temple1 = (oblivion: unknown, tier = 1): Building => ({
  effect: "oblivion",
  tier,
  tiers: [{}, {}],
  config: { effect: "oblivion", oblivion },
  meta: {},
});

beforeEach(() => {
  s.building = temple1({ prices: gold, level: "2", minutes: "" });
  s.ops = new Set();
  s.paid = [];
  s.refunded = [];
  s.grants = [];
  s.grantFails = false;
  s.marks = new Set();
  s.payFails = false;
});

describe("takeOblivion — получить эффект за плату", () => {
  it("платит и выдаёт «Забвение 2 Lv»", async () => {
    expect(await call()).toEqual({ ok: true, repeat: false, level: 2, minutes: 0 });
    expect(s.paid).toEqual(["oblivion:map1:1:2:acc_me:op000001"]);
    expect(s.grants).toEqual([
      { account: "acc_me", roll: { amount: 2, minutes: 0 }, ref: "oblgrant:acc_me:op000001" },
    ]);
  });

  it("уровень и время — заряды со сроком: и заряды, и минуты", async () => {
    s.building = temple1({ prices: gold, level: "1", minutes: "30" });
    expect(await call()).toEqual({ ok: true, repeat: false, level: 1, minutes: 30 });
    expect(s.grants[0].roll).toEqual({ amount: 1, minutes: 30 });
  });

  it("«0» и время — без счёта на время: зарядов 0", async () => {
    s.building = temple1({ prices: gold, level: "0", minutes: "45" });
    expect(await call()).toEqual({ ok: true, repeat: false, level: 0, minutes: 45 });
    expect(s.grants[0].roll).toEqual({ amount: 0, minutes: 45 });
  });

  it("неверная пара, уже лежащая в базе, — отказ «настроено с ошибкой», денег не трогаем", async () => {
    for (const [level, minutes] of [
      ["0", ""],
      ["", ""],
      ["", "30"],
      ["0-3", "30"],
    ]) {
      s.building = temple1({ prices: gold, level, minutes });
      await expect(call()).rejects.toThrow("oblivion.bad_setup");
    }
    expect(s.paid).toEqual([]);
    expect(s.grants).toEqual([]);
    expect(s.ops.size).toBe(0);
  });

  it("цена не задана — получить нельзя, денег не трогаем", async () => {
    s.building = temple1({ prices: [], level: "3" });
    await expect(call()).rejects.toThrow("oblivion.not_set");
    s.building = temple1({ prices: [{ resource: "gold", amount: 0 }], level: "3" });
    await expect(call()).rejects.toThrow("oblivion.not_set");
    expect(s.paid).toEqual([]);
    expect(s.ops.size).toBe(0);
  });

  it("не достроено и не та постройка — отказ", async () => {
    s.building = temple1({ prices: gold }, 0);
    await expect(call()).rejects.toThrow("oblivion.unbuilt");
    s.building = { ...temple1({ prices: gold })!, effect: "spellbook" };
    await expect(call()).rejects.toThrow("oblivion.not_here");
    s.building = null;
    await expect(call()).rejects.toThrow("oblivion.not_here");
    expect(s.paid).toEqual([]);
  });

  it("повтор того же нажатия — второй раз не платит и не выдаёт", async () => {
    await call("op_same_1");
    expect(await call("op_same_1")).toEqual({ ok: true, repeat: true, level: 0, minutes: 0 });
    expect(s.paid).toHaveLength(1);
    expect(s.grants).toHaveLength(1);
  });

  it("выдача сорвалась — деньги назад тем же ключом, ключ нажатия занят", async () => {
    s.grantFails = true;
    await expect(call("op_fail_1")).rejects.toThrow("oblivion.failed");
    expect(s.refunded).toEqual(["oblivion:map1:1:2:acc_me:op_fail_1"]);
    // Повтор того же нажатия по возвращённой оплате даром не пройдёт.
    s.grantFails = false;
    expect(await call("op_fail_1")).toMatchObject({ repeat: true });
    expect(s.paid).toHaveLength(1);
    expect(s.grants).toHaveLength(0);
  });

  it("ответ выдачи потерялся, но ключ выдачи лёг — эффект есть, денег не возвращаем", async () => {
    s.grantFails = true;
    s.marks.add("oblgrant:acc_me:op_lost_1");
    expect(await call("op_lost_1")).toMatchObject({ ok: true, repeat: false });
    expect(s.refunded).toEqual([]);
  });

  it("оплата не прошла — эффекта нет, отказ летит как есть (сбой связи клиент узнает)", async () => {
    s.payFails = true;
    await expect(call()).rejects.toThrow(/^Не хватает ресурсов$/);
    expect(s.grants).toEqual([]);
  });
});

describe("oblivionExtra — что видит окно постройки", () => {
  it("настроено: цена, уровень и время", () => {
    expect(
      oblivionExtra({ built: true, cellConfig: { oblivion: { prices: gold, level: "1-3" } } }),
    ).toEqual({
      kind: "oblivion",
      prices: gold,
      level: "1-3",
      minutes: "",
      can: true,
      reasonKey: null,
    });
  });

  it("своей настройки нет — берём шаблон", () => {
    const extra = oblivionExtra({
      built: true,
      cellConfig: {},
      meta: { oblivion: { prices: gold, minutes: "30" } },
    });
    expect(extra).toMatchObject({ can: true, level: "1", minutes: "30" });
  });

  it("неверная пара — кнопка гаснет с той же причиной, что у выдачи, без выдуманных «1 Lv»", () => {
    const extra = oblivionExtra({
      built: true,
      cellConfig: { oblivion: { prices: gold, level: "0", minutes: "" } },
    });
    expect(extra).toMatchObject({
      can: false,
      reasonKey: "oblivion.bad_setup",
      level: "",
      minutes: "",
    });
  });

  it("недострой важнее ненастроенности; без цены — «не настроено»", () => {
    expect(oblivionExtra({ built: false, cellConfig: {} })).toMatchObject({
      can: false,
      reasonKey: "oblivion.unbuilt",
    });
    expect(oblivionExtra({ built: true, cellConfig: { oblivion: { prices: [] } } })).toMatchObject({
      can: false,
      reasonKey: "oblivion.not_set",
      prices: [],
    });
  });
});
