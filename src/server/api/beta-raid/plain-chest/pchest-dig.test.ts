// «Закопать» и «Выкопать» сундук (§8.22): только с лопатой (износ — как у
// мешочка, не вышло — назад); закопать можно и пустой; закопанный — бугорок:
// не положить, не забрать, не «Забрать сундук»; выкопали — тот же сундук с тем
// же содержимым, бугорок не сгорает. Магический — любой, но только без живой
// охраны (30.09); выкапывает любой. Повтор нажатия — без второго эффекта.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NO, energyOf, f, packOf, resetFake, slotsOf } from "./pchest.fake";

const M = vi.hoisted(() => "./pchest.fake-mocks");
vi.mock("@tanstack/react-start", async () => (await import(M)).startFn);
vi.mock("@/server/db/mcpClient", async () => (await import(M)).mcp);
vi.mock("@/server/raidLive", async () => (await import(M)).live);
vi.mock("./pchest-row", async () => (await import(M)).rowMod);
vi.mock("./pchest-read", async () => (await import(M)).readMod);
vi.mock("./pchest-move-sql", async () => (await import(M)).sqlMods.move);
vi.mock("./pchest-dig-sql", async () => (await import(M)).sqlMods.dig);
vi.mock("./pchest-note", async () => (await import(M)).misc.note);
vi.mock("../open-pass/pass", async () => (await import(M)).passMod);
vi.mock("../loot-bag/bag-dig-pay", async () => (await import(M)).digPay);
vi.mock("../market-backpack", async () => (await import(M)).backpack);
vi.mock("../tool-wear", async () => (await import(M)).toolWear);
vi.mock("../chest/chest-net-read", async () => (await import(M)).netRead);
vi.mock("../potion-bag", async () => (await import(M)).potionBag);
vi.mock("../chest/chest-row", async () => (await import(M)).chestRow);
vi.mock("../mine-guard-read", async () => (await import(M)).guardRead);
vi.mock("../loot-bag/bag-actor", async () => ({
  ...(await import(M)).misc.bagActor,
  requireNotUnderBuilding: (await import("./pchest.fake")).underBuildingMock,
}));
vi.mock("../loot-bag/bag-shovel", async () => (await import(M)).shovel);

const { who, SHOVEL } = await import("./pchest.fake-mocks");
const dig = await import("./pchest-dig");
const putMod = await import("./pchest-put");
const takeMod = await import("./pchest-take");
const call = (fn: unknown, wallet: string, data: object) => {
  who.wallet = wallet;
  return (fn as (a: { data: unknown }) => Promise<{ ok: true; buried?: boolean; qty?: number }>)({
    data,
  });
};
let n = 0;
const op = () => `press-${++n}-x`;
const bury = (wallet = "w1", q = 5, o = op()) => call(dig.buryChest, wallet, { q, r: 6, op: o });
const unbury = (wallet = "w1", q = 5, o = op()) => call(dig.digChest, wallet, { q, r: 6, op: o });

const ID = "pc_1";
const APPLE = "custom:cst_apple";
const chest = () => f.chests.get("5,6");
const shovelOf = (hero: string) => packOf(hero).get(SHOVEL);

beforeEach(() => {
  resetFake();
  for (const [w, acc, hero, q] of [
    ["w1", "acc1", "h1", 5],
    ["w2", "acc2", "h2", 6],
  ] as const) {
    f.accounts.set(w, acc);
    f.heroes.set(w, { heroId: hero, capacity: 4, potionCapacity: 1 });
    f.pos.set(w, { q, r: 6 });
    packOf(hero).set(SHOVEL, { count: 1, wear: 0, marks: NO, kind: "custom", name: "Лопата" });
  }
  const box = { id: ID, q: 5, r: 6, itemId: "cst_box", name: "Сундук", buried: false };
  f.chests.set("5,6", { ...box, placedBy: "acc1" });
  slotsOf(ID).set(APPLE, { count: 7, kind: "custom", refId: "cst_apple", name: "Яблоко" });
});

describe("обычный сундук", () => {
  it("закопать с лопатой: 2 энергии, бугорок, износ снят, все рядом узнали", async () => {
    await expect(bury()).resolves.toEqual({ ok: true, buried: true });
    expect(chest()?.buried).toBe(true);
    expect(shovelOf("h1")?.wear).toBe(50);
    expect(energyOf("w1")).toBe(98);
    expect(f.events).toContain("5,6");
  });

  it("мост повторил переворот вслепую — свой (тот же nonce): 2 энергии не возвращаются", async () => {
    f.replay = 1;
    await expect(bury()).resolves.toEqual({ ok: true, buried: true });
    expect(energyOf("w1")).toBe(98);
  });

  it("нет 2 энергии — отказ «Нужно 2 энергии», лопата цела", async () => {
    f.energy.set("w1", 1);
    await expect(bury()).rejects.toThrow('braid.need_energy|{"n":2}');
    expect(chest()?.buried).toBe(false);
    expect(f.wear.hits).toBe(0);
  });

  it("без лопаты — отказ, сундук стоит, энергия назад", async () => {
    packOf("h1").delete(SHOVEL);
    await expect(bury()).rejects.toThrow("bag.need_shovel");
    expect(chest()?.buried).toBe(false);
    expect(energyOf("w1")).toBe(100);
  });

  it("закопать можно и пустой", async () => {
    slotsOf(ID).clear();
    await expect(bury()).resolves.toMatchObject({ buried: true });
  });

  it("закопанный: не положить, не забрать", async () => {
    await bury();
    packOf("h2").set(APPLE, { count: 3, wear: 0, marks: NO, kind: "custom", name: "Яблоко" });
    await expect(
      call(putMod.putToPlainChest, "w2", { q: 5, r: 6, stackKey: APPLE, qty: 3, op: op() }),
    ).rejects.toThrow("pchest.buried");
    await expect(
      call(takeMod.takeFromPlainChest, "w2", { q: 5, r: 6, stackKey: APPLE, qty: 3, op: op() }),
    ).rejects.toThrow("pchest.buried");
    expect(packOf("h2").get(APPLE)?.count).toBe(3);
  });

  it("бугорок не сгорает: выкопали спустя время — тот же сундук с тем же содержимым", async () => {
    await bury("w1");
    // У бугорка сундука срока нет — ни у него, ни у содержимого (сборщик мешочков его не трогает).
    await expect(unbury("w2")).resolves.toEqual({ ok: true, buried: false });
    expect(chest()).toMatchObject({ id: ID, buried: false });
    expect(slotsOf(ID).get(APPLE)?.count).toBe(7);
    expect(shovelOf("h2")?.wear).toBe(50);
  });

  it("уже закопан / уже выкопан — отказ до лопаты", async () => {
    await expect(unbury()).rejects.toThrow("bag.not_buried");
    await bury();
    await expect(bury("w2")).rejects.toThrow("pchest.buried");
    expect(shovelOf("h2")?.wear).toBe(0);
  });

  it("живой объект на клетке — сначала бой", async () => {
    f.objects.add("5,6");
    await expect(bury()).rejects.toThrow("bag.guarded");
    expect(f.wear.hits).toBe(0);
  });

  it("декор вырос поверх бугорка — сначала рубка; срубили — выкапывается (дополнение №5)", async () => {
    await bury();
    f.decor.add("5,6");
    await expect(unbury("w1", 5, "dig-under-tree")).rejects.toThrow("bag.decor");
    expect(chest()?.buried).toBe(true);
    f.decor.clear();
    await expect(unbury("w1", 5, "dig-after-chop")).resolves.toMatchObject({ buried: false });
  });

  it("под зданием не закапывают — до лопаты и энергии; выкопать старое можно (владелец 03.10)", async () => {
    const before = energyOf("w1");
    f.building.add("5,6");
    await expect(bury("w1", 5, "bury-under-bld")).rejects.toThrow("dig.under_building");
    expect(chest()?.buried).toBe(false);
    expect(energyOf("w1")).toBe(before);
    f.building.clear();
    await bury("w1", 5, "bury-before-bld");
    f.building.add("5,6");
    await expect(unbury("w1", 5, "dig-under-bld")).resolves.toMatchObject({ buried: false });
  });

  it("ответ потерялся, но переворот прошёл — «забор» это видит; повтор — без второго износа", async () => {
    f.lose = "flip";
    await expect(bury("w1", 5, "bury-lost")).resolves.toMatchObject({ buried: true });
    await expect(bury("w1", 5, "bury-lost")).resolves.toMatchObject({ buried: true });
    expect(chest()?.buried).toBe(true);
    expect(f.wear.hits).toBe(1);
    expect(f.wear.backs).toBe(0);
    // Повтор того же нажатия второй раз не платит.
    expect(energyOf("w1")).toBe(98);
  });

  it("ответ потерялся и переворота не было — износ назад, опоздавший не перевернёт", async () => {
    f.fail = ["flip"];
    await expect(bury("w1", 5, "bury-fail")).rejects.toThrow("MCP timeout");
    expect(chest()?.buried).toBe(false);
    expect(shovelOf("h1")?.wear).toBe(0);
    expect(energyOf("w1")).toBe(100);
    expect(f.ops.get("pcbury:acc1:bury-fail")?.state).toBe("failed");
  });
});

describe("магический сундук", () => {
  beforeEach(() => {
    f.chests.clear();
    f.magic.set("5,6", { owner: "acc1", buried: false });
  });

  it("с живой охраной закопать нельзя — ни хозяину, ни чужому; лопата и энергия целы", async () => {
    f.guards.set("5,6", { alive: true, killedBy: null });
    await expect(bury("w1")).rejects.toThrow("chest.guarded");
    await expect(bury("w2")).rejects.toThrow("chest.guarded");
    expect(f.magic.get("5,6")?.buried).toBe(false);
    expect(f.wear.hits).toBe(0);
    expect([energyOf("w1"), energyOf("w2")]).toEqual([100, 100]);
  });

  it("без охраны закапывает любой с лопатой (30.09): чужой — 2 энергии и износ его лопаты", async () => {
    await expect(bury("w2")).resolves.toMatchObject({ buried: true });
    expect(f.magic.get("5,6")).toEqual({ owner: "acc1", buried: true });
    expect(shovelOf("h2")?.wear).toBe(50);
    expect(energyOf("w2")).toBe(98);
    expect(energyOf("w1")).toBe(100);
  });

  it("охрану победили — чужой закапывает", async () => {
    f.guards.set("5,6", { alive: false, killedBy: "acc2" });
    await expect(bury("w2")).resolves.toMatchObject({ buried: true });
  });

  it("чужой без лопаты — отказ, сундук стоит, энергия назад", async () => {
    packOf("h2").delete(SHOVEL);
    await expect(bury("w2")).rejects.toThrow("bag.need_shovel");
    expect(f.magic.get("5,6")?.buried).toBe(false);
    expect(energyOf("w2")).toBe(100);
  });

  it("бугорок магического выкапывает любой — снова стоит без охраны", async () => {
    await bury("w1");
    await expect(unbury("w2")).resolves.toMatchObject({ buried: false });
    expect(f.magic.get("5,6")).toEqual({ owner: "acc1", buried: false });
  });

  it("охрану поставили между проверкой и переворотом — оператор не закопает, износ назад", async () => {
    // Проверка до денег охраны не видит, оператор — видит живую (встала под рукой).
    f.guards.set("5,6", { alive: true, killedBy: null });
    const { guardRead } = await import("./pchest.fake-mocks");
    vi.spyOn(guardRead, "loadGuardRow").mockResolvedValueOnce(null);
    await expect(bury()).rejects.toThrow("chest.guarded");
    expect(f.magic.get("5,6")?.buried).toBe(false);
    expect(f.wear.backs).toBe(f.wear.hits);
    expect(energyOf("w1")).toBe(100);
  });

  it("чужой: хозяин поставил охрану под рукой — не закопает, лопата и энергия назад", async () => {
    f.guards.set("5,6", { alive: true, killedBy: null });
    const { guardRead } = await import("./pchest.fake-mocks");
    vi.spyOn(guardRead, "loadGuardRow").mockResolvedValueOnce(null);
    await expect(bury("w2")).rejects.toThrow("chest.guarded");
    expect(f.magic.get("5,6")?.buried).toBe(false);
    expect(shovelOf("h2")?.wear).toBe(0);
    expect(energyOf("w2")).toBe(100);
  });

  it("двое закапывают разом — переворот один, второй — отказ «уже закопан», его лопата и энергия назад", async () => {
    const got = await Promise.allSettled([bury("w1"), bury("w2")]);
    expect(got.map((x) => x.status).sort()).toEqual(["fulfilled", "rejected"]);
    expect(f.magic.get("5,6")?.buried).toBe(true);
    expect(energyOf("w1") + energyOf("w2")).toBe(198);
    expect(f.wear.hits - f.wear.backs).toBe(1);
  });
});
