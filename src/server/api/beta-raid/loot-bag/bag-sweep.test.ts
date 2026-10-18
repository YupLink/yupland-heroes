// Сборщик мешочков (§8.21): порция сгорает через 24 часа после попадания в
// мешочек, мешочек без живых порций исчезает (сразу для всех — по сроку, а
// строка уходит после 10 минут тишины), игроки рядом узнают событием без F5.
// Зависшее снятие (сбой базы между снятием и выдачей) сборщик развязывает:
// выдачи не было — назад в те же порции, была — ключ закрыт; пока оно не
// развязано, порции мешочка не трогаются.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TTL, alive, countOf, db, md5, packOf, resetDb, seedBag } from "./bag.fake";
import { runCmd } from "./bag.fake-cmd";

vi.mock("@/server/db/mcpClient", async () => (await import("./bag.fake-mocks")).mcp);
vi.mock("@/server/raidLive", async () => (await import("./bag.fake-mocks")).live);
vi.mock("./bag-read-sql", async () => (await import("./bag.fake-mocks")).readSql);
vi.mock("./bag-back-sql", async () => (await import("./bag.fake-mocks")).backSqlMod);

const { sweepLootBags } = await import("./bag-sweep");
const BANANA = "custom:cst_banana";
const MIN = 60_000;
const drop = (key: string, q: number) =>
  runCmd({
    cmd: "drop",
    at: { key, mapId: "map1", q, r: 7, account: "acc9" },
    stacks: [
      {
        stackKey: BANANA,
        kind: "custom",
        refId: "cst_banana",
        name: "Банан",
        image: null,
        count: 10,
        marks: { mob: 10, mine: 0, field: 0, loot: 0 },
      },
    ],
  });
const bag = (key: string) => db.bags.get(`lb_${md5(key)}`);

beforeEach(() => resetDb());

describe("срок порций", () => {
  it("до срока — на месте; после — сгорел: не виден сразу, строка уходит, клетке событие", async () => {
    drop("a", 1);
    db.now += 23 * 3600_000;
    drop("b", 2);
    expect(await sweepLootBags()).toBe(0);
    db.now += 3600_000 + 1;
    expect(alive(bag("a"))).toBe(false);
    expect(await sweepLootBags()).toBe(1);
    expect(bag("a")).toBeUndefined();
    expect(bag("b")).toBeTruthy();
    expect(db.events).toEqual(["1,7"]);
  });

  it("у каждой порции свой срок: положенное позже живёт дольше", async () => {
    seedBag("lb_p", {
      items: [
        { stackKey: BANANA, count: 3, expiresAt: db.now + MIN },
        { stackKey: BANANA, count: 4, expiresAt: db.now + TTL },
      ],
    });
    db.now += MIN + 1;
    await sweepLootBags();
    expect(db.bags.get("lb_p")?.items.map((p) => p.count)).toEqual([4]);
    expect(countOf(db.bags.get("lb_p"), BANANA)).toBe(4);
  });

  it("опустевший мешочек (всё забрали) уходит после 10 минут тишины", async () => {
    drop("a", 1);
    runCmd({ cmd: "take", bagId: `lb_${md5("a")}`, stackKey: BANANA, qty: 10, cap: 10, op: "t1", heroId: "h1" });
    runCmd({ cmd: "done", op: "t1" });
    await sweepLootBags();
    expect(bag("a")).toBeTruthy();
    db.now += 10 * MIN + 1;
    await sweepLootBags();
    expect(bag("a")).toBeUndefined();
  });

  it("надгробие «забора» живёт 10 минут: опоздавшее падение в него упирается", async () => {
    runCmd({ cmd: "dropFence", at: { key: "late", mapId: "map1", q: 3, r: 7, account: "acc9" } });
    await sweepLootBags();
    expect(bag("late")).toBeTruthy();
    db.now += 10 * MIN + 1;
    await sweepLootBags();
    expect(bag("late")).toBeUndefined();
  });
});

describe("зависшее снятие", () => {
  const stale = (op: string) => {
    runCmd({ cmd: "take", bagId: `lb_${md5("a")}`, stackKey: BANANA, qty: 4, op, heroId: "h1" });
    db.now += 3 * MIN;
  };

  it("выдачи не было — штуки назад в ту же порцию с метками, ключ undone, событие клетке", async () => {
    drop("a", 1);
    stale("bagtake:acc1:p1:x");
    expect(countOf(bag("a"), BANANA)).toBe(6);
    await sweepLootBags();
    expect(bag("a")?.items).toEqual([expect.objectContaining({ count: 10, marks: expect.objectContaining({ mob: 10 }) })]);
    expect(db.ops.get("bagtake:acc1:p1:x")?.state).toBe("undone");
    expect(db.events).toEqual(["1,7"]);
    // Опоздавшая выдача после развязки ничего не кладёт.
    expect(db.bpOps.has("bp:bagtake:acc1:p1:x")).toBe(true);
  });

  it("выдача прошла (ключ в рюкзаке есть) — ключ закрыт, назад не возвращаем", async () => {
    drop("a", 1);
    stale("bagtake:acc1:p2:x");
    db.bpOps.add("bp:bagtake:acc1:p2:x");
    packOf("h1").set(BANANA, { count: 4, marks: { mob: 4, mine: 0, field: 0, loot: 0 }, wear: 0 });
    await sweepLootBags();
    expect(db.ops.get("bagtake:acc1:p2:x")?.state).toBe("done");
    expect(countOf(bag("a"), BANANA)).toBe(6);
  });

  it("свежее снятие (моложе 2 минут) не трогаем — оно ещё в пути, и порции мешочка тоже", async () => {
    drop("a", 1);
    runCmd({ cmd: "take", bagId: `lb_${md5("a")}`, stackKey: BANANA, qty: 10, cap: 10, op: "p3", heroId: "h1" });
    db.now += 10 * MIN + 1;
    db.ops.get("p3")!.at = db.now;
    await sweepLootBags();
    expect(db.ops.get("p3")?.state).toBe("taken");
    // Пустая порция ждёт возможного отката — строка на месте.
    expect(bag("a")?.items).toHaveLength(1);
  });
});
