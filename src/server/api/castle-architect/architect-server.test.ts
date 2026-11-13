// Ручки Архитектора поверх фейковой базы: цены из настройки (с кэшем), админ-
// сохранение, улучшение и изготовление — какие функции базы зовутся и с чем.
import { beforeEach, describe, expect, it, vi } from "vitest";

type Fn = (a: { data: unknown }) => Promise<unknown>;
const s = vi.hoisted(() => ({
  admin: true,
  level: 0,
  spec: null as string | null,
  settings: null as string | null,
  sql: [] as string[],
  rpc: [] as Array<{ fn: string; args: Record<string, unknown> }>,
  rpcError: null as string | null,
  payStatus: "paid",
  depositError: null as string | null,
  /** Ключ выдачи в рюкзак (raid_backpack_op) уже есть. */
  bpLanded: false,
  /** Оплату этого ключа уже вернули раньше. */
  wasBack: false,
  /** Добор запер ключ и вернул оплату: снимок отката этого не видит, свежее чтение — да. */
  swept: false,
  deposits: [] as Array<Record<string, unknown>>,
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const wrap = (fn: Fn, v?: (d: unknown) => unknown) => async (a: { data: unknown }) =>
      fn({ data: v ? v(a.data) : a.data });
    return {
      handler: (fn: Fn) => wrap(fn),
      inputValidator: (v: (d: unknown) => unknown) => ({ handler: (fn: Fn) => wrap(fn, v) }),
    };
  },
}));
vi.mock("@/server/auth", () => ({
  requireWallet: () => "w_me",
  requireAdmin: () => {
    if (!s.admin) throw new Error("Доступ запрещён");
    return "w_me";
  },
}));
vi.mock("@/server/api/beta-raid/owner", () => ({ raidOwner: async () => "acc_me" }));
vi.mock("@/server/db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    s.sql.push(sql);
    if (/FROM yuplink.settings/.test(sql)) return s.settings ? [{ value: s.settings }] : [];
    if (/FROM yuplink.castle_architect /.test(sql)) return [{ level: s.level }];
    if (/FROM yuplink.account_resources/.test(sql)) return [{ resource: "wood", amount: "400" }];
    // Откат выдачи: ключ заперт нами ⇔ его не было. Мост отдаёт _row строкой.
    if (/castle_architect_refund/.test(sql)) {
      const row = { blocked: !s.bpLanded, refunded: !s.bpLanded, was_back: s.wasBack };
      return [{ _row: JSON.stringify(row) }];
    }
    if (/SELECT refunded_at FROM yuplink\.castle_architect_op/.test(sql))
      return [{ refunded_at: s.wasBack || s.swept ? "2026-10-20" : null }];
    return [];
  },
}));
vi.mock("@/server/db/pg", () => ({
  sb: {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      s.rpc.push({ fn, args });
      if (s.rpcError) return { error: { message: s.rpcError }, data: null };
      if (fn === "castle_architect_pay") return { error: null, data: [{ status: s.payStatus }] };
      if (fn === "castle_architect_upgrade")
        return { error: null, data: [{ level: Number(args.p_from) + 1 }] };
      return { error: null, data: [{ refunded: true }] };
    },
  },
}));
vi.mock("@/server/api/beta-raid/market-backpack", () => ({
  resolveBackpack: async () => ({
    heroId: "h1",
    heroName: "Юпик",
    spec: s.spec,
    capacity: 8,
    potionCapacity: 2,
  }),
  stackKeyFor: async (it: { kind: string; refId: string }) => `${it.kind}:${it.refId}`,
  assertBackpackRoomFor: async () => {},
  depositToBackpack: async (o: Record<string, unknown>) => {
    if (s.depositError) throw new Error(s.depositError);
    s.deposits.push(o);
  },
}));

const cfgMod = await import("./architect-config");
const state = await import("./architect-state");
const craft = await import("./craft");
const { DEFAULT_ARCHITECT_CONFIG: D } = await import("@/lib/castleArchitect");
const call = (f: unknown, data?: unknown) => (f as Fn)({ data });

beforeEach(() => {
  Object.assign(s, {
    admin: true,
    level: 0,
    spec: null,
    settings: null,
    rpcError: null,
    payStatus: "paid",
    depositError: null,
    bpLanded: false,
    wasBack: false,
    swept: false,
  });
  s.sql.length = 0;
  s.rpc.length = 0;
  s.deposits.length = 0;
  cfgMod.dropArchitectConfigCache();
});

describe("настройка цен", () => {
  it("строка settings поверх значений по умолчанию, второй раз — из кэша", async () => {
    s.settings = JSON.stringify({
      blueprints: { wood: { wood: 1, stone: 2, gold: 3, diamonds: 0 } },
    });
    const a = await cfgMod.loadArchitectConfig();
    await cfgMod.loadArchitectConfig();
    expect(a.blueprints.wood).toEqual({ wood: 1, stone: 2, gold: 3, diamonds: 0 });
    expect(a.levels).toEqual(D.levels);
    expect(s.sql.filter((q) => /settings/.test(q))).toHaveLength(1);
  });

  it("админ сохраняет: проверка формы, запись ключа architect_config", async () => {
    await expect(
      call(cfgMod.saveArchitectAdmin, { ...D, levels: D.levels.slice(0, 3) }),
    ).rejects.toThrow();
    const bad = {
      ...D,
      blueprints: { ...D.blueprints, gold: { wood: -1, stone: 0, gold: 0, diamonds: 0 } },
    };
    await expect(call(cfgMod.saveArchitectAdmin, bad)).rejects.toThrow();
    await expect(call(cfgMod.saveArchitectAdmin, D)).resolves.toEqual(D);
    expect(s.sql.at(-1)).toMatch(/INSERT INTO yuplink\.settings[\s\S]*'architect_config'/);
  });

  it("не админ — отказ", async () => {
    s.admin = false;
    await expect(call(cfgMod.saveArchitectAdmin, D)).rejects.toThrow("Доступ запрещён");
    await expect(call(cfgMod.getArchitectAdmin)).rejects.toThrow("Доступ запрещён");
  });
});

describe("состояние и улучшение", () => {
  it("уровень 1: дерево можно, камень, золото и алмазы — нужен уровень", async () => {
    s.level = 1;
    const r = (await call(state.getCastleArchitect)) as Awaited<
      ReturnType<typeof state.getCastleArchitect>
    >;
    expect(r.level).toBe(1);
    expect(r.cost).toEqual(D.levels[1]);
    expect(r.resources).toEqual({ wood: 400 });
    expect(r.hero).toEqual({ name: "Юпик", builder: false });
    expect(Object.fromEntries(r.blueprints.map((b) => [b.kind, b.problem]))).toEqual({
      wood: null,
      stone: "level",
      gold: "level",
      diamonds: "level",
    });
  });

  it("улучшение: цена шага из настройки, ключ операции с аккаунтом", async () => {
    await expect(
      call(state.upgradeCastleArchitect, { fromLevel: 2, opId: "op-12345678" }),
    ).resolves.toEqual({ level: 3 });
    expect(s.rpc[0]).toEqual({
      fn: "castle_architect_upgrade",
      args: { p_account: "acc_me", p_from: 2, p_cost: D.levels[2], p_op: "up:acc_me:op-12345678" },
    });
  });

  it("на потолке — без вызова базы; нехватка ресурсов — понятный ключ", async () => {
    await expect(
      call(state.upgradeCastleArchitect, { fromLevel: 4, opId: "op-12345678" }),
    ).rejects.toThrow("architect.max_level");
    expect(s.rpc).toHaveLength(0);
    s.rpcError = "res_move: в минус";
    await expect(
      call(state.upgradeCastleArchitect, { fromLevel: 0, opId: "op-12345678" }),
    ).rejects.toThrow("architect.no_resources");
  });
});

describe("изготовление", () => {
  const make = (kind: string) => call(craft.craftMineBlueprint, { kind, opId: "op-abcdefgh" });
  const reads = () => s.sql.filter((q) => /SELECT refunded_at/.test(q));
  beforeEach(() => void (s.level = 1));

  it("оплата заготовки и выдача в рюкзак выбранного героя", async () => {
    s.level = 2;
    await expect(make("stone")).resolves.toEqual({ ok: true, kind: "stone", applied: true });
    expect(s.rpc).toEqual([
      {
        fn: "castle_architect_pay",
        args: {
          p_account: "acc_me",
          p_kind: "stone",
          p_cost: D.blueprints.stone,
          p_op: "bp:acc_me:op-abcdefgh",
        },
      },
    ]);
    expect(s.deposits[0]).toMatchObject({
      heroId: "h1",
      account: "acc_me",
      qty: 1,
      item: { kind: "custom", refId: "cst_mine_bp_stone" },
      nonce: "archbp_acc_me_op-abcdefgh",
    });
    // Свежая быстрая выдача — без сверки оплаты.
    expect(reads()).toHaveLength(0);
  });

  it("не легло в рюкзак — ключ выдачи заперт и оплата вернулась одним оператором", async () => {
    s.depositError = "market.backpack_need:1:0";
    await expect(make("wood")).rejects.toThrow(/^architect\.refunded:market\.backpack_need:1:0$/);
    // Отдельного вызова возврата нет: он внутри оператора, запирающего ключ.
    expect(s.rpc.map((r) => r.fn)).toEqual(["castle_architect_pay"]);
    const undo = s.sql.filter((q) => /castle_architect_refund/.test(q));
    expect(undo).toHaveLength(1);
    expect(undo[0]).toContain("VALUES ('bp:archbp_acc_me_op-abcdefgh')");
    expect(undo[0]).toContain("RETURNING 'bp:acc_me:op-abcdefgh'::text AS pay_op");
    expect(undo[0]).toContain("castle_architect_refund(blk.pay_op)");
  });

  it("выдача «упала», а ключ рюкзака лёг — успех, ресурсы не возвращаются", async () => {
    Object.assign(s, { depositError: "MCP timeout", bpLanded: true });
    await expect(make("wood")).resolves.toEqual({ ok: true, kind: "wood", applied: true });
    expect(s.rpc.map((r) => r.fn)).toEqual(["castle_architect_pay"]);
    expect(reads()[0]).toContain("WHERE op_id = 'bp:acc_me:op-abcdefgh'");
  });

  it("ключ стоял, но оплату уже вернули (повтор отката) — ошибка, не успех", async () => {
    Object.assign(s, { depositError: "MCP timeout", bpLanded: true, wasBack: true });
    await expect(make("wood")).rejects.toThrow(/^architect\.refunded:MCP timeout$/);
  });

  it("ключ запер добор: откат «лёг» по снимку, повтор «прошёл» — оба не успех", async () => {
    Object.assign(s, { depositError: "MCP timeout", bpLanded: true, swept: true });
    await expect(make("wood")).rejects.toThrow(/^architect\.refunded:MCP timeout$/);
    s.depositError = null;
    s.payStatus = "repeat";
    await expect(make("wood")).rejects.toThrow(/^architect\.op_refunded$/);
  });

  it("вид не из списка — отказ проверки ввода", async () => {
    await expect(make("iron")).rejects.toThrow();
    expect(s.rpc).toHaveLength(0);
  });
});
