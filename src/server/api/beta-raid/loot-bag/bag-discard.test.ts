// «Выбросить» — в мешочек на клетке героя (владелец, 29.09.2026, дополнение
// №4): выброшенное не пропадает. Новый мешочек или долив в живой незакопанный
// этой клетки; метки едут с порцией; изношенная штука в мешочек не попадает;
// не на карте — отказ; пыль — точно; повтор нажатия — без второго эффекта.
// Ручка настоящая, SQL настоящий: фейк (src/test/bagDiscardFake.ts) считает его
// выражения мини-вычислителем на numeric.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { dec } from "@/test/numeric";
import { db, inBags, resetDiscard, stack } from "@/test/bagDiscardFake";

const M = vi.hoisted(() => "@/test/bagDiscardFake");
const seen = vi.hoisted(() => ({ published: [] as string[], notes: 0, sweeper: 0 }));
vi.mock("@/server/db/mcpClient", async () => (await import(M)).mcp);
vi.mock("@/server/raidLive", () => ({
  publishRaid: (e: { type: string; cells: string[] }) => void seen.published.push(`${e.type}:${e.cells}`),
}));
vi.mock("@/server/api/beta-raid/encounter-where", async () => {
  const { db: d } = await import("@/test/bagDiscardFake");
  return { ownCell: async () => d.pos, myMapId: async () => "rmap_x" };
});
vi.mock("@/server/api/beta-raid/owner", () => ({ raidOwner: async () => "acc_1" }));
vi.mock("@/server/api/beta-raid/loot-bag/bag-note", () => ({ noteBagPut: async () => void seen.notes++ }));
vi.mock("@/server/api/beta-raid/loot-bag/bag-sweep", () => ({
  startLootBagSweeper: () => void seen.sweeper++,
}));
vi.mock("@/server/api/beta-raid/chest/chest-row", () => ({
  sqlRow: <T>(rows: Array<{ _row: T }> | undefined) => rows?.[0]?._row,
}));

const { discardToBag } = await import("@/server/api/beta-raid/loot-bag/bag-discard");
const { discardToBagSql } = await import("@/server/api/beta-raid/loot-bag/bag-discard-sql");
const SODA = "custom:soda";
const AXE = "custom:axe";
const drop = (stackKey: string, qty?: number, op = "op_aaaaaa") =>
  discardToBag({ wallet: "w1", heroId: "h1", stackKey, qty, clientOp: op });

beforeEach(() => {
  resetDiscard();
  Object.assign(seen, { published: [], notes: 0, sweeper: 0 });
});

describe("куда падает", () => {
  it("мешочка на клетке нет — новый, порция на клетке героя; слой узнаёт сразу", async () => {
    db.rows.set(SODA, stack("5"));
    await expect(drop(SODA, 3)).resolves.toMatchObject({ left: 2, put: 3 });
    expect(db.bags).toHaveLength(1);
    expect(inBags(SODA)).toBe(dec("3"));
    expect(seen.published).toEqual(["bags:3,4"]);
    await vi.waitFor(() => expect(seen.sweeper).toBe(1));
  });

  it("живой незакопанный мешочек на клетке — доливаем в него новой порцией", async () => {
    db.bags.push({ id: "lb_old", cell: "3,4", buried: false, items: [{ k: "custom:x", n: dec("1"), mob: 0n, mine: 0n, field: 0n, loot: 0n }] });
    db.rows.set(SODA, stack("5"));
    await expect(drop(SODA)).resolves.toMatchObject({ left: 0, put: 5, bagId: "lb_old" });
    expect(db.bags).toHaveLength(1);
    expect(db.bags[0].items.map((i) => i.k)).toEqual(["custom:x", SODA]);
    expect(seen.sweeper).toBe(0);
  });

  it("бугорок на клетке — не долив: новый мешочек рядом с ним", async () => {
    db.bags.push({ id: "lb_mound", cell: "3,4", buried: true, items: [{ k: "custom:x", n: dec("1"), mob: 0n, mine: 0n, field: 0n, loot: 0n }] });
    db.rows.set(SODA, stack("2"));
    await drop(SODA);
    expect(db.bags).toHaveLength(2);
    expect(db.bags[0].items).toHaveLength(1);
  });

  it("мешочек закопали между чтением и оператором — тем же оператором новый", async () => {
    db.bags.push({ id: "lb_old", cell: "3,4", buried: false, items: [{ k: "custom:x", n: dec("1"), mob: 0n, mine: 0n, field: 0n, loot: 0n }] });
    db.rows.set(SODA, stack("2"));
    db.beforeWrite = () => {
      db.bags[0].buried = true;
    };
    const res = await drop(SODA);
    expect(res.bagId).not.toBe("lb_old");
    expect(inBags(SODA)).toBe(dec("2"));
  });

  it("пока читали клетку, сосед уронил мешочек — доливаем в него, второй не появляется", async () => {
    db.rows.set(SODA, stack("2"));
    db.beforeWrite = () => {
      const n = { k: "custom:x", n: dec("1"), mob: 0n, mine: 0n, field: 0n, loot: 0n };
      db.bags.push({ id: "lb_near", cell: "3,4", buried: false, items: [n] });
    };
    await expect(drop(SODA)).resolves.toMatchObject({ bagId: "lb_near" });
    expect(db.bags).toHaveLength(1);
  });

  it("героя нет на карте — отказ, рюкзак не тронут", async () => {
    db.pos = null;
    db.rows.set(SODA, stack("5"));
    await expect(drop(SODA, 1)).rejects.toThrow("bag.discard_off_map");
    expect(db.rows.get(SODA)?.count).toBe(dec("5"));
    expect(db.writes).toBe(0);
  });
});

describe("метки, зелья, пыль", () => {
  it("безымянное уходит первым, собранное — с меткой в порцию", async () => {
    db.rows.set(SODA, stack("5", { loot: "2" }));
    await drop(SODA, 3, "op_first1");
    expect(db.bags[0].items[0]).toMatchObject({ n: dec("3"), loot: 0n });
    expect(db.rows.get(SODA)).toMatchObject({ count: dec("2"), loot: dec("2") });
    await drop(SODA, undefined, "op_second");
    expect(db.bags[0].items[1]).toMatchObject({ n: dec("2"), loot: dec("2") });
    expect(db.rows.has(SODA)).toBe(false);
  });

  it("все четыре метки едут в порцию при выбросе целиком", async () => {
    db.rows.set(SODA, stack("10", { mob: "1", mine: "2", field: "3", loot: "4" }));
    await drop(SODA, 10);
    expect(db.bags[0].items[0]).toMatchObject({ mob: dec("1"), mine: dec("2"), field: dec("3"), loot: dec("4") });
  });

  it("зелье из сумки — так же в мешочек", async () => {
    db.rows.set("custom:potion", stack("3", { loot: "3" }));
    await drop("custom:potion", 3);
    expect(inBags("custom:potion")).toBe(dec("3"));
  });

  it("пыль 0,000178 — в мешочек до последней крошки, стопки нет", async () => {
    db.rows.set(SODA, stack("0.000178"));
    await expect(drop(SODA, 0.000178)).resolves.toMatchObject({ left: 0 });
    expect(inBags(SODA)).toBe(dec("0.000178"));
    expect(db.rows.has(SODA)).toBe(false);
  });

  it("«Ячейку» у 27,738…: шум double не оставляет 20,0000000000000018", async () => {
    db.rows.set(SODA, stack("27.738083231472351586"));
    await expect(drop(SODA, Number("7.738083231472351586"))).resolves.toMatchObject({ left: 20 });
  });
});

describe("изношенный инструмент", () => {
  it("всё — целые штуки в мешочек, изношенная уничтожена", async () => {
    db.rows.set(AXE, stack("3", {}, "40"));
    await expect(drop(AXE)).resolves.toMatchObject({ left: 0, put: 2 });
    expect(inBags(AXE)).toBe(dec("2"));
    expect(db.rows.has(AXE)).toBe(false);
  });

  it("одна изношенная — «всё» уничтожает её, мешочка не будет", async () => {
    db.rows.set(AXE, stack("1", {}, "40"));
    await expect(drop(AXE, 1)).resolves.toMatchObject({ put: 0, bagId: null });
    expect(db.bags).toEqual([]);
    expect(seen.published).toEqual([]);
  });

  it("часть — только целые: изношенная остаётся в рюкзаке", async () => {
    db.rows.set(AXE, stack("3", {}, "40"));
    await expect(drop(AXE, 2.5, "op_part25")).rejects.toThrow("braid.tool_worn_stays");
    expect(db.rows.get(AXE)?.count).toBe(dec("3"));
    await expect(drop(AXE, 2, "op_part20")).resolves.toMatchObject({ left: 1, put: 2 });
    expect(db.rows.get(AXE)).toMatchObject({ count: dec("1"), wear: dec("40") });
  });
});

describe("повторы и гонки", () => {
  it("повтор того же нажатия — прошлый итог, второй порции нет", async () => {
    db.rows.set(SODA, stack("5"));
    const first = await drop(SODA, 2);
    await expect(drop(SODA, 2)).resolves.toEqual(first);
    expect(db.writes).toBe(1);
    expect(inBags(SODA)).toBe(dec("2"));
    expect(db.rows.get(SODA)?.count).toBe(dec("3"));
  });

  it("ответ потерялся после коммита — итог по ключу, без второго выброса", async () => {
    db.rows.set(SODA, stack("5"));
    db.lose = true;
    await expect(drop(SODA, 2)).resolves.toMatchObject({ put: 2, left: 3 });
    expect(db.writes).toBe(1);
  });

  it("трата под рукой — выбрасывается то, что осталось: без дюпа и без минуса", async () => {
    db.rows.set(SODA, stack("5"));
    db.beforeWrite = () => {
      db.rows.set(SODA, stack("3"));
    };
    await expect(drop(SODA, 5)).resolves.toMatchObject({ put: 3, left: 0 });
    expect(inBags(SODA)).toBe(dec("3"));
  });
});

describe("текст оператора", () => {
  const sql = discardToBagSql({
    heroId: "h1",
    account: "acc_1",
    stackKey: SODA,
    qty: 2,
    mapId: "rmap_x",
    q: 3,
    r: 4,
    bagId: null,
    key: "bagdrop:acc_1:op",
    op: "bagdrop:acc_1:op",
  }).replace(/\s+/g, " ");

  it("локи рюкзака, клетки и мешочка — отдельными операторами до WITH; строка рюкзака заперта", () => {
    expect(sql.startsWith(
      "SELECT pg_advisory_xact_lock(hashtext('bp:h1')) AS l; SELECT pg_advisory_xact_lock(hashtext('lootdrop:rmap_x:3:4')) AS l; SELECT pg_advisory_xact_lock(hashtext('lootbag:' || ('lb_' || md5('bagdrop:acc_1:op')))) AS l; WITH prior",
    )).toBe(true);
    expect(sql).toContain("AND NOT EXISTS (SELECT 1 FROM prior) FOR UPDATE");
  });

  it("порция — 24 часа, ключ нажатия — тем же оператором; мешочек — на клетке героя", () => {
    expect(sql).toContain("now() + interval '24 hours'");
    expect(sql).toContain("now(), 'acc_1', 'discard', m.name, now() FROM moved m");
    expect(sql).toContain("SELECT 'bagdrop:acc_1:op', COALESCE((SELECT id FROM bag), ''), 'acc_1', 'h1', 'discard'");
    expect(sql).toContain("('lb_' || md5('bagdrop:acc_1:op')), 'rmap_x', 3, 4, now(), 'acc_1'");
  });
});
