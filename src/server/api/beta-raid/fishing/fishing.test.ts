// Рыбалка (владелец, 04–05.10.2026; ПРАВИЛА §8.35): «Забросить» — только на
// берегу (своя клетка суша, соседняя вода) и с удочкой в руках; через N минут —
// ответ: рыба в рюкзак с меткой «собрано» или ничего; заброс — удар удочкой
// (износ «за удар»); ловить дальше — только новым забросом. Повтор нажатия и
// две вкладки не дают двойного улова. Конец раньше ответа — fishing-stop.test,
// шанс — fishing-chance.test.
// Ручки и досчёт настоящие; база — fishing.fake, выдача — запись вызовов.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { catchItemOf } from "@/lib/raid/fishing";
import { fx, packOf, saltOf } from "./fishing.fake";
import { AXE, ROD, fishGiven, fishKit, resetFishing, s } from "./fishing.fake-mocks";

const M = vi.hoisted(() => "@/server/api/beta-raid/fishing/fishing.fake-mocks");
vi.mock("@tanstack/react-start", async () => (await import(M)).startFn);
vi.mock("@/server/db/mcpClient", async () => (await import(M)).mcp);
/** Рыбалка открыта всем (featureGates): ворота проверяем и на не админе. */
const gate = vi.hoisted(() => ({ admin: true }));
vi.mock("@/server/auth", () => ({
  requireAdmin: () => "admin",
  requireWallet: () => "w1",
  isAdminWallet: () => gate.admin,
}));
vi.mock("@/server/api/beta-raid/gate", async () => (await import(M)).gate);
vi.mock("@/server/api/currency/move", async () => (await import(M)).move);
vi.mock("@/server/api/beta-raid/loot-bag/bag-actor", async () => (await import(M)).actor);
vi.mock("@/server/api/beta-raid/market-backpack", async () => (await import(M)).backpack);
vi.mock("@/server/api/beta-raid/encounter-where", async () => (await import(M)).where);
vi.mock("@/server/api/beta-raid/loot-bag/bag-deliver", async () => (await import(M)).deliver);
vi.mock("@/server/api/beta-raid/reward-queue", async () => (await import(M)).queue);
vi.mock("@/server/api/beta-raid/item-alias", async () => (await import(M)).alias);

const fish = fishKit(await import("./fishing"));
const { fishSeed } = await import("./fishing-seed");
const { dropFishingConfigCache } = await import("./fishing-config");
const rod = () => packOf("h1").get(ROD);
/** Ключ выпадения улова заброса acc1 (номер поимки from). */
const keyOf = (from: number) => `fish:acc1:${fx.fishing.get("acc1")?.op}:${from}`;
const FISH = { itemId: "cst_fish", name: "Рыба", image: null, n: 1 };

beforeEach(() => {
  resetFishing();
  dropFishingConfigCache();
  gate.admin = true;
});

describe("кто может", () => {
  it("рыбалка открыта всем: не админ забрасывает и получает улов", async () => {
    gate.admin = false;
    expect(await fish.start()).toMatchObject({ fishing: true });
    fish.wait(10);
    expect(await fish.get()).toMatchObject({ fishing: false, caught: 1, ended: "done" });
    expect(fishGiven()).toBe(1);
  });
});

describe("«Забросить»", () => {
  it("на берегу с удочкой в руках — заброшено, ответ через интервал", async () => {
    const v = await fish.start();
    expect(v).toMatchObject({ fishing: true, q: 0, r: 0, caught: 0, nextInMs: 10 * 60_000 });
    expect(fx.fishing.get("acc1")).toMatchObject({ heroId: "h1", posAt: 1, caught: 0 });
  });

  it("не берег: вода под ногами, суша без воды рядом, клетки нет — отказ", async () => {
    fx.cells.set("1,0", false);
    await expect(fish.start()).rejects.toThrow("fish.cant_here");
    fx.cells.set("1,0", true);
    fx.cells.set("0,0", true);
    await expect(fish.start()).rejects.toThrow("fish.cant_here");
    fx.pos.set("acc1", { q: 7, r: 7, map: "map1", ver: 2 });
    await expect(fish.start()).rejects.toThrow("fish.cant_here");
    expect(fx.fishing.size).toBe(0);
  });

  it("удочки нет — «Нужна удочка»; в руках топор — «Сначала возьми в руки»", async () => {
    packOf("h1").delete(ROD);
    await expect(fish.start()).rejects.toThrow("fish.need_rod");
    packOf("h1").set(ROD, { count: 1, wear: 0 });
    packOf("h1").set(AXE, { count: 1, wear: 0 });
    fx.main.set("h1", AXE);
    await expect(fish.start()).rejects.toThrow(
      `tool.not_main|${JSON.stringify({ tool: "Удочка" })}`,
    );
  });

  it("удочка одна, руки пусты — берётся в руки сама", async () => {
    fx.main.set("h1", null);
    await fish.start();
    expect(fx.main.get("h1")).toBe(ROD);
  });

  it("улов не настроен — «Рыбалка пока не настроена»", async () => {
    fx.cfg = { intervalMin: 10, chancePct: 100, items: [] };
    await expect(fish.start()).rejects.toThrow("fish.off");
  });

  it("повтор нажатия и второе нажатие, пока ждём, — тот же заброс, таймер не сброшен", async () => {
    await fish.start("press-a-x");
    fish.wait(4);
    expect(await fish.start("press-a-x")).toMatchObject({ fishing: true, nextInMs: 6 * 60_000 });
    expect(await fish.start("press-b-x")).toMatchObject({ fishing: true, nextInMs: 6 * 60_000 });
    expect(fx.fishing.get("acc1")?.op).toBe("press-a-x");
  });
});

describe("ответ заброса", () => {
  it("до срока — ждём; через 10 минут — рыба в рюкзак с меткой «собрано», износ, конец", async () => {
    await fish.start();
    fish.wait(9);
    expect(await fish.get()).toMatchObject({ fishing: true, got: [], nextInMs: 60_000 });
    fish.wait(1);
    const v = await fish.get();
    expect(v).toMatchObject({ fishing: false, caught: 1, nextInMs: null, ended: "done" });
    expect(v.got).toEqual([FISH]);
    expect(s.drops).toEqual([
      { key: keyOf(1), items: [{ itemId: "cst_fish", amount: 1, origin: "loot" }] },
    ]);
    expect(rod()).toEqual({ count: 1, wear: 25 });
  });

  it("ловить дальше — только новым забросом: сам по себе второй раз не клюёт", async () => {
    packOf("h1").set(ROD, { count: 2, wear: 0 });
    await fish.start();
    fish.wait(10);
    await fish.get();
    fish.wait(60);
    expect(await fish.get()).toMatchObject({ fishing: false, got: [] });
    expect(fishGiven()).toBe(1);
    expect(await fish.start()).toMatchObject({ fishing: true, caught: 0, nextInMs: 10 * 60_000 });
    fish.wait(10);
    expect(await fish.get()).toMatchObject({ fishing: false, caught: 1, ended: "done" });
    expect(fishGiven()).toBe(2);
    expect(rod()).toEqual({ count: 2, wear: 50 });
  });

  it("пришёл через час — заброс всё равно один: одна рыба, один износ", async () => {
    await fish.start();
    fish.wait(60);
    expect(await fish.get()).toMatchObject({ fishing: false, caught: 1, ended: "done" });
    expect(fishGiven()).toBe(1);
    expect(s.drops).toHaveLength(1);
    expect(rod()).toEqual({ count: 1, wear: 25 });
  });

  it("улов из нескольких товаров — каждому забросу свой, один и тот же при повторе", async () => {
    const items = [
      { id: "cst_fish", pct: 50 },
      { id: "cst_pike", pct: 50 },
    ];
    fx.cfg = { intervalMin: 10, chancePct: 100, items };
    fx.catalog.set("cst_rod", { name: "Удочка", rod: true, wear: 1 });
    const seen = new Set<string>();
    for (let i = 0; i < 12; i++) {
      const op = `cast-${i}-x`;
      await fish.start(op);
      fish.wait(10);
      const v = await fish.get();
      expect(v.got.map((g) => g.itemId)).toEqual([
        catchItemOf(items, fishSeed("acc1", op, saltOf(op)), 1),
      ]);
      seen.add(v.got[0].itemId);
    }
    expect([...seen].sort()).toEqual(items.map((it) => it.id));
  });

  it("интервал сменили — начатый заброс по старому сроку, следующий по новому", async () => {
    await fish.start();
    fx.cfg = { intervalMin: 3, chancePct: 100, items: [{ id: "cst_fish", pct: 100 }] };
    dropFishingConfigCache();
    fish.wait(3);
    expect((await fish.get()).fishing).toBe(true);
    fish.wait(7);
    expect(await fish.get()).toMatchObject({ fishing: false, caught: 1 });
    expect(await fish.start()).toMatchObject({ fishing: true, nextInMs: 3 * 60_000 });
  });

  it("две вкладки разом и повтор чтения — рыба одна, износ один", async () => {
    packOf("h1").set(ROD, { count: 5, wear: 0 });
    await fish.start();
    fish.wait(20);
    await Promise.all([fish.get(), fish.get(), fish.get()]);
    await fish.get();
    expect(fishGiven()).toBe(1);
    expect(rod()).toEqual({ count: 5, wear: 25 });
    expect(fx.fishing.get("acc1")).toMatchObject({ tries: 1, caught: 1 });
  });

  it("ответ поимки потерян — свой захват узнаётся, рыба выдана один раз", async () => {
    await fish.start();
    fish.wait(10);
    fx.loseOn = "SET tries = f.tries + d.done";
    expect(await fish.get()).toMatchObject({ caught: 1, ended: "done" });
    await fish.get();
    expect(fishGiven()).toBe(1);
    expect(s.drops[0].key).toBe(keyOf(1));
  });

  it("поимка не прошла (сбой связи) — заброс ждёт, следующий заход доигрывает его", async () => {
    await fish.start();
    fish.wait(10);
    fx.failOn = { tag: "SET tries = f.tries + d.done", skip: 0 };
    expect(await fish.get()).toMatchObject({ fishing: true, caught: 0, more: true });
    expect(fishGiven()).toBe(0);
    expect(await fish.get()).toMatchObject({ fishing: false, caught: 1, ended: "done" });
    expect(fishGiven()).toBe(1);
    expect(rod()).toEqual({ count: 1, wear: 25 });
  });

  it("конец заброса не записался — следующий заход закрывает его молча, без второго ответа", async () => {
    await fish.start();
    fish.wait(10);
    fx.failOn = { tag: "stop_reason = 'done'", skip: 0 };
    expect(await fish.get()).toMatchObject({ fishing: false, caught: 1, ended: "done" });
    expect(fx.fishing.get("acc1")?.stoppedAt).toBeNull();
    expect(await fish.get()).toMatchObject({ fishing: false, got: [], ended: null });
    expect(fx.fishing.get("acc1")?.stoppedAt).not.toBeNull();
    expect(fishGiven()).toBe(1);
  });

  it("выдача не состоялась вовсе — улов ждёт в «Добыче», не пропадает", async () => {
    await fish.start();
    fish.wait(10);
    s.dropFails = true;
    await fish.get();
    expect(s.queued).toEqual([{ key: `${keyOf(1)}:q0`, amount: 1 }]);
  });
});
