// «Копать» где угодно (§8.24): лопатой в руках, вплотную; на пустой земле —
// 2 энергии и износ, находка по списку долей (п. 6б) или «ничего не нашлось»;
// где нельзя стоять, под декором, на постройке, объекте, мешочке, сундуке и
// корабле, на свежей ямке — отказ до денег и износа. Лопата не в руках —
// отказ, энергия назад. Повтор того же нажатия и параллельный дубль — одна
// плата и одна выдача; потерянный ответ записи решает «забор».
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fx, packOf, resetFx } from "./main-tool.fake";
import { gx } from "./ground-dig.fake";

const s = vi.hoisted(() => ({
  pos: { q: 0, r: 0 } as { q: number; r: number },
  voids: new Set<string>(),
  spent: 0,
  refunded: 0,
  broke: false,
  roll: 0,
  mapId: "map1",
  gives: [] as Array<{ itemId: string; op: string; q: number; r: number }>,
}));
vi.mock("@/server/db/mcpClient", async () => ({
  mcpExec: (await import("./main-tool.fake")).fakeExec,
}));
vi.mock("../market-backpack", () => ({ resolveBackpack: async () => ({ heroId: "h1" }) }));
vi.mock("../item-alias", () => ({
  canonStackKey: async (kind: string, ref: string) => `${kind}:${ref}`,
}));
vi.mock("../loot-bag/bag-actor", () => ({
  bagActor: async () => ({ wallet: "w1", mapId: s.mapId, account: "acc1" }),
  requireBagNear: async (_a: unknown, q: number, r: number) => {
    const d =
      (Math.abs(q - s.pos.q) + Math.abs(r - s.pos.r) + Math.abs(q + r - s.pos.q - s.pos.r)) / 2;
    if (d > 1) throw new Error("bag.approach");
    if (s.voids.has(`${q},${r}`)) throw new Error("braid.void_blocked");
  },
}));
vi.mock("../loot-bag/bag-dig-pay", () => ({
  payDig: async () => {
    if (s.broke) throw new Error(`braid.need_energy|{"n":2}`);
    s.spent += 2;
    return { refund: async () => void (s.refunded += 2) };
  },
}));
vi.mock("@/server/auth", () => ({ requireAdmin: () => {} }));
vi.mock("./dig-seed", () => ({ digRoll: () => s.roll }));
vi.mock("./dig-find", () => ({
  giveFind: async (o: { itemId: string; op: string; q: number; r: number }) => {
    s.gives.push({ itemId: o.itemId, op: o.op, q: o.q, r: o.r });
  },
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let check: ((d: unknown) => unknown) | null = null;
    const fn = {
      inputValidator: (v: (d: unknown) => unknown) => ((check = v), fn),
      handler: (h: (a: { data: unknown }) => unknown) => (a?: { data?: unknown }) =>
        h({ data: check ? check(a?.data) : a?.data }),
    };
    return fn;
  },
}));

const { digGround } = await import("./ground-dig");
const { dropDigConfigCache } = await import("./dig-finds-config");
type Call = (a: { data: unknown }) => Promise<{ ok: true; found: number }>;
const NONE = { ok: true, found: 0 };
const FOUND = { ok: true, found: 1 };
let n = 0;
const op = () => `press-${++n}-x`;
const dig = (q = 1, r = 0, o = op()) => (digGround as unknown as Call)({ data: { q, r, op: o } });
const SH1 = "custom:cst_sh1";
const shovel = () => packOf("h1").get(SH1);
const net = () => s.spent - s.refunded;

beforeEach(() => {
  resetFx();
  dropDigConfigCache();
  Object.assign(s, {
    pos: { q: 0, r: 0 },
    voids: new Set(),
    spent: 0,
    refunded: 0,
    broke: false,
    roll: 0,
    mapId: "map1",
    gives: [],
  });
  fx.catalog.set("cst_sh1", { name: "Лопата", shovel: true, wear: 25 });
  fx.catalog.set("cst_sh2", { name: "Лопата-2", shovel: true, wear: 50 });
  fx.catalog.set("cst_axe", { name: "Топор", wear: 34 });
  packOf("h1").set(SH1, { count: 1, wear: 0 });
  fx.main.set("h1", SH1);
  for (const key of ["1,0", "0,0", "0,1", "2,0"]) gx.cells.set(key, {});
});

describe("копать пустую землю", () => {
  it("2 энергии и износ лопаты, «ничего не нашлось»; своя клетка — тоже можно", async () => {
    expect(await dig()).toEqual(NONE);
    expect(net()).toBe(2);
    expect(shovel()).toEqual({ count: 1, wear: 25 });
    await dig(0, 0);
    expect(net()).toBe(4);
    expect(shovel()).toEqual({ count: 1, wear: 50 });
  });

  it("повтор того же нажатия — прежний ответ, второй платы и износа нет", async () => {
    const o = op();
    await dig(1, 0, o);
    await dig(1, 0, o);
    expect(net()).toBe(2);
    expect(shovel()).toEqual({ count: 1, wear: 25 });
  });

  it("два параллельных дубля одного нажатия — одна плата, один износ", async () => {
    const o = op();
    const out = await Promise.allSettled([dig(1, 0, o), dig(1, 0, o)]);
    expect(out.every((x) => x.status === "fulfilled")).toBe(true);
    expect(net()).toBe(2);
    expect(shovel()).toEqual({ count: 1, wear: 25 });
  });

  it("отказ «лопата занята», повтор того же нажатия — не даром: износа без удара нет", async () => {
    const [a, b] = [op(), op()];
    const out = await Promise.allSettled([dig(1, 0, a), dig(1, 0, b)]);
    const lost = out.find((x) => x.status === "rejected") as PromiseRejectedResult;
    expect(String(lost.reason)).toContain("bag.shovel_busy");
    // Повтор отказанного ключа (прямой вызов) — отказ, а не бесплатная копка.
    await expect(dig(1, 0, out[0].status === "rejected" ? a : b)).rejects.toThrow();
    expect(net()).toBe(2);
    expect(shovel()).toEqual({ count: 1, wear: 25 });
  });

  it("лопата сломалась на копке — дальше копает другая, она теперь в руках", async () => {
    packOf("h1").set(SH1, { count: 1, wear: 75 });
    packOf("h1").set("custom:cst_sh2", { count: 1, wear: 0 });
    await dig();
    expect(shovel()).toEqual({ count: 0, wear: 0 });
    await dig(0, 1);
    expect(packOf("h1").get("custom:cst_sh2")).toEqual({ count: 1, wear: 50 });
    expect(fx.main.get("h1")).toBe("custom:cst_sh2");
  });
});

describe("где копать нельзя — отказ до денег и износа", () => {
  const blocked: Array<[string, Record<string, boolean>]> = [
    ["вода", { water: true }],
    ["декор", { decor: true }],
    ["постройка", { building: true }],
    ["объект или босс", { object: true }],
    ["мешочек или бугорок", { bag: true }],
    ["сундук", { chest: true }],
    ["корабль", { ship: true }],
    ["нет местности", { terrain: false }],
  ];
  for (const [what, cell] of blocked) {
    it(what, async () => {
      gx.cells.set("1,0", cell);
      await expect(dig()).rejects.toThrow("dig.cant_here");
      expect(s.spent).toBe(0);
      expect(shovel()).toEqual({ count: 1, wear: 0 });
    });
  }

  it("клетки нет в карте, далеко, под куполом", async () => {
    await expect(dig(5, 5)).rejects.toThrow("bag.approach");
    gx.cells.delete("1,0");
    await expect(dig()).rejects.toThrow("dig.cant_here");
    s.voids.add("0,1");
    await expect(dig(0, 1)).rejects.toThrow("braid.void_blocked");
    expect(s.spent).toBe(0);
  });
});

describe("лопата и энергия", () => {
  it("в руках топор — «возьми в руки лопату», энергия вернулась, износа нет", async () => {
    packOf("h1").set("custom:cst_axe", { count: 1, wear: 0 });
    fx.main.set("h1", "custom:cst_axe");
    await expect(dig()).rejects.toThrow(`tool.not_main|${JSON.stringify({ tool: "Лопата" })}`);
    expect(net()).toBe(0);
    expect(shovel()).toEqual({ count: 1, wear: 0 });
  });

  it("лопаты нет — «Нужна лопата»; энергии нет — «Нужно 2 энергии», лопата цела", async () => {
    s.broke = true;
    await expect(dig()).rejects.toThrow("braid.need_energy");
    expect(shovel()).toEqual({ count: 1, wear: 0 });
    s.broke = false;
    packOf("h1").delete(SH1);
    await expect(dig()).rejects.toThrow("bag.need_shovel");
    expect(net()).toBe(0);
  });

  it("ответ записи потерян — «забор» видит «копали»: износ и энергия остаются", async () => {
    fx.loseOn = "'ground', 'done'";
    expect(await dig()).toEqual(NONE);
    expect(net()).toBe(2);
    expect(shovel()).toEqual({ count: 1, wear: 25 });
  });

  it("запись не дошла до базы — «забор» ставит отказ: износ и энергия назад", async () => {
    fx.failOn = "'ground', 'done'";
    const o = op();
    await expect(dig(1, 0, o)).rejects.toThrow("MCP timeout");
    expect(net()).toBe(0);
    expect(shovel()).toEqual({ count: 1, wear: 0 });
    // Опоздавший повтор того же нажатия уже ничего не копает.
    await expect(dig(1, 0, o)).rejects.toThrow("bag.drop_failed");
    expect(net()).toBe(0);
  });
});

describe("находки (§8.24 п. 6б)", () => {
  const cfg = (o: unknown) => void (gx.digConfig = JSON.stringify(o));
  const half = {
    items: [
      { id: "none", pct: 50 },
      { id: "cst_gold", pct: 50 },
    ],
  };

  it("бросок в находку — мешочек один раз; повтор нажатия — тот же ответ, без выдачи", async () => {
    cfg(half);
    s.roll = 700;
    const o = op();
    const res = await dig(1, 0, o);
    expect(res).toEqual(FOUND);
    expect(s.gives).toEqual([{ itemId: "cst_gold", op: `gdig:acc1:${o}`, q: 1, r: 0 }]);
    expect(await dig(1, 0, o)).toEqual(res);
    expect(s.gives).toHaveLength(1);
    expect(net()).toBe(2);
  });

  it("бросок в «Ничего» — ничего не выдано; настройки нет — тоже ничего", async () => {
    cfg(half);
    s.roll = 100;
    expect(await dig()).toEqual(NONE);
    gx.digConfig = null;
    dropDigConfigCache();
    s.roll = 999;
    expect(await dig(0, 1)).toEqual(NONE);
    expect(s.gives).toEqual([]);
  });

  it("свой список местности клетки главнее общего", async () => {
    cfg({
      items: [{ id: "none", pct: 100 }],
      terrains: { terrain_t1: [{ id: "cst_boot", pct: 100 }] },
    });
    s.roll = 3;
    expect(await dig()).toEqual(FOUND);
    expect(s.gives.map((g) => g.itemId)).toEqual(["cst_boot"]);
  });

  it("два дубля одного нажатия — одна выдача", async () => {
    cfg(half);
    s.roll = 999;
    const o = op();
    const out = await Promise.all([dig(1, 0, o), dig(1, 0, o)]);
    expect(out).toEqual([FOUND, FOUND]);
    expect(s.gives).toHaveLength(1);
    expect(net()).toBe(2);
  });

  it("ответ записи потерян — «забор» видит свою запись и выдаёт", async () => {
    cfg(half);
    s.roll = 999;
    fx.loseOn = "'ground', 'done'";
    expect(await dig()).toEqual(FOUND);
    expect(s.gives).toHaveLength(1);
  });
});

describe("находки: сбои и повторы", () => {
  const all = () => void (gx.digConfig = JSON.stringify({ items: [{ id: "cst_gold", pct: 100 }] }));

  it("ответ записи пришёл пустым — «забор» видит запись: находка выдана, плата остаётся", async () => {
    all();
    fx.emptyOn = "'ground', 'done'";
    expect(await dig()).toEqual(FOUND);
    expect(s.gives).toHaveLength(1);
    expect(net()).toBe(2);
    expect(shovel()).toEqual({ count: 1, wear: 25 });
  });

  it("тот же ключ после уборки ключей — новая копка с новым броском, а не прежний клад", async () => {
    gx.digConfig = JSON.stringify({
      items: [
        { id: "none", pct: 50 },
        { id: "cst_gold", pct: 50 },
      ],
    });
    const o = op();
    s.roll = 999;
    expect(await dig(1, 0, o)).toEqual(FOUND);
    gx.digOps.clear();
    s.roll = 10;
    expect(await dig(0, 1, o)).toEqual(NONE);
    expect(s.gives).toHaveLength(1);
    expect(net()).toBe(4);
  });

  it("остров новичка — находок нет (до слова владельца)", async () => {
    all();
    s.mapId = "isle_acc1";
    expect(await dig()).toEqual(NONE);
    expect(s.gives).toEqual([]);
  });
});

describe("ямка держит клетку; исчезла — шанс снова (12.11.2026)", () => {
  it("ямка исчезла (час) — клетка копается и снова даёт находку", async () => {
    gx.digConfig = JSON.stringify({ items: [{ id: "cst_gold", pct: 100 }] });
    expect(await dig()).toEqual(FOUND);
    gx.holes.delete("1,0");
    expect(await dig()).toEqual(FOUND);
    expect(s.gives).toHaveLength(2);
    expect(net()).toBe(4);
  });

  it("на ямке — «только закопать» до денег и износа; ямки нет — копается снова", async () => {
    await dig();
    await expect(dig()).rejects.toThrow("dig.dug_here");
    expect(net()).toBe(2);
    expect(shovel()).toEqual({ count: 1, wear: 25 });
    gx.holes.delete("1,0");
    await dig();
    expect(net()).toBe(4);
  });

  it("клетку вскопал другой между проверкой и записью — отказ, энергия и износ назад", async () => {
    gx.digConfig = JSON.stringify({ items: [{ id: "cst_gold", pct: 100 }] });
    gx.stealOnMark = "1,0";
    await expect(dig()).rejects.toThrow("dig.dug_here");
    expect(net()).toBe(0);
    expect(shovel()).toEqual({ count: 1, wear: 0 });
    expect(s.gives).toEqual([]);
  });
});
