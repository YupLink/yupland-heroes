// Конец заброса раньше ответа (ПРАВИЛА §8.35): «Хватит» (созревший ответ
// досчитан), сошёл с клетки (лишнего не выдаём — только до «видели на месте»),
// другое действие — трата энергии (ответ — только если срок наступил до неё),
// сменился выбранный герой, удочку убрали из рук или взяли другое (сначала
// досчёт), удочка кончилась (продали, выбросили; доломал последний заброс —
// следующий ловит другая). Снятый до срока заброс удочку не стирает.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fx, packOf } from "./fishing.fake";
import { AXE, ROD, fishGiven, fishKit, resetFishing } from "./fishing.fake-mocks";

const M = vi.hoisted(() => "@/server/api/beta-raid/fishing/fishing.fake-mocks");
vi.mock("@tanstack/react-start", async () => (await import(M)).startFn);
vi.mock("@/server/db/mcpClient", async () => (await import(M)).mcp);
vi.mock("@/server/auth", () => ({
  requireAdmin: () => "admin",
  requireWallet: () => "w1",
  isAdminWallet: () => true,
}));
vi.mock("@/server/rateGate", () => ({ actionGate: async () => {} }));
vi.mock("@/server/api/beta-raid/gate", async () => (await import(M)).gate);
vi.mock("@/server/api/currency/move", async () => (await import(M)).move);
vi.mock("@/server/api/beta-raid/loot-bag/bag-actor", async () => (await import(M)).actor);
vi.mock("@/server/api/beta-raid/market-backpack", async () => (await import(M)).backpack);
vi.mock("@/server/api/beta-raid/encounter-where", async () => (await import(M)).where);
vi.mock("@/server/api/beta-raid/loot-bag/bag-deliver", async () => (await import(M)).deliver);
vi.mock("@/server/api/beta-raid/reward-queue", async () => (await import(M)).queue);
vi.mock("@/server/api/beta-raid/item-alias", async () => (await import(M)).alias);
vi.mock("@/server/api/beta-raid/decor-interact", () => ({
  loadInteractiveDecor: async () => ({
    tree: { toolKey: "custom:cst_axe", tools: [{ key: "custom:cst_axe" }] },
  }),
}));

const fish = fishKit(await import("./fishing"));
const { dropFishingConfigCache } = await import("./fishing-config");
const { setMainTool } = await import("../main-tool/main-tool-set");
const take = (stackKey: string | null) =>
  (setMainTool as unknown as (a: { data: unknown }) => Promise<unknown>)({ data: { stackKey } });
const ended = () => fx.fishing.get("acc1")?.reason ?? null;
const T0 = 1_000_000;
const rod = () => packOf("h1").get(ROD);
const FRESH = { count: 10, wear: 0 };

beforeEach(async () => {
  resetFishing();
  dropFishingConfigCache();
  packOf("h1").set(ROD, { ...FRESH });
  await fish.start();
});

describe("«Хватит»", () => {
  it("до срока — заброс снят, рыбы нет, удочка цела; повтор — уже не рыбачит", async () => {
    fish.wait(5);
    expect(await fish.stop()).toMatchObject({ fishing: false, caught: 0, ended: "stop" });
    expect(await fish.stop()).toMatchObject({ fishing: false, got: [] });
    fish.wait(60);
    expect((await fish.get()).fishing).toBe(false);
    expect(fishGiven()).toBe(0);
    expect(rod()).toEqual(FRESH);
  });

  it("срок уже наступил — ответ досчитан, потом конец", async () => {
    fish.wait(25);
    expect(await fish.stop()).toMatchObject({ fishing: false, caught: 1, ended: "stop" });
    expect(fishGiven()).toBe(1);
  });
});

describe("сошёл с клетки", () => {
  it("ответ — только если срок наступил, пока видели на месте; дальше заброса нет", async () => {
    fish.wait(5);
    await fish.get();
    fish.wait(30);
    fx.pos.set("acc1", { q: -1, r: 0, map: "map1", ver: 2 });
    expect(await fish.get()).toMatchObject({ fishing: false, caught: 0, ended: "moved" });
    expect(fishGiven()).toBe(0);
    expect(fx.fishing.get("acc1")?.stoppedAt).toBe(T0 + 5 * 60_000);
    expect(rod()).toEqual(FRESH);
  });

  it("ушёл и вернулся на ту же клетку — версия позиции другая, заброс снят", async () => {
    fish.wait(15);
    fx.pos.set("acc1", { q: 0, r: 0, map: "map1", ver: 5 });
    expect(await fish.get()).toMatchObject({ fishing: false, ended: "moved" });
    expect(fishGiven()).toBe(0);
  });
});

describe("другое действие (трата энергии)", () => {
  it("срок наступил до действия — ответ есть, потом конец", async () => {
    fish.wait(25);
    act("acc1");
    fish.wait(40);
    expect(await fish.get()).toMatchObject({ fishing: false, caught: 1, ended: "action" });
    expect(fishGiven()).toBe(1);
  });

  it("действие раньше срока — заброс снят без рыбы и без износа", async () => {
    fish.wait(5);
    act("acc1");
    fish.wait(40);
    expect(await fish.get()).toMatchObject({ fishing: false, caught: 0, ended: "action" });
    expect(fishGiven()).toBe(0);
    expect(fx.fishing.get("acc1")?.stoppedAt).toBe(T0 + 5 * 60_000);
    expect(rod()).toEqual(FRESH);
  });

  it("после действия «Забросить» снова — улов прошлого заброса в ответе, таймер новый", async () => {
    fish.wait(15);
    act("acc1");
    const v = await fish.start();
    expect(v).toMatchObject({ fishing: true, caught: 0, nextInMs: 10 * 60_000 });
    expect(v.got).toEqual([{ itemId: "cst_fish", name: "Рыба", image: null, n: 1 }]);
    expect(fishGiven()).toBe(1);
  });

  it("действие уже после ухода с клетки — до «видели на месте», не до действия", async () => {
    fish.wait(25);
    fx.pos.set("acc1", { q: -1, r: 0, map: "map1", ver: 2 });
    act("acc1");
    expect(await fish.get()).toMatchObject({ fishing: false, caught: 0, ended: "action" });
  });
});

describe("герой и инструмент", () => {
  it("сменился выбранный герой — конец, лишнего не выдано", async () => {
    fish.wait(15);
    fx.selected.delete("h1");
    fx.selected.add("h2");
    expect(await fish.get()).toMatchObject({ fishing: false, ended: "hero" });
    expect(fishGiven()).toBe(0);
  });

  it("взял топор — сначала ответ удочкой в руках, потом конец; топор в руках", async () => {
    packOf("h1").set(AXE, { count: 1, wear: 0 });
    fish.wait(21);
    await take(AXE);
    expect(ended()).toBe("tool");
    expect(fishGiven()).toBe(1);
    expect(fx.main.get("h1")).toBe(AXE);
  });

  it("взял другую удочку — заброс идёт, отвечает она", async () => {
    packOf("h1").set("custom:cst_rod2", { count: 1, wear: 0 });
    await take("custom:cst_rod2");
    expect(ended()).toBeNull();
    fish.wait(10);
    expect(await fish.get()).toMatchObject({ caught: 1, ended: "done" });
    expect(packOf("h1").get("custom:cst_rod2")).toEqual({ count: 1, wear: 50 });
    expect(rod()).toEqual(FRESH);
  });

  it("убрал удочку из рук — заброс снят, рыбы нет", async () => {
    fish.wait(5);
    await take(null);
    expect(ended()).toBe("tool");
    fish.wait(10);
    expect((await fish.get()).fishing).toBe(false);
    expect(fishGiven()).toBe(0);
  });
});

describe("удочка кончилась", () => {
  it("удочку продали или выбросили — следующий же досчёт снимает заброс, лишнего нет", async () => {
    fish.wait(5);
    packOf("h1").delete(ROD);
    expect(await fish.get()).toMatchObject({ fishing: false, caught: 0, ended: "rod" });
    expect(fx.fishing.get("acc1")?.stoppedAt).toBe(T0 + 5 * 60_000);
    packOf("h1").set(ROD, { count: 1, wear: 0 });
    fish.wait(60);
    expect((await fish.get()).fishing).toBe(false);
    expect(fishGiven()).toBe(0);
  });

  it("последний заброс доломал удочку — рыба есть, удочки больше нет", async () => {
    packOf("h1").set(ROD, { count: 1, wear: 75 });
    fish.wait(10);
    expect(await fish.get()).toMatchObject({ fishing: false, caught: 1, ended: "done" });
    expect(rod()).toEqual({ count: 0, wear: 0 });
    expect(fishGiven()).toBe(1);
  });

  it("удочка в руках кончилась, есть другая — следующий заброс ей, она становится основной", async () => {
    packOf("h1").set(ROD, { count: 1, wear: 75 });
    packOf("h1").set("custom:cst_rod2", { count: 1, wear: 0 });
    fish.wait(10);
    await fish.get();
    expect(await fish.start()).toMatchObject({ fishing: true });
    fish.wait(10);
    expect(await fish.get()).toMatchObject({ caught: 1, ended: "done" });
    expect(packOf("h1").get("custom:cst_rod2")).toEqual({ count: 1, wear: 50 });
    expect(fx.main.get("h1")).toBe("custom:cst_rod2");
    expect(fishGiven()).toBe(2);
  });
});
