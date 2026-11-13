// Клад дня (§8.117) под лопатой: копка его клетки достаёт клад тому, кто забрал
// клетку ямкой; обычной находки тогда нет (одна копка — один приз).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fx, packOf, resetFx } from "./main-tool.fake";
import { gx } from "./ground-dig.fake";

const s = vi.hoisted(() => ({
  treasure: false,
  claimed: null as { id: string; account: string; op: string } | null,
  pos: { q: 0, r: 0 } as { q: number; r: number },
  voids: new Set<string>(),
  spent: 0,
  refunded: 0,
  broke: false,
  roll: 0,
  mapId: "map1",
  gives: [] as Array<{ itemId: string; op: string; q: number; r: number }>,
  bumps: [] as string[],
}));
vi.mock("@/server/db/mcpClient", async () => {
  const { fakeExec } = await import("./main-tool.fake");
  return {
    // Клад отмечается тем же оператором, что ставит ямку (treasure-claim-sql).
    mcpExec: async (sql: string, o?: unknown) => {
      const m = /found_op = '([^']+)'[\s\S]*WHERE id = '([^']+)'/.exec(sql);
      const out = await (fakeExec as (q: string, x?: unknown) => Promise<unknown>)(sql, o);
      if (m && sql.includes("'ground', 'done'"))
        s.claimed = { id: m[2], account: "acc1", op: m[1] };
      return out;
    },
  };
});
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
vi.mock("@/server/api/treasure/treasure-pay", () => ({
  liveTreasureAt: async (_m: string, q: number, r: number) =>
    s.treasure && !s.claimed && `${q},${r}` === "1,0" ? "trs_1" : null,
  settleTreasure: async (op: string) =>
    s.claimed?.op === op
      ? { resource: "gold", token: null, amount: 500, name: null, paid: true }
      : null,
}));
vi.mock("./dig-seed", () => ({ digRoll: () => s.roll }));
vi.mock("@/server/api/achievements/bump", () => ({
  bumpAchievement: (account: string, track: string) => s.bumps.push(`${account}:${track}`),
}));
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
type Res = { ok: true; found: number; treasure?: unknown };
type Call = (a: { data: unknown }) => Promise<Res>;
let n = 0;
const op = () => `tpress-${++n}-x`;
const dig = (q = 1, r = 0, o = op()) => (digGround as unknown as Call)({ data: { q, r, op: o } });
const PRIZE = { resource: "gold", token: null, amount: 500, name: null, paid: true };

beforeEach(() => {
  resetFx();
  dropDigConfigCache();
  Object.assign(s, {
    treasure: true,
    claimed: null,
    pos: { q: 0, r: 0 },
    voids: new Set(),
    spent: 0,
    refunded: 0,
    broke: false,
    roll: 700,
    mapId: "map1",
    gives: [],
    bumps: [],
  });
  gx.digConfig = JSON.stringify({
    items: [
      { id: "none", pct: 50 },
      { id: "cst_gold", pct: 50 },
    ],
  });
  fx.catalog.set("cst_sh1", { name: "Лопата", shovel: true, wear: 25 });
  packOf("h1").set("custom:cst_sh1", { count: 1, wear: 0 });
  fx.main.set("h1", "custom:cst_sh1");
  for (const key of ["1,0", "0,0", "0,1"]) gx.cells.set(key, {});
});

describe("клад дня под лопатой (§8.117)", () => {
  it("копка клетки клада — клад этому нажатию, обычной находки нет", async () => {
    const o = op();
    expect(await dig(1, 0, o)).toEqual({ ok: true, found: 0, treasure: PRIZE });
    expect(s.claimed).toEqual({ id: "trs_1", account: "acc1", op: `gdig:acc1:${o}` });
    expect(s.gives).toEqual([]);
  });

  it("повтор того же нажатия — тот же клад в ответе, второй отметки нет", async () => {
    const o = op();
    await dig(1, 0, o);
    expect(await dig(1, 0, o)).toEqual({ ok: true, found: 0, treasure: PRIZE });
  });

  it("клад уже найден — обычная копка, обычная находка", async () => {
    s.claimed = { id: "trs_1", account: "acc2", op: "other" };
    expect(await dig(1, 0)).toEqual({ ok: true, found: 1 });
  });

  it("соседняя клетка — обычная находка, клад не трогается", async () => {
    expect(await dig(0, 1)).toEqual({ ok: true, found: 1 });
    expect(s.claimed).toBeNull();
  });

  it("«Кладоискатель»: клад и находка — +1 за нажатие, повтор и пустая копка — нет", async () => {
    const o = op();
    await dig(1, 0, o);
    await dig(1, 0, o);
    expect(s.bumps).toEqual(["acc1:digger"]);
    await dig(0, 1);
    expect(s.bumps).toEqual(["acc1:digger", "acc1:digger"]);
    s.roll = 100;
    expect(await dig(0, 0)).toEqual({ ok: true, found: 0 });
    expect(s.bumps).toHaveLength(2);
  });
});
