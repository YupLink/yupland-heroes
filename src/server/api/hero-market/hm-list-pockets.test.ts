// Рынок героев: карманы выставляемого — основному герою (владелец, 22.10.2026).
// База подделана (hm-list.fake) с семантикой hero-market-03: сверка отпечатка,
// отказы до записей, перенос по плану. Проверяем: всё влезло — без окна и без
// мешочка; не влезло — без согласия героя отказ со списком и ключом, ничего не
// тронуто, с его ключом — перенос и мешочек; «поменялось» — пересчёт; грибы без
// места встают на карту сразу. Согласие в пачке и без основного —
// hm-list-accept.test.ts.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fx, listCalls, pocket, resetFx } from "./hm-list.fake";

vi.mock("@/server/db/mcpClient", async () => (await import("./hm-list.fake")).mocks.mcp);
vi.mock("@/server/raidLive", async () => (await import("./hm-list.fake")).mocks.live);
vi.mock(
  "@/server/api/beta-raid/loot-bag/bag-note",
  async () => (await import("./hm-list.fake")).mocks.note,
);
vi.mock(
  "@/server/api/beta-raid/loot-bag/bag-sweep",
  async () => (await import("./hm-list.fake")).mocks.sweep,
);
vi.mock(
  "@/server/api/beta-raid/market-backpack",
  async () => (await import("./hm-list.fake")).mocks.backpack,
);
vi.mock(
  "@/server/api/beta-raid/dmine/dmine-autoplace",
  async () => (await import("./hm-list.fake")).mocks.autoplace,
);

const { listHeroesAs, listInputSchema } = await import("./hm-list");

const APPLE = "custom:cst_apple";
const AXE = "custom:cst_axe";
const DMINE = "dmine:darai";

/** Выставить одного героя; acceptKey — согласие на окно «выпадет». */
const list1 = async (itemId: string, acceptKey?: string) =>
  (
    await listHeroesAs(
      "w.near",
      "acc_S",
      listInputSchema.parse({
        op: "click-0001",
        heroes: [{ itemId, priceGold: 1500, ...(acceptKey ? { acceptKey } : {}) }],
      }),
    )
  ).results[0];

/** Ключ из отказа pockets_overflow (окно его показывает и шлёт назад). */
const keyOf = (r: Awaited<ReturnType<typeof list1>>): string => (!r.ok && r.dropsKey) || "";

const main = () => Object.fromEntries(fx.mainStacks.map((s) => [s.stackKey, s.count]));

beforeEach(() => resetFx());

describe("всё влезло", () => {
  it("карманы — в рюкзак основного, без окна, без мешочка и событий", async () => {
    fx.pockets.set("ugi_a", [pocket(APPLE, 12), pocket(AXE, 2, { wear: 40 })]);
    const r = await list1("ugi_a");
    // Итог — по ответу базы (раскладка лота), по ключу стопки.
    expect(r.ok && r.toMain.map((m) => `${m.stackKey}×${m.qty}${m.worn ? "*" : ""}`)).toEqual([
      `${APPLE}×12`,
      `${AXE}×2*`,
    ]);
    expect(r.ok && [r.bag, r.drops]).toEqual([null, []]);
    expect(main()).toEqual({ [AXE]: 2, [APPLE]: 12 });
    expect(fx.events).toHaveLength(0);
    // Выпадать нечему — согласие базе не передаётся.
    expect(listCalls()[0]).toContain(", false) AS r");
  });
});

describe("не влезло", () => {
  beforeEach(() => {
    fx.main = { heroId: "hi_main", capacity: 1, potionCapacity: 3 };
    fx.pockets.set("ugi_a", [pocket(APPLE, 5), pocket(AXE, 1, { wear: 30 })]);
  });

  it("без согласия — отказ pockets_overflow со списком и ключом, ничего не тронуто", async () => {
    const r = await list1("ugi_a");
    expect(!r.ok && r.error).toBe("heromkt.pockets_overflow");
    expect(!r.ok && r.toMain).toEqual([
      { stackKey: AXE, kind: "custom", name: AXE, qty: 1, worn: true },
    ]);
    expect(!r.ok && r.drops).toEqual([
      {
        stackKey: APPLE,
        kind: "custom",
        name: APPLE,
        qty: 5,
        worn: false,
        bag: 5,
        burn: 0,
        plant: 0,
      },
    ]);
    expect(keyOf(r)).toMatch(/^dk_[0-9a-z]+$/);
    expect(main()).toEqual({});
  });

  it("чужой ключ — тоже отказ: согласие только на показанный список", async () => {
    const r = await list1("ugi_a", "dk_other");
    expect(!r.ok && r.error).toBe("heromkt.pockets_overflow");
    expect(main()).toEqual({});
  });

  it("с ключом из окна — начатый топор основному, яблоки — мешочком; событие, журнал", async () => {
    const key = keyOf(await list1("ugi_a"));
    const r = await list1("ugi_a", key);
    expect(r.ok && r.bag).toEqual({ id: "lb_ugi_a", mapId: "rmap_A", q: 5, r: -3 });
    expect(r.ok && r.pockets.map((p) => `${p.stackKey}×${p.count}`)).toEqual([`${APPLE}×5`]);
    expect(r.ok && r.drops.map((d) => d.stackKey)).toEqual([APPLE]);
    expect(main()).toEqual({ [AXE]: 1 });
    expect(fx.events).toEqual([{ mapId: "rmap_A", type: "bags", cells: ["5,-3"] }]);
    expect(fx.notes).toHaveLength(1);
    expect(listCalls().at(-1)).toContain(", true) AS r");
  });

  it("ключ устарел (основной что-то подобрал) — отказ с новым списком и новым ключом", async () => {
    const old = keyOf(await list1("ugi_a"));
    // Между окном и нажатием основной подобрал груши: место под топор занято.
    fx.mainStacks.push({ stackKey: "custom:cst_pear", count: 20, potion: false });
    fx.seen = "fp-2";
    const r = await list1("ugi_a", old);
    expect(!r.ok && r.error).toBe("heromkt.pockets_overflow");
    expect(!r.ok && r.drops?.map((d) => `${d.stackKey}:${d.bag}/${d.burn}`)).toEqual([
      `${AXE}:0/1`,
      `${APPLE}:5/0`,
    ]);
    const fresh = keyOf(r);
    expect(fresh).not.toBe(old);
    expect(main()).toEqual({ "custom:cst_pear": 20 });
    expect((await list1("ugi_a", fresh)).ok).toBe(true);
  });

  it("игрока нет на карте — no_position со списком, ничего не тронуто", async () => {
    fx.onMap = false;
    const r = await list1("ugi_a", keyOf(await list1("ugi_a")));
    expect(!r.ok && [r.error, r.drops?.length]).toEqual(["heromkt.no_position", 1]);
    expect(main()).toEqual({});
  });
});

describe("гонки", () => {
  it("рюкзаки поменялись под рукой — пересчёт; не утихло за 3 раза — «повтори»", async () => {
    fx.pockets.set("ugi_a", [pocket(APPLE, 3)]);
    fx.changed = 2;
    expect((await list1("ugi_a")).ok).toBe(true);
    expect(listCalls()).toHaveLength(3);

    resetFx();
    fx.pockets.set("ugi_b", [pocket(APPLE, 3)]);
    fx.changed = 3;
    const r = await list1("ugi_b");
    expect(!r.ok && r.error).toBe("heromkt.busy_retry");
    expect(main()).toEqual({});
  });
});

describe("грибы", () => {
  it("без места — основному в рюкзак и сразу на карту у игрока (как через час)", async () => {
    fx.main = { heroId: "hi_main", capacity: 1, potionCapacity: 3 };
    fx.pockets.set("ugi_a", [pocket(DMINE, 1, { kind: "dmine" }), pocket(APPLE, 20)]);
    const r = await list1("ugi_a", keyOf(await list1("ugi_a")));
    expect(r.ok && r.drops).toEqual([
      {
        stackKey: DMINE,
        kind: "dmine",
        name: DMINE,
        qty: 1,
        worn: false,
        bag: 0,
        burn: 0,
        plant: 1,
      },
    ]);
    expect(r.ok && r.bag).toBeNull();
    expect(fx.planted).toEqual([
      {
        id: "dm_ugi_a_0",
        hero_id: "hi_main",
        account_id: "acc_S",
        mushroom: "darai",
        wallet: "w.near",
        map_id: "rmap_A",
        q: 5,
        r: -3,
      },
    ]);
  });
});
