// Досчёт «Улова» на финише (аудит 14.10, п.2; ревью 14.10): каждый заброс
// участника — целиком, отыгранное и нет, — с мигами поимок внутри турнира; те же
// миги, что у рыбы выдачи (то же зерно и шанс). Вычитание легшего — в SQL
// (fishing-tail-sql.test). Досчёт и хвост настоящие; база — fishing.fake, очки
// выдачи — запись вызовов noteTournament.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AXE, ROD, fishKit, resetFishing } from "./fishing.fake-mocks";
import { fx, packOf } from "./fishing.fake";

const M = vi.hoisted(() => "@/server/api/beta-raid/fishing/fishing.fake-mocks");
/** Очки «Улова» обычной выдачи: ключ и время каждой поимки. */
const t = vi.hoisted(() => ({ points: [] as Array<{ ref: string; times: readonly number[] }> }));
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
vi.mock("@/server/api/beta-raid/econ/trade-journal", () => ({ noteTrades: async () => {} }));
vi.mock("@/server/api/tournament/tour-note", () => ({
  noteTournament: async (_a: string, _m: string, _q: number, ref: string, times?: number[]) =>
    void t.points.push({ ref, times: times ?? [] }),
}));

const fish = fishKit(await import("./fishing"));
const { dropFishingConfigCache } = await import("./fishing-config");
const { settleFishTail } = await import("./fishing-tail-run");

const MIN = 60_000;
let T0 = 0;
const op = () => fx.fishing.get("acc1")?.op ?? "";

/** Поимки, ушедшие на сверку досчёта: источник очков и миг каждой. */
function tailHits(): Array<{ src: string; at: number }> {
  const sql = fx.sql.find((s) => s.includes("INSERT INTO yuplink.tournament_point")) ?? "";
  const re =
    /\('acc1', '(fish:acc1:[^']+)', 'tail:fish:acc1:[^']+', to_timestamp\((\d+) \/ 1000\.0\)\)/g;
  return [...sql.matchAll(re)].map((m) => ({ src: m[1], at: Number(m[2]) }));
}
const tailTimes = () => tailHits().map((h) => h.at);
/** Финиш турнира «Улова» [T0, T0 + endMin минут). */
const finish = (endMin: number, metric = "fish_catch") =>
  settleFishTail({ id: "t1", metric, startedMs: T0, endsMs: T0 + endMin * MIN });
/** Поимки обычной выдачи до мига end (мин от заброса), по времени. */
const delivered = (endMin = Infinity) =>
  t.points
    .flatMap((p) => p.times)
    .filter((at) => at < T0 + endMin * MIN)
    .sort((a, b) => a - b);

beforeEach(() => {
  resetFishing();
  dropFishingConfigCache();
  t.points = [];
  fx.cfg = { intervalMin: 1, chancePct: 30, items: [{ id: "cst_fish", pct: 100 }] };
  packOf("h1").set(ROD, { count: 50, wear: 0 });
  T0 = fx.now;
});

describe("досчёт «Улова» на финише", () => {
  it("забросил на час и ушёл: клюнувшее до конца — в досчёт, потом та же рыба выдачей", async () => {
    await fish.start("cast-a-x", 60);
    fish.wait(45);
    const n = await finish(30.5);
    expect(n).toBe(tailHits().length);
    expect(n).toBeGreaterThan(3);
    // Источник — ключ выдачи без номера поимки: SQL вычтет легшее за этот заброс.
    expect(tailHits().every((h) => h.src === `fish:acc1:${op()}:`)).toBe(true);
    fish.wait(30);
    await fish.get();
    expect(delivered(30.5)).toEqual(tailTimes());
  });

  it("герой на месте в миг финиша — «видели» сюда: ушёл потом — рыба до финиша всё равно его", async () => {
    await fish.start("cast-b-x", 60);
    fish.wait(40);
    await finish(30.5);
    expect(fx.fishing.get("acc1")?.seenAt).toBe(T0 + 40 * MIN);
    fx.pos.set("acc1", { q: 3, r: 3, map: "map1", ver: 2 });
    fish.wait(30);
    await fish.get();
    expect(delivered(30.5)).toEqual(tailTimes());
  });

  it("заброс целиком: выданное до финиша и не выданное — те же миги, что у выдачи", async () => {
    await fish.start("cast-c-x", 60);
    fish.wait(20);
    await fish.get();
    const early = delivered();
    expect(early.length).toBeGreaterThan(0);
    fish.wait(25);
    await finish(40.5);
    expect(tailTimes().filter((at) => at < T0 + 21 * MIN)).toEqual(early);
    fish.wait(30);
    await fish.get();
    expect(delivered(40.5)).toEqual(tailTimes());
  });

  it("заброс отыгран и закрыт после конца, до финиша — досчёт видит и закрытую строку", async () => {
    await fish.start("cast-h-x", 30);
    fish.wait(45);
    expect(await fish.get()).toMatchObject({ fishing: false, tries: 30 });
    expect(fx.fishing.get("acc1")?.stoppedAt).not.toBeNull();
    await finish(20.5);
    expect(tailTimes().length).toBeGreaterThan(0);
    expect(tailTimes()).toEqual(delivered(20.5));
  });

  it("заброс, начатый до соли, — досчёт по старой формуле, как и выдача", async () => {
    await fish.start("cast-d-x", 60);
    const row = fx.fishing.get("acc1");
    if (row) row.salt = null;
    fish.wait(50);
    await finish(45.5);
    fish.wait(20);
    await fish.get();
    expect(delivered(45.5)).toEqual(tailTimes());
  });

  it("не отыгранных попыток — не больше, чем выдержат удочки; удочки в руках нет — ни одной", async () => {
    fx.cfg = { intervalMin: 1, chancePct: 100, items: [{ id: "cst_fish", pct: 100 }] };
    await fish.start("cast-e-x", 60);
    // Осталась одна удочка на два заброса (износ 25 %, текущая стёрта наполовину).
    packOf("h1").set(ROD, { count: 1, wear: 50 });
    fish.wait(40);
    expect(await finish(30.5)).toBe(2);
    fx.sql = [];
    packOf("h1").set(AXE, { count: 1, wear: 0 });
    fx.main.set("h1", AXE);
    expect(await finish(30.5)).toBe(0);
    expect(tailHits()).toEqual([]);
  });

  it("сошёл с клетки до финиша — не отыгранное только до «видели на месте», как досчёт", async () => {
    await fish.start("cast-f-x", 60);
    fish.wait(10);
    await fish.get();
    fx.pos.set("acc1", { q: 3, r: 3, map: "map1", ver: 2 });
    fish.wait(30);
    await finish(60.5);
    expect(tailTimes()).toEqual(delivered());
    await fish.get();
    expect(delivered(60.5)).toEqual(tailTimes());
  });

  it("поимки до старта турнира в досчёт не идут", async () => {
    await fish.start("cast-i-x", 60);
    fish.wait(40);
    await settleFishTail({
      id: "t1",
      metric: "fish_catch",
      startedMs: T0 + 20 * MIN,
      endsMs: T0 + 30.5 * MIN,
    });
    expect(tailTimes().length).toBeGreaterThan(0);
    expect(tailTimes().every((at) => at >= T0 + 20 * MIN)).toBe(true);
  });

  it("другая категория, конца нет или улов не настроен — досчёта нет", async () => {
    await fish.start("cast-g-x", 60);
    fish.wait(40);
    expect(await finish(30.5, "fish_sell")).toBe(0);
    expect(await settleFishTail({ id: "t1", metric: "fish_catch", endsMs: null })).toBe(0);
    fx.cfg = { intervalMin: 1, chancePct: 30, items: [] };
    dropFishingConfigCache();
    expect(await finish(30.5)).toBe(0);
    expect(fx.sql.some((s) => s.includes("INSERT INTO yuplink.tournament_point"))).toBe(false);
  });
});
