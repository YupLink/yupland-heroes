// Рынок героев: согласие «пусть выпадет» — по каждому герою и на показанный ему
// список (acceptKey = dropsKey). Пачка: место основного съел первый — второй без
// своего ключа не роняет ничего, отказ со списком. Основного нет — всё мешочком на
// клетку игрока, как до правки (начатая штука — как «Выбросить»); гриб без
// основного — отказ dmine_no_main. База подделана (hm-list.fake).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CELL_SIZE } from "@/lib/hero/backpackCells";
import { fx, listCalls, pocket, resetFx } from "./hm-list.fake";
import { dropsKey, dropsOf, planPockets } from "./hm-pockets-plan";

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
const HONEY = "custom:cst_honey";
const PEAR = "custom:cst_pear";
const AXE = "custom:cst_axe";

const list = (heroes: Array<{ itemId: string; acceptKey?: string }>) =>
  listHeroesAs(
    "w.near",
    "acc_S",
    listInputSchema.parse({
      op: "click-0001",
      heroes: heroes.map((h) => ({ ...h, priceGold: 1500 })),
    }),
  );

/** Ключ превью героя — как его считает listMySellableHeroes (рюкзак основного «как сейчас»). */
const previewKey = (itemId: string): string => {
  const main = fx.main ? { ...fx.main, stacks: fx.mainStacks.map((s) => ({ ...s })) } : null;
  return dropsKey(dropsOf(planPockets(fx.pockets.get(itemId) ?? [], main)));
};

beforeEach(() => resetFx());

describe("пачка: согласие у каждого героя своё", () => {
  beforeEach(() => {
    // У основного 2 пустые ячейки. A: ячейка яблок + мёда на ячейку и 5 — 5 выпадут (окно у A).
    // B: 3 груши — в превью влезают (окна нет), но после A места не останется.
    fx.pockets.set("ugi_a", [pocket(APPLE, CELL_SIZE), pocket(HONEY, CELL_SIZE + 5)]);
    fx.pockets.set("ugi_b", [pocket(PEAR, 3)]);
  });

  it("B без своего ключа — отказ со списком и ключом, его карманы не тронуты", async () => {
    expect(previewKey("ugi_b")).toBe("");
    const res = await list([
      { itemId: "ugi_a", acceptKey: previewKey("ugi_a") },
      { itemId: "ugi_b" },
    ]);
    const [a, b] = res.results;
    expect(a.ok && a.drops.map((d) => `${d.stackKey}×${d.bag}`)).toEqual([`${HONEY}×5`]);
    expect(!b.ok && b.error).toBe("heromkt.pockets_overflow");
    expect(!b.ok && b.drops?.map((d) => `${d.stackKey}×${d.bag}`)).toEqual([`${PEAR}×3`]);
    expect(!b.ok && b.dropsKey).toMatch(/^dk_/);
    expect(fx.pockets.get("ugi_b")).toEqual([pocket(PEAR, 3)]);
    expect(fx.mainStacks.map((s) => `${s.stackKey}×${s.count}`)).toEqual([
      `${APPLE}×${CELL_SIZE}`,
      `${HONEY}×${CELL_SIZE}`,
    ]);
  });

  it("ключ A не годится для B: согласие привязано к списку героя", async () => {
    const keyA = previewKey("ugi_a");
    const res = await list([
      { itemId: "ugi_a", acceptKey: keyA },
      { itemId: "ugi_b", acceptKey: keyA },
    ]);
    expect(res.results.map((r) => (r.ok ? "ok" : r.error))).toEqual([
      "ok",
      "heromkt.pockets_overflow",
    ]);
    // Окно B → согласие его ключом: тот же op, A отвечает повтором, B выставляется.
    const b = res.results[1];
    const again = await list([
      { itemId: "ugi_a", acceptKey: keyA },
      { itemId: "ugi_b", acceptKey: (!b.ok && b.dropsKey) || "" },
    ]);
    expect(again.results.map((r) => r.ok && r.fresh)).toEqual([false, true]);
    expect(fx.pockets.get("ugi_b")).toEqual([]);
  });
});

describe("основного нет", () => {
  beforeEach(() => {
    fx.main = null;
  });

  it("всё — мешочком на клетку игрока по согласию; начатая штука — как «Выбросить»", async () => {
    fx.pockets.set("ugi_a", [pocket(APPLE, 5), pocket(AXE, 3, { wear: 30 })]);
    const first = (await list([{ itemId: "ugi_a" }])).results[0];
    expect(!first.ok && first.error).toBe("heromkt.pockets_overflow");
    expect(!first.ok && first.drops?.map((d) => `${d.stackKey}:${d.bag}/${d.burn}`)).toEqual([
      `${AXE}:2/1`,
      `${APPLE}:5/0`,
    ]);
    expect(listCalls()[0]).toContain("24, NULL,");
    const r = (await list([{ itemId: "ugi_a", acceptKey: (!first.ok && first.dropsKey) || "" }]))
      .results[0];
    expect(r.ok && r.bag).toEqual({ id: "lb_ugi_a", mapId: "rmap_A", q: 5, r: -3 });
    // Итог — по ответу базы (по ключу стопки): начатая штука сгорела, целые — в мешочке.
    expect(r.ok && r.pockets.map((p) => `${p.stackKey}×${p.count}`)).toEqual([
      `${APPLE}×5`,
      `${AXE}×2`,
    ]);
    expect(r.ok && r.toMain).toEqual([]);
  });

  it("игрока нет на карте — no_position", async () => {
    fx.onMap = false;
    fx.pockets.set("ugi_a", [pocket(APPLE, 5)]);
    const r = (await list([{ itemId: "ugi_a", acceptKey: previewKey("ugi_a") }])).results[0];
    expect(!r.ok && r.error).toBe("heromkt.no_position");
  });

  it("гриб без основного — отказ dmine_no_main, ничего не тронуто", async () => {
    fx.pockets.set("ugi_a", [pocket("dmine:darai", 1, { kind: "dmine" }), pocket(APPLE, 2)]);
    const r = (await list([{ itemId: "ugi_a", acceptKey: previewKey("ugi_a") }])).results[0];
    expect(!r.ok && r.error).toBe("heromkt.dmine_no_main");
    expect(fx.pockets.get("ugi_a")).toHaveLength(2);
  });
});
