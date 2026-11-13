// Товары в цене Архитектора поверх фейковой базы: оплата заготовки и улучшения
// берёт товары из рюкзака выбранного героя (канон ключа, p_hero), нехватка —
// отказ со списком ДО оплаты, гонка — тот же ключ из базы; окно видит имя,
// картинку и сколько есть; админ сохраняет только товары из справочника.
import { beforeEach, describe, expect, it, vi } from "vitest";

type Fn = (a: { data: unknown }) => Promise<unknown>;
const s = vi.hoisted(() => ({
  admin: true,
  level: 1,
  hero: true,
  board: 5,
  settings: null as string | null,
  alias: {} as Record<string, string>,
  sql: [] as string[],
  rpc: [] as Array<{ fn: string; args: Record<string, unknown> }>,
  rpcError: null as string | null,
  /** Ключ оплаты уже есть (повтор оплаченного нажатия). */
  paidOp: false,
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
vi.mock("@/server/api/beta-raid/item-alias", () => ({
  canonStackKey: async (kind: string, ref: string) => `${kind}:${s.alias[ref] ?? ref}`,
}));
vi.mock("@/server/db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    s.sql.push(sql);
    if (/FROM yuplink.settings/.test(sql)) return s.settings ? [{ value: s.settings }] : [];
    if (/FROM yuplink.castle_architect /.test(sql)) return [{ level: s.level }];
    if (/FROM yuplink.account_resources/.test(sql)) return [];
    if (/SELECT refunded_at FROM yuplink\.castle_architect_op/.test(sql))
      return s.paidOp ? [{ refunded_at: null }] : [];
    if (/FROM yuplink.raid_hero_backpack/.test(sql))
      return /'custom:cst_board'/.test(sql)
        ? [{ stack_key: "custom:cst_board", count: s.board }]
        : [];
    if (/FROM yuplink.raid_custom_item/.test(sql))
      return /'cst_board'/.test(sql)
        ? [{ id: "cst_board", name: "Доска", image: "/u/board.png" }]
        : [];
    return [];
  },
}));
vi.mock("@/server/db/pg", () => ({
  sb: {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      s.rpc.push({ fn, args });
      if (s.rpcError) return { error: { message: s.rpcError }, data: null };
      if (fn === "castle_architect_pay") return { error: null, data: [{ status: "paid" }] };
      return { error: null, data: [{ level: Number(args.p_from) + 1 }] };
    },
  },
}));
vi.mock("@/server/api/beta-raid/market-backpack", () => ({
  resolveBackpack: async () =>
    s.hero ? { heroId: "h1", heroName: "Юпик", spec: null, capacity: 8, potionCapacity: 2 } : null,
  stackKeyFor: async (it: { kind: string; refId: string }) => `${it.kind}:${it.refId}`,
  assertBackpackRoomFor: async () => {},
  depositToBackpack: async () => {},
}));

const cfgMod = await import("./architect-config");
const state = await import("./architect-state");
const craft = await import("./craft");
const { DEFAULT_ARCHITECT_CONFIG: D } = await import("@/lib/castleArchitect");
const call = (f: unknown, data?: unknown) => (f as Fn)({ data });

const BOARD = { key: "custom:cst_board", qty: 3, name: "Доска" };
const withGoods = (goods: unknown[]) =>
  JSON.stringify({
    levels: [{ ...D.levels[0], goods }],
    blueprints: { wood: { ...D.blueprints.wood, goods } },
  });

beforeEach(() => {
  Object.assign(s, {
    admin: true,
    level: 1,
    hero: true,
    board: 5,
    rpcError: null,
    alias: {},
    paidOp: false,
  });
  s.settings = withGoods([BOARD]);
  s.sql.length = 0;
  s.rpc.length = 0;
  cfgMod.dropArchitectConfigCache();
});

const make = () => call(craft.craftMineBlueprint, { kind: "wood", opId: "op-abcdefgh" });

describe("оплата товарами", () => {
  it("заготовка: товары в цене и герой, с которого брать", async () => {
    await expect(make()).resolves.toMatchObject({ ok: true, applied: true });
    expect(s.rpc[0].args).toEqual({
      p_account: "acc_me",
      p_kind: "wood",
      p_cost: { ...D.blueprints.wood, goods: [BOARD] },
      p_op: "bp:acc_me:op-abcdefgh",
      p_hero: "h1",
    });
  });

  it("товаров мало — отказ со списком недостающего, оплаты нет", async () => {
    s.board = 1;
    await expect(make()).rejects.toThrow("architect.no_goods:Доска ×2");
    expect(s.rpc).toHaveLength(0);
  });

  it("повтор оплаченного нажатия: товары уже сняты — не отказ, оплата ответит повтором", async () => {
    Object.assign(s, { board: 0, paidOp: true });
    await expect(make()).resolves.toMatchObject({ ok: true });
    expect(s.rpc.map((r) => r.fn)).toEqual(["castle_architect_pay"]);
  });

  it("ключ товара — к канону; две строки одного товара складываются", async () => {
    s.alias = { cst_boards: "cst_board" };
    s.settings = withGoods([BOARD, { key: "custom:cst_boards", qty: 1, name: "Доски" }]);
    await make();
    expect((s.rpc[0].args.p_cost as { goods: unknown }).goods).toEqual([{ ...BOARD, qty: 4 }]);
  });

  it("гонка мимо предпроверки — отказ базы тем же ключом", async () => {
    s.rpcError = "architect_no_goods:Доска ×1";
    await expect(make()).rejects.toThrow(/^architect\.no_goods:Доска ×1$/);
  });

  it("улучшение: товары с выбранного героя; нет героя — отказ до оплаты", async () => {
    await call(state.upgradeCastleArchitect, { fromLevel: 0, opId: "op-12345678" });
    expect(s.rpc[0].args).toMatchObject({ p_cost: { goods: [BOARD] }, p_hero: "h1" });
    s.rpc.length = 0;
    s.hero = false;
    await expect(
      call(state.upgradeCastleArchitect, { fromLevel: 0, opId: "op-12345678" }),
    ).rejects.toThrow("market.need_hero");
    expect(s.rpc).toHaveLength(0);
  });

  it("окно: имя и картинка из справочника, сколько есть у героя", async () => {
    s.level = 0;
    s.board = 2;
    const r = (await call(state.getCastleArchitect)) as Awaited<
      ReturnType<typeof state.getCastleArchitect>
    >;
    const view = { ...BOARD, image: "/u/board.png", have: 2 };
    expect(r.costGoods).toEqual([view]);
    expect(r.blueprints.find((b) => b.kind === "wood")?.goods).toEqual([view]);
    expect(r.blueprints.find((b) => b.kind === "stone")?.goods).toEqual([]);
  });
});

describe("админ: сохранение цен с товарами", () => {
  const save = (patch: Record<string, unknown>) =>
    call(cfgMod.saveArchitectAdmin, {
      ...D,
      blueprints: { ...D.blueprints, gold: { ...D.blueprints.gold, ...patch } },
    });
  const wrote = () => s.sql.filter((q) => /INSERT INTO yuplink\.settings/.test(q));

  it("форма: только «custom:<id>», целые штуки от 1, не больше 8 строк", async () => {
    await expect(save({ goods: [{ key: "mystic:x", qty: 1 }] })).rejects.toThrow();
    await expect(save({ goods: [{ ...BOARD, qty: 0 }] })).rejects.toThrow();
    await expect(save({ goods: [{ ...BOARD, qty: 1.5 }] })).rejects.toThrow();
    const many = Array.from({ length: 9 }, (_, i) => ({ key: `custom:cst_${i}`, qty: 1 }));
    await expect(save({ goods: many })).rejects.toThrow();
    expect(wrote()).toHaveLength(0);
  });

  it("товара нет в справочнике — отказ, настройка не записана", async () => {
    await expect(save({ goods: [{ key: "custom:cst_ghost", qty: 1 }] })).rejects.toThrow(
      "architect.bad_good",
    );
    expect(wrote()).toHaveLength(0);
  });

  it("имя — из справочника, повторы складываются, цена записана", async () => {
    const cfg = (await save({
      goods: [
        { key: "custom:cst_board", qty: 2, name: "Хлам" },
        { key: "custom:cst_board", qty: 1 },
      ],
    })) as typeof D;
    expect(cfg.blueprints.gold.goods).toEqual([BOARD]);
    expect(wrote()[0]).toContain('"goods":[{"key":"custom:cst_board","name":"Доска","qty":3}]');
    // Пустой список — цена без товаров.
    const plain = (await save({ goods: [] })) as typeof D;
    expect(plain.blueprints.gold).toEqual(D.blueprints.gold);
  });

  it("не админ — отказ", async () => {
    s.admin = false;
    await expect(save({ goods: [BOARD] })).rejects.toThrow("Доступ запрещён");
  });
});
