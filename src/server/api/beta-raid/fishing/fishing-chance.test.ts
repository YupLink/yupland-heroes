// Шанс заброса (владелец, 05.10.2026: «забросил — прождал минуту — шанс
// сработал или не сработал — минус прочность»): через минуту рыба — только если
// выпал шанс (10 %), иначе «ничего»; удочка стирается каждым забросом, с рыбой
// и без; повтор чтения и вторая вкладка не меняют исход.
// Ручки и досчёт настоящие; база — fishing.fake, выдача — запись вызовов.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { hitStackTimes } from "@/lib/raid/toolWear";
import { fishHit } from "@/lib/raid/fishing";
import { fx, packOf, saltOf } from "./fishing.fake";
import { ROD, fishGiven, fishKit, resetFishing } from "./fishing.fake-mocks";

const M = vi.hoisted(() => "@/server/api/beta-raid/fishing/fishing.fake-mocks");
vi.mock("@tanstack/react-start", async () => (await import(M)).startFn);
vi.mock("@/server/db/mcpClient", async () => (await import(M)).mcp);
vi.mock("@/server/auth", () => ({
  requireAdmin: () => "admin",
  requireWallet: () => "w1",
  isAdminWallet: () => true,
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
/** Выпал ли шанс у нажатия op: бросок — от зерна сервера и номера, без случая. */
const hitOf = (op: string) => fishHit(fishSeed("acc1", op, saltOf(op)), 1, 10);
/** То же по старой формуле — заброс, начатый до соли (seed_salt NULL). */
const oldHitOf = (op: string) => fishHit(fishSeed("acc1", op, null), 1, 10);
/** Нажатие, у которого шанс выпал (hit) или нет. */
const opWhere = (hit: boolean): string => {
  for (let i = 0; ; i++) if (hitOf(`cast-${i}-x`) === hit) return `cast-${i}-x`;
};
const ROD50 = { count: 50, wear: 0 };
/** Удочка после n забросов из ROD50. */
const usedBy = (n: number) => {
  const t = hitStackTimes(ROD50, 25, n);
  return { count: t.count, wear: t.wear };
};

beforeEach(() => {
  resetFishing();
  dropFishingConfigCache();
  fx.cfg = { intervalMin: 1, chancePct: 10, items: [{ id: "cst_fish", pct: 100 }] };
  packOf("h1").set(ROD, { ...ROD50 });
});

describe("заброс: минута, шанс 10 %", () => {
  it("шанс выпал — через минуту рыба; удочка минус одно использование", async () => {
    await fish.start(opWhere(true));
    expect(await fish.get()).toMatchObject({ fishing: true, nextInMs: 60_000 });
    fish.wait(1);
    const v = await fish.get();
    expect(v).toMatchObject({ fishing: false, caught: 1, ended: "done" });
    expect(v.got).toHaveLength(1);
    expect(packOf("h1").get(ROD)).toEqual(usedBy(1));
  });

  it("не выпал — «ничего», а удочка всё равно минус одно использование", async () => {
    await fish.start(opWhere(false));
    fish.wait(1);
    const v = await fish.get();
    expect(v).toMatchObject({ fishing: false, caught: 0, got: [], ended: "done" });
    expect(fishGiven()).toBe(0);
    expect(packOf("h1").get(ROD)).toEqual(usedBy(1));
  });

  it("сто забросов — рыба ровно там, где выпал шанс, около десятка; удочка — сто использований", async () => {
    let want = 0;
    for (let i = 0; i < 100; i++) {
      const op = `cast-${i}-x`;
      const hit = hitOf(op);
      if (hit) want++;
      await fish.start(op);
      fish.wait(1);
      expect((await fish.get()).caught).toBe(hit ? 1 : 0);
    }
    expect(want).toBeGreaterThan(2);
    expect(want).toBeLessThan(25);
    expect(fishGiven()).toBe(want);
    expect(packOf("h1").get(ROD)).toEqual(usedBy(100));
  });

  it("ключ нажатия исход не выбирает: «уловистый» по самому ключу — не обязательно с рыбой", async () => {
    // Скрипт перебрал бы ключи, у которых бросок от самого ключа даёт рыбу.
    let op = "";
    for (let i = 0; !op; i++) {
      const k = `grind-${i}-x`;
      if (fishHit(k, 1, 10) && !hitOf(k)) op = k;
    }
    await fish.start(op);
    fish.wait(1);
    expect(await fish.get()).toMatchObject({ caught: 0, ended: "done" });
  });

  it("зерно — HMAC на секрете сервера: то же нажатие — то же, другой секрет — другое", () => {
    const a = fishSeed("acc1", "press-1-x", "s1");
    expect(fishSeed("acc1", "press-1-x", "s1")).toBe(a);
    expect(a).not.toContain("press-1-x");
    vi.stubEnv("SESSION_SECRET", "another-secret-of-enough-length");
    expect(fishSeed("acc1", "press-1-x", "s1")).not.toBe(a);
    vi.unstubAllEnvs();
  });

  it("заброс, начатый до соли (строка без seed_salt), ловит по старой формуле", async () => {
    // Нажатие, у которого старая и новая формулы расходятся: исход — старый.
    let op = "";
    for (let i = 0; !op; i++) if (oldHitOf(`old-${i}-x`) && !hitOf(`old-${i}-x`)) op = `old-${i}-x`;
    await fish.start(op);
    const row = fx.fishing.get("acc1");
    if (row) row.salt = null;
    fish.wait(1);
    expect(await fish.get()).toMatchObject({ caught: 1, ended: "done" });
  });

  it("ключ, которым аккаунт уже ловил, второй раз не забрасывается: удочка цела", async () => {
    const op = opWhere(true);
    await fish.start(op);
    fish.wait(1);
    expect((await fish.get()).caught).toBe(1);
    expect(fx.journal.some((ref) => ref.startsWith(`fish:acc1:${op}:`))).toBe(true);
    // Между ними — другой заброс: текущая строка уже не этого ключа.
    await fish.start(opWhere(false));
    fish.wait(1);
    await fish.get();
    const rod = { ...packOf("h1").get(ROD) };
    expect(await fish.start(op)).toMatchObject({ fishing: false });
    expect(fx.fishing.get("acc1")?.op).not.toBe(op);
    expect(packOf("h1").get(ROD)).toEqual(rod);
    expect(fishGiven()).toBe(1);
  });

  it("повтор чтения и вторая вкладка не меняют исход и не дают двойного улова", async () => {
    await fish.start(opWhere(true));
    fish.wait(1);
    await Promise.all([fish.get(), fish.get()]);
    expect((await fish.get()).got).toEqual([]);
    expect(fishGiven()).toBe(1);
    expect(packOf("h1").get(ROD)).toEqual(usedBy(1));
  });
});
