// Видимость мешочков (владелец, 29.09; §8.21): «второй обзор» — круг активной
// зоны тумана (20 клеток) от моего героя, только на разведанных мной клетках и
// не под глухим куполом; дальше, в тёмном тумане, — не видно. Фильтрует
// сервер по позиции героя в базе. Сгоревший и пустой не видны. Окно клетки —
// только вплотную; у позиции — ближайший срок её порций.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TTL, db, resetDb, seedBag } from "./bag.fake";
import { runCmd } from "./bag.fake-cmd";

vi.mock("@/server/db/mcpClient", async () => (await import("./bag.fake-mocks")).mcp);
vi.mock("./bag-sql", async () => (await import("./bag.fake-mocks")).bagSql);
vi.mock("./bag-read-sql", async () => (await import("./bag.fake-mocks")).readSql);
vi.mock("../market-backpack", async () => (await import("./bag.fake-mocks")).backpack);
vi.mock("../gate", async () => (await import("./bag.fake-mocks")).session.gate);
vi.mock("@/server/rateGate", async () => (await import("./bag.fake-mocks")).session.rate);
vi.mock("../encounter-where", async () => (await import("./bag.fake-mocks")).session.where);
vi.mock("../owner", async () => (await import("./bag.fake-mocks")).session.owner);
vi.mock("../../currency/move", async () => (await import("./bag.fake-mocks")).session.move);
vi.mock("../voidGate", async () => (await import("./bag.fake-mocks")).session.voidGate);
vi.mock("@tanstack/react-start", async () => (await import("./bag.fake-mocks")).startFn);

const { who } = await import("./bag.fake-mocks");
const read = await import("./bag-read");
type Spot = { id: string; q: number; r: number; buried: boolean; leftMs: number };
const near = async (wallet = "w1") => {
  who.wallet = wallet;
  const res = (await (read.getLootBagsNear as unknown as () => Promise<{ bags: Spot[] }>)()).bags;
  return res.map((b) => `${b.q},${b.r}`).sort();
};
const drop = (key: string, q: number, r: number) =>
  runCmd({
    cmd: "drop",
    at: { key, mapId: "map1", q, r, account: "acc9" },
    stacks: [
      {
        stackKey: "custom:cst_banana",
        kind: "custom",
        refId: "cst_banana",
        name: "Банан",
        image: null,
        count: 2,
        marks: { mob: 0, mine: 0, field: 0, loot: 2 },
      },
    ],
  });
/** Разведать клетки (beta_raid_fog_seen) за аккаунт кошелька. */
const explore = (wallet: string, ...cells: string[]) =>
  cells.forEach((c) => db.seen.add(`acc_${wallet}|${c}`));

beforeEach(() => {
  resetDb();
  for (const w of ["w1", "admin"]) {
    db.accounts.set(w, `acc_${w}`);
    db.pos.set(w, { q: 10, r: 10 });
  }
  drop("a", 11, 10); // 1 клетка
  drop("b", 30, 0); // 20 клеток — ещё видно
  drop("c", 10, 30); // 20 клеток
  drop("d", 31, 0); // 21 — уже тёмный туман
  drop("e", 12, 12); // 4 клетки, не разведана
  explore("w1", "11,10", "30,0", "10,30", "31,0");
});

describe("мешочки во «втором обзоре»", () => {
  it("круг 20 клеток от моего героя на разведанном; дальше и неразведанное — не отдаётся", async () => {
    expect(await near()).toEqual(["10,30", "11,10", "30,0"]);
  });

  it("сдвинулся герой — сервер отдаёт уже его новый круг", async () => {
    db.pos.set("w1", { q: 40, r: 0 });
    expect(await near()).toEqual(["30,0", "31,0"]);
  });

  it("разведал клетку — мешочек на ней появился", async () => {
    explore("w1", "12,12");
    expect(await near()).toContain("12,12");
  });

  it("разведанное чужим аккаунтом не в счёт", async () => {
    explore("admin", "12,12");
    expect(await near()).not.toContain("12,12");
  });

  it("под глухим туманом игроку не видно; админу — всё в круге", async () => {
    db.voids.add("11,10");
    expect(await near()).toEqual(["10,30", "30,0"]);
    expect(await near("admin")).toEqual(["10,30", "11,10", "12,12", "30,0"]);
  });

  it("сгоревший и пустой — не видны", async () => {
    db.now += TTL + 1;
    drop("f", 11, 9);
    explore("w1", "11,9");
    expect(await near()).toEqual(["11,9"]);
    for (const b of db.bags.values())
      if (b.q === 11 && b.r === 9) b.items.forEach((i) => (i.count = 0));
    expect(await near()).toEqual([]);
  });

  it("срок мешочка — по последней живой порции", async () => {
    seedBag("lb_x", {
      q: 11,
      r: 10,
      items: [
        { stackKey: "custom:cst_a", count: 1, expiresAt: db.now + 3600_000 },
        { stackKey: "custom:cst_b", count: 1, expiresAt: db.now + 7200_000 },
      ],
    });
    who.wallet = "w1";
    const res = (await (read.getLootBagsNear as unknown as () => Promise<{ bags: Spot[] }>)()).bags;
    expect(res.find((b) => b.id === "lb_x")?.leftMs).toBe(7200_000);
  });

  it("героя на карте нет — пусто", async () => {
    db.pos.delete("w1");
    expect(await near()).toEqual([]);
  });
});

describe("окно клетки", () => {
  type View = {
    shovel: boolean;
    bags: Array<{ items: Array<{ stackKey: string; count: number; leftMs: number }> }>;
  };
  const at = (q: number, r: number) => {
    who.wallet = "w1";
    return (read.getLootBagsAt as unknown as (a: { data: object }) => Promise<View>)({
      data: { q, r },
    });
  };

  it("только вплотную: соседняя клетка — да, через одну — «подойди»", async () => {
    await expect(at(11, 10)).resolves.toMatchObject({ bags: [expect.anything()] });
    await expect(at(12, 12)).rejects.toThrow("bag.approach");
  });

  it("лопаты нет — shovel=false (кнопки «Закопать/Выкопать» гаснут)", async () => {
    expect((await at(11, 10)).shovel).toBe(false);
  });

  it("позиция — сумма живых порций вида и срок ближайшей из них", async () => {
    seedBag("lb_a", {
      q: 11,
      r: 10,
      items: [
        { stackKey: "custom:cst_a", count: 3, expiresAt: db.now + 7200_000 },
        { stackKey: "custom:cst_a", count: 2, expiresAt: db.now + 3600_000 },
        { stackKey: "custom:cst_a", count: 9, expiresAt: db.now - 1 },
      ],
    });
    const view = await at(11, 10);
    const items = view.bags.flatMap((b) => b.items).filter((i) => i.stackKey === "custom:cst_a");
    expect(items).toEqual([expect.objectContaining({ count: 5, leftMs: 3600_000 })]);
  });
});
