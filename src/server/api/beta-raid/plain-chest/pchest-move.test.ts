// Обычный сундук (§8.22): поставить из рюкзака на свою или соседнюю клетку,
// положить (всё, и купленное; метки сбрасываются), забрать (безымянным,
// «сколько влезет», зелья — только в сумку), 10 ячеек: долив и отказ, повтор
// нажатия без второго эффекта. Базы нет — фейк (pchest.fake*) исполняет
// операторы по смыслу SQL.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NO, f, packOf, resetFake, slotsOf } from "./pchest.fake";
import { marksOf } from "./pchest.fake-cmd";

const M = vi.hoisted(() => "./pchest.fake-mocks");
vi.mock("@tanstack/react-start", async () => (await import(M)).startFn);
vi.mock("@/server/db/mcpClient", async () => (await import(M)).mcp);
vi.mock("@/server/raidLive", async () => (await import(M)).live);
vi.mock("./pchest-row", async () => (await import(M)).rowMod);
vi.mock("./pchest-read", async () => (await import(M)).readMod);
vi.mock("./pchest-move-sql", async () => (await import(M)).sqlMods.move);
vi.mock("./pchest-place-sql", async () => (await import(M)).sqlMods.place);
vi.mock("./pchest-note", async () => (await import(M)).misc.note);
vi.mock("../open-pass/pass", async () => (await import(M)).passMod);
vi.mock("../market-backpack", async () => (await import(M)).backpack);
vi.mock("../tool-wear", async () => (await import(M)).toolWear);
vi.mock("../chest/chest-net-read", async () => (await import(M)).netRead);
vi.mock("../potion-bag", async () => (await import(M)).potionBag);
vi.mock("../chest/chest-row", async () => (await import(M)).chestRow);
vi.mock("../encounter-where", async () => (await import(M)).misc.where);
vi.mock("../voidGate", async () => (await import(M)).misc.voidGate);
vi.mock("../item-alias", async () => (await import(M)).misc.alias);

const { who, chestIdAt } = await import("./pchest.fake-mocks");
const place = await import("./pchest-place");
const putMod = await import("./pchest-put");
const takeMod = await import("./pchest-take");
type Call = (a: { data: unknown }) => Promise<{ qty?: number; q?: number; r?: number }>;
const call = (fn: unknown, wallet: string, data: object) => {
  who.wallet = wallet;
  return (fn as Call)({ data });
};

const CHEST = "custom:cst_box";
const APPLE = "custom:cst_apple";
const POTION = "custom:cst_pot";
let n = 0;
const op = () => `press-${++n}-x`;
const put = (wallet: string, stackKey: string, qty: number, o = op()) =>
  call(putMod.putToPlainChest, wallet, { q: 5, r: 6, stackKey, qty, op: o });
const take = (wallet: string, stackKey: string, qty: number, o = op()) =>
  call(takeMod.takeFromPlainChest, wallet, { q: 5, r: 6, stackKey, qty, op: o });
const slots = () => slotsOf(chestIdAt(5, 6));

beforeEach(async () => {
  resetFake();
  f.catalog.set("cst_box", { name: "Сундук", plain: true });
  for (const [w, acc, hero, q] of [
    ["w1", "acc1", "h1", 5],
    ["w2", "acc2", "h2", 6],
  ] as const) {
    f.accounts.set(w, acc);
    f.heroes.set(w, { heroId: hero, capacity: 4, potionCapacity: 1 });
    f.pos.set(w, { q, r: 6 });
  }
  packOf("h1").set(CHEST, { count: 2, wear: 0, marks: { ...NO }, kind: "custom", name: "Сундук" });
  await call(place.placePlainChest, "w1", { stackKey: CHEST, dq: 0, dr: 0, op: "place-0" });
});

describe("поставить", () => {
  it("под себя: сундук на клетке, штука списана, все рядом узнали ('built')", () => {
    expect(chestIdAt(5, 6)).toMatch(/^pc_[0-9a-f]{32}$/);
    expect(packOf("h1").get(CHEST)?.count).toBe(1);
    expect(f.events).toContain("5,6");
  });

  it("на соседнюю клетку; дальше — отказ", async () => {
    await expect(
      call(place.placePlainChest, "w1", { stackKey: CHEST, dq: 1, dr: -1, op: op() }),
    ).resolves.toMatchObject({ q: 6, r: 5 });
    await expect(
      call(place.placePlainChest, "w1", { stackKey: CHEST, dq: 1, dr: 1, op: op() }),
    ).rejects.toThrow("pchest.place_far");
  });

  it("на клетке уже сундук (или бугорок) или постройка — отказ, штука цела", async () => {
    await expect(
      call(place.placePlainChest, "w1", { stackKey: CHEST, dq: 0, dr: 0, op: op() }),
    ).rejects.toThrow("chest.cell_busy");
    f.blocked.add("4,6");
    await expect(
      call(place.placePlainChest, "w1", { stackKey: CHEST, dq: -1, dr: 0, op: op() }),
    ).rejects.toThrow("chest.cell_busy");
    expect(packOf("h1").get(CHEST)?.count).toBe(1);
  });

  it("повтор того же нажатия (ответ потерялся) — второго сундука нет", async () => {
    f.replay = 1;
    await call(place.placePlainChest, "w1", { stackKey: CHEST, dq: 0, dr: 1, op: "pl-rep" });
    await call(place.placePlainChest, "w1", { stackKey: CHEST, dq: 0, dr: 1, op: "pl-rep" });
    expect(f.chests.size).toBe(2);
    expect(packOf("h1").has(CHEST)).toBe(false);
  });
});

describe("вход «Открыть» (§8.23)", () => {
  it("без живого входа ни положить, ни забрать — «Сначала открой», ячейки не тронуты", async () => {
    f.passAll = false;
    await expect(put("w1", APPLE, 3)).rejects.toThrow("pass.closed");
    await expect(take("w1", APPLE, 1)).rejects.toThrow("pass.closed");
    expect(slots().size).toBe(0);
  });
});

describe("положить и забрать", () => {
  it("купленное кладётся; метки при вкладе сбрасываются, забранное — безымянное", async () => {
    packOf("h1").set(APPLE, {
      count: 10,
      wear: 0,
      marks: { mob: 4, mine: 0, field: 0, loot: 2 },
      kind: "custom",
      name: "Яблоко",
    });
    await expect(put("w1", APPLE, 8)).resolves.toMatchObject({ qty: 8 });
    // Безымянное ушло первым (4 шт.), потом прочее (2), мобы — последними.
    expect(marksOf("h1", APPLE)).toEqual({ mob: 2, mine: 0, field: 0, loot: 0 });
    expect(slots().get(APPLE)?.count).toBe(8);
    // Другой игрок забирает — безымянным.
    await expect(take("w2", APPLE, 5)).resolves.toMatchObject({ qty: 5 });
    expect(packOf("h2").get(APPLE)).toMatchObject({ count: 5, marks: NO });
    expect(slots().get(APPLE)?.count).toBe(3);
    expect(f.events.filter((c) => c === "5,6").length).toBeGreaterThanOrEqual(3);
  });

  it("изношенная штука инструмента не уходит", async () => {
    packOf("h1").set("custom:cst_axe", { count: 1, wear: 30, marks: NO, kind: "custom", name: "Топор" });
    await expect(put("w1", "custom:cst_axe", 1)).rejects.toThrow("braid.tool_worn_stays");
    expect(slots().size).toBe(0);
  });

  it("10 ячеек: полный сундук доливает свою ячейку, новую — отказ", async () => {
    for (let i = 0; i < 9; i++) slots().set(`custom:x${i}`, { count: 20, kind: "custom", refId: null, name: "x" });
    slots().set(APPLE, { count: 15, kind: "custom", refId: null, name: "Яблоко" });
    packOf("h1").set(APPLE, { count: 5, wear: 0, marks: NO, kind: "custom", name: "Яблоко" });
    packOf("h1").set("custom:pear", { count: 3, wear: 0, marks: NO, kind: "custom", name: "Груша" });
    await expect(put("w1", APPLE, 5)).resolves.toMatchObject({ qty: 5 });
    expect(slots().get(APPLE)?.count).toBe(20);
    await expect(put("w1", "custom:pear", 3)).rejects.toThrow("pchest.full");
    expect(packOf("h1").get("custom:pear")?.count).toBe(3);
  });

  it("забрать — сколько влезет: остальное остаётся в сундуке", async () => {
    slots().set(APPLE, { count: 50, kind: "custom", refId: null, name: "Яблоко" });
    for (let i = 0; i < 2; i++) packOf("h2").set(`custom:y${i}`, { count: 20, wear: 0, marks: NO, kind: "custom", name: "y" });
    await expect(take("w2", APPLE, 50)).resolves.toMatchObject({ qty: 40 });
    expect(slots().get(APPLE)?.count).toBe(10);
    await expect(take("w2", APPLE, 10)).rejects.toThrow("market.backpack_full");
  });

  it("зелье — только в сумку зелий: полная сумка не берёт", async () => {
    f.potions.add(POTION);
    slots().set(POTION, { count: 30, kind: "custom", refId: null, name: "Зелье" });
    await expect(take("w2", POTION, 30)).resolves.toMatchObject({ qty: 20 });
    await expect(take("w2", POTION, 10)).rejects.toThrow("market.potion_bag_full");
    expect(packOf("h2").get(POTION)?.count).toBe(20);
  });

  it("повтор нажатия (ответ потерялся) — без второго эффекта", async () => {
    packOf("h1").set(APPLE, { count: 10, wear: 0, marks: NO, kind: "custom", name: "Яблоко" });
    f.lose = "put";
    await expect(put("w1", APPLE, 4, "put-lost")).resolves.toMatchObject({ qty: 4 });
    await expect(put("w1", APPLE, 4, "put-lost")).resolves.toMatchObject({ qty: 4 });
    expect(slots().get(APPLE)?.count).toBe(4);
    expect(packOf("h1").get(APPLE)?.count).toBe(6);
    f.replay = 1;
    await take("w2", APPLE, 3, "take-rep");
    await take("w2", APPLE, 3, "take-rep");
    expect(slots().get(APPLE)?.count).toBe(1);
    expect(packOf("h2").get(APPLE)?.count).toBe(3);
  });

  it("двое забирают разом — ровно то, что было", async () => {
    slots().set(APPLE, { count: 12, kind: "custom", refId: null, name: "Яблоко" });
    const got = await Promise.allSettled([take("w1", APPLE, 12), take("w2", APPLE, 12)]);
    const total = (packOf("h1").get(APPLE)?.count ?? 0) + (packOf("h2").get(APPLE)?.count ?? 0);
    expect(total).toBe(12);
    expect(slots().has(APPLE)).toBe(false);
    expect(got.filter((g) => g.status === "rejected")).toHaveLength(1);
  });
});
