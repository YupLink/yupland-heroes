// «Забрать сундук» (обычный, §8.22): сундук — в рюкзак первым (нет места —
// отказ с числами), содержимое — сколько влезет, остальное мешочком на клетке;
// с товаром — только по подтверждённым цифрам (отпечаток sig); повтор нажатия
// — тот же итог без второй записи; гонка с «положить»/«забрать» и второй
// «Забрать сундук» — одно из двух, без дюпа и потерь.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NO, f, packOf, resetFake, slotsOf } from "./pchest.fake";

const M = vi.hoisted(() => "./pchest.fake-mocks");
vi.mock("@tanstack/react-start", async () => (await import(M)).startFn);
vi.mock("@/server/db/mcpClient", async () => (await import(M)).mcp);
vi.mock("@/server/raidLive", async () => (await import(M)).live);
vi.mock("./pchest-row", async () => (await import(M)).rowMod);
vi.mock("./pchest-read", async () => (await import(M)).readMod);
vi.mock("./pchest-move-sql", async () => (await import(M)).sqlMods.move);
vi.mock("./pchest-pickup-sql", async () => (await import(M)).sqlMods.pickup);
vi.mock("./pchest-note", async () => (await import(M)).misc.note);
vi.mock("../open-pass/pass", async () => (await import(M)).passMod);
vi.mock("../econ/trade-journal", async () => (await import(M)).misc.journal);
vi.mock("../loot-bag/bag-sweep", async () => (await import(M)).misc.sweep);
vi.mock("../market-backpack", async () => (await import(M)).backpack);
vi.mock("../tool-wear", async () => (await import(M)).toolWear);
vi.mock("../chest/chest-net-read", async () => (await import(M)).netRead);
vi.mock("../potion-bag", async () => (await import(M)).potionBag);
vi.mock("../chest/chest-row", async () => (await import(M)).chestRow);

const { who } = await import("./pchest.fake-mocks");
const pickMod = await import("./pchest-pickup");
const putMod = await import("./pchest-put");
type Res = { taken: Array<{ stackKey: string; qty: number }>; bagged: Array<{ stackKey: string; qty: number }>; bagId: string | null };
type View = { sig: string; fits: boolean; need: number; free: number; taken: unknown[]; bagged: unknown[] };
const call = <T>(fn: unknown, wallet: string, data: object) => {
  who.wallet = wallet;
  return (fn as (a: { data: unknown }) => Promise<T>)({ data });
};
const view = (wallet = "w2") => call<View>(pickMod.getPlainPickup, wallet, { q: 5, r: 6 });
const pick = (wallet: string, o: string, sig?: string) =>
  call<Res>(pickMod.pickUpPlainChest, wallet, { q: 5, r: 6, op: o, sig });
/** Посмотреть цифры и забрать по ним — как окно подтверждения. */
const pickSeen = async (wallet: string, o: string) => pick(wallet, o, (await view(wallet)).sig);

const ID = "pc_1";
const APPLE = "custom:cst_apple";
const slots = () => slotsOf(ID);

beforeEach(() => {
  resetFake();
  for (const [w, acc, hero, q] of [
    ["w1", "acc1", "h1", 5],
    ["w2", "acc2", "h2", 6],
  ] as const) {
    f.accounts.set(w, acc);
    f.heroes.set(w, { heroId: hero, capacity: 4, potionCapacity: 1 });
    f.pos.set(w, { q, r: 6 });
  }
  f.chests.set("5,6", { id: ID, q: 5, r: 6, itemId: "cst_box", name: "Сундук", buried: false, placedBy: "acc1" });
  slots().set(APPLE, { count: 30, kind: "custom", refId: "cst_apple", name: "Яблоко" });
});

describe("забрать сундук", () => {
  it("всё влезло: сундук и товар в рюкзаке, сундука нет, мешочка нет", async () => {
    const res = await pickSeen("w2", "pick-1-op");
    expect(res).toEqual({ taken: [{ stackKey: APPLE, qty: 30 }], bagged: [], bagId: null });
    expect(packOf("h2").get("custom:cst_box")).toMatchObject({ count: 1, marks: NO });
    expect(packOf("h2").get(APPLE)).toMatchObject({ count: 30, marks: NO });
    expect(f.chests.size).toBe(0);
    expect(f.slots.has(ID)).toBe(false);
    expect(f.bags.size).toBe(0);
    expect(f.events).toContain("5,6");
  });

  it("не влезло — остаток мешочком на этой клетке, ничего не пропало", async () => {
    slots().set(APPLE, { count: 90, kind: "custom", refId: "cst_apple", name: "Яблоко" });
    const res = await pickSeen("w2", "pick-2-op");
    // Ёмкость 4: сундук — одна ячейка, яблок — три ячейки (60), 30 — в мешочек.
    expect(res.taken).toEqual([{ stackKey: APPLE, qty: 60 }]);
    expect(res.bagged).toEqual([{ stackKey: APPLE, qty: 30 }]);
    expect(res.bagId).toMatch(/^lb_[0-9a-f]{32}$/);
    const bag = f.bags.get(res.bagId ?? "");
    expect(bag).toMatchObject({ q: 5, r: 6, droppedBy: "acc2" });
    expect(bag?.items.get(APPLE)).toBe(30);
    expect(packOf("h2").get(APPLE)?.count).toBe(60);
    // Мешочку нужен сборщик в этом процессе (запускается отложенным импортом).
    await vi.waitFor(() => expect(f.sweepers).toBe(1));
  });

  it("нет места под сам сундук — отказ с числами, всё на месте", async () => {
    for (let i = 0; i < 4; i++) packOf("h2").set(`custom:y${i}`, { count: 20, wear: 0, marks: NO, kind: "custom", name: "y" });
    await expect(pick("w2", "pick-3-op")).rejects.toThrow("market.backpack_need:1:0");
    expect(f.chests.size).toBe(1);
    expect(slots().get(APPLE)?.count).toBe(30);
  });

  it("с товаром — только по цифрам: без подтверждения и после перемен — pchest.confirm", async () => {
    await expect(pick("w2", "pick-4-op")).rejects.toThrow("pchest.confirm");
    const seen = await view();
    slots().set(APPLE, { count: 31, kind: "custom", refId: "cst_apple", name: "Яблоко" });
    await expect(pick("w2", "pick-4-op", seen.sig)).rejects.toThrow("pchest.confirm");
    expect(f.chests.size).toBe(1);
    await expect(pickSeen("w2", "pick-4-op")).resolves.toMatchObject({ taken: [{ stackKey: APPLE, qty: 31 }] });
  });

  it("пустой сундук забирается без подтверждения", async () => {
    slots().clear();
    await expect(pick("w2", "pick-5-op")).resolves.toEqual({ taken: [], bagged: [], bagId: null });
    expect(packOf("h2").get("custom:cst_box")?.count).toBe(1);
  });

  it("закопанный не забрать", async () => {
    const c = f.chests.get("5,6");
    if (c) c.buried = true;
    await expect(pick("w2", "pick-6-op")).rejects.toThrow("pchest.buried");
  });
});

describe("повторы и гонки", () => {
  it("повтор того же нажатия (ответ потерялся) — тот же итог, второй записи нет", async () => {
    slots().set(APPLE, { count: 90, kind: "custom", refId: "cst_apple", name: "Яблоко" });
    const sig = (await view()).sig;
    f.lose = "pickup";
    const first = await pick("w2", "pick-7-op", sig);
    const again = await pick("w2", "pick-7-op", sig);
    expect(again).toEqual(first);
    expect(packOf("h2").get("custom:cst_box")?.count).toBe(1);
    expect(packOf("h2").get(APPLE)?.count).toBe(60);
    expect(f.bags.size).toBe(1);
  });

  it("двое жмут «Забрать сундук» разом — сундук и товар уезжают один раз", async () => {
    const [s1, s2] = [(await view("w1")).sig, (await view("w2")).sig];
    const got = await Promise.allSettled([pick("w1", "pick-a-op", s1), pick("w2", "pick-b-op", s2)]);
    expect(got.filter((g) => g.status === "fulfilled")).toHaveLength(1);
    expect(String(got.find((g) => g.status === "rejected")?.reason)).toContain("pchest.gone");
    const boxes = (packOf("h1").get("custom:cst_box")?.count ?? 0) + (packOf("h2").get("custom:cst_box")?.count ?? 0);
    const apples = (packOf("h1").get(APPLE)?.count ?? 0) + (packOf("h2").get(APPLE)?.count ?? 0);
    expect([boxes, apples]).toEqual([1, 30]);
  });

  it("«положить» между цифрами и записью — нужны новые цифры; положенное не пропало", async () => {
    packOf("h1").set(APPLE, { count: 5, wear: 0, marks: NO, kind: "custom", name: "Яблоко" });
    const sig = (await view()).sig;
    await call(putMod.putToPlainChest, "w1", { q: 5, r: 6, stackKey: APPLE, qty: 5, op: "put-mid" });
    await expect(pick("w2", "pick-8-op", sig)).rejects.toThrow("pchest.confirm");
    const res = await pickSeen("w2", "pick-8-op");
    expect(res.taken).toEqual([{ stackKey: APPLE, qty: 35 }]);
    expect(packOf("h1").has(APPLE)).toBe(false);
    expect(packOf("h2").get(APPLE)?.count).toBe(35);
  });

  it("«положить» после «Забрать сундук» — сундука нет, рюкзак не тронут", async () => {
    packOf("h1").set(APPLE, { count: 5, wear: 0, marks: NO, kind: "custom", name: "Яблоко" });
    await pickSeen("w2", "pick-9-op");
    await expect(
      call(putMod.putToPlainChest, "w1", { q: 5, r: 6, stackKey: APPLE, qty: 5, op: "put-late" }),
    ).rejects.toThrow("pchest.gone");
    expect(packOf("h1").get(APPLE)?.count).toBe(5);
  });
});
