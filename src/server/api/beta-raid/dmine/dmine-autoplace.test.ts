// Автопостановка гриба DARAI через час (владелец, 22.10.2026: «не мешочек, а
// сразу ставится на клетку, где стоит герой… и работает у того, у кого была в
// рюкзаке»): своя клетка первой, не годится — ближайшая годная рядом; правила
// клетки и прохода — как у «Посадить»; оператор тот же (именно этот гриб,
// late, даром), ключ — на гриб: повтор не ставит второй; остров и «некуда» — ждём.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AutoCellRow } from "./dmine-autoplace";

type Row = Record<string, unknown>;
const s = vi.hoisted(() => ({
  sql: [] as string[],
  cells: [] as Array<Record<string, unknown>>,
  walk: [] as Array<{ q: number; r: number }>,
  /** Клетки, где оператор откажет (заняли между выборкой и записью). */
  refuse: new Set<string>(),
  /** Предмета в рюкзаке уже нет. */
  gone: false,
  ops: new Map<string, Row>(),
  announced: [] as Row[],
}));

vi.mock("@/server/db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    s.sql.push(sql);
    if (sql.includes("AS busy, f.road")) return s.cells;
    if (/^\s*SELECT c\.q, c\.r\s+FROM yuplink\.raid_map_cells c/.test(sql)) return s.walk;
    if (sql.includes("WITH prior AS")) {
      const at = /placed_q = (-?\d+), placed_r = (-?\d+)/.exec(sql)!;
      const key = `${at[1]},${at[2]}`;
      const op = /INSERT INTO yuplink\.raid_dmine_op .*?SELECT '([^']+)'/s.exec(sql)![1];
      if (s.gone) return [{ _row: { cell: true, dm: true, box: false, placed: false } }];
      if (s.refuse.has(key)) return [{ _row: { cell: true, dm: true, box: true, busy: true } }];
      s.ops.set(op, { op, kind: "place", map_id: "rmap_1", q: +at[1], r: +at[2], sent: false });
      return [{ _row: { cell: true, dm: true, box: true, placed: true, was: false } }];
    }
    return [];
  },
}));
vi.mock("@/server/api/beta-raid/dmine/dmine-announce", () => ({
  loadDmineOp: async (op: string) => s.ops.get(op) ?? null,
  announceDmine: async (row: Row) => {
    s.announced.push(row);
    return true;
  },
}));

const { autoCells, autoCellsSql, autoOpOf, autoPlaceDmine, AUTO_RADIUS } =
  await import("./dmine-autoplace");
const { hexDisk } = await import("@/lib/mineBuild");

const free = (q: number, r: number): AutoCellRow => ({
  q,
  r,
  busy: false,
  road: false,
  taken: false,
  bag: false,
  player: false,
});
/** Круг героя (5,5): все клетки есть и годны, проход — весь круг с запасом. */
const ring = () => hexDisk({ q: 5, r: 5 }, AUTO_RADIUS).map((c) => free(c.q, c.r));
const due = {
  id: "dm_1",
  hero_id: "h1",
  account_id: "acc_1",
  wallet: "w1.tg",
  map_id: "rmap_1",
  q: 5,
  r: 5,
};
const placedAt = () => s.sql.filter((x) => x.includes("WITH prior AS"));

beforeEach(() => {
  s.sql.length = 0;
  s.cells = ring();
  s.walk = hexDisk({ q: 5, r: 5 }, 10);
  s.refuse = new Set();
  s.gone = false;
  s.ops = new Map();
  s.announced.length = 0;
});

describe("годные клетки", () => {
  it("своя клетка первой, дальше ближние; занятые, дороги, блоки, мешочки, игроки — мимо", () => {
    const rows = [
      { ...free(5, 5), player: false },
      { ...free(6, 5), busy: true },
      { ...free(5, 6), road: true },
      { ...free(4, 6), taken: true },
      { ...free(4, 5), bag: true },
      { ...free(5, 4), player: true },
      free(6, 4),
      free(7, 5),
    ];
    expect(autoCells({ q: 5, r: 5 }, rows)).toEqual([
      { q: 5, r: 5 },
      { q: 6, r: 4 },
      { q: 7, r: 5 },
    ]);
  });

  it("клетки нет на карте — не годится; проход не проверяем (владелец: «и пусть»)", () => {
    expect(autoCells({ q: 5, r: 5 }, [])).toEqual([]);
    // Клетка в узком коридоре годится: гриб-стена может перекрыть путь.
    expect(autoCells({ q: 5, r: 5 }, [free(5, 5)])).toEqual([{ q: 5, r: 5 }]);
  });

  it("признаки — те же, что у «Разместить»: держит клетку, дорога, блок, мешочек, игрок", () => {
    const sql = autoCellsSql({ mapId: "rmap_1", q: 5, r: 5, account: "acc_1" }).replace(
      /\s+/g,
      " ",
    );
    expect(sql).toContain(
      "(f.building OR f.obj OR f.water OR f.dome OR f.chest OR f.guard OR ex.decor OR ex.ship) AS busy",
    );
    expect(sql).toContain("c.group_id IS NOT NULL OR c.object_id IS NOT NULL");
    expect(sql).toContain("p.account_id <> 'acc_1'");
    expect(sql).toContain("c.q BETWEEN 3 AND 7 AND c.r BETWEEN 3 AND 7");
    expect(sql).not.toContain("raid_nature_around");
  });
});

describe("autoPlaceDmine", () => {
  it("встаёт на клетку героя: именно этот гриб, просроченный годен, даром, у того, у кого лежал", async () => {
    await expect(autoPlaceDmine(due)).resolves.toBe("placed");
    const [sql] = placedAt();
    expect(sql).toContain(`'${autoOpOf("dm_1")}'`);
    expect(sql).toContain("AND d.id = 'dm_1'");
    expect(sql).not.toContain("d.taken_at > now()");
    expect(sql).not.toContain("touch_energy_atomic");
    expect(sql).toContain("b.hero_id = 'h1' AND b.stack_key = 'dmine:darai'");
    expect(sql).toMatch(/SELECT 'rmap_1', 5, 5, 'acc_1', 'w1\.tg', now\(\), 0, 'base'/);
    expect(s.announced).toHaveLength(1);
  });

  it("своя клетка занята — ближайшая годная рядом", async () => {
    s.cells = ring().map((c) => (c.q === 5 && c.r === 5 ? { ...c, busy: true } : c));
    await expect(autoPlaceDmine(due)).resolves.toBe("placed");
    const [sql] = placedAt();
    const at = /placed_q = (-?\d+), placed_r = (-?\d+)/.exec(sql)!;
    expect(Math.abs(+at[1] - 5) + Math.abs(+at[2] - 5) + Math.abs(+at[1] + +at[2] - 10)).toBe(2);
  });

  it("клетку заняли между выборкой и записью — следующая по списку; проход не спрашиваем", async () => {
    s.refuse.add("5,5");
    await expect(autoPlaceDmine(due)).resolves.toBe("placed");
    expect(placedAt()).toHaveLength(2);
    expect(
      s.sql.some((x) => /^\s*SELECT c\.q, c\.r\s+FROM yuplink\.raid_map_cells c/.test(x)),
    ).toBe(false);
  });

  it("вид гриба — из строки: золотой встаёт из стопки dmine:gold", async () => {
    await expect(autoPlaceDmine({ ...due, mushroom: "gold" })).resolves.toBe("placed");
    const [sql] = placedAt();
    expect(sql).toContain("b.stack_key = 'dmine:gold'");
    expect(sql).toContain("d.mushroom = 'gold'");
  });

  it("повтор прохода: ключ лежит — второго гриба нет, клетку дошлём", async () => {
    s.ops.set(autoOpOf("dm_1"), { op: autoOpOf("dm_1"), sent: false });
    await expect(autoPlaceDmine(due)).resolves.toBe("placed");
    expect(placedAt()).toHaveLength(0);
    expect(s.announced).toHaveLength(1);
  });

  it("герой на острове или без позиции — ждём, ничего не читаем", async () => {
    await expect(autoPlaceDmine({ ...due, map_id: "isle_abc" })).resolves.toBe("none");
    await expect(autoPlaceDmine({ ...due, map_id: null, q: null, r: null })).resolves.toBe("none");
    expect(s.sql.some((x) => x.includes("AS busy"))).toBe(false);
  });

  it("вокруг всё занято — ждём; гриба уже нет — «нет»", async () => {
    s.cells = ring().map((c) => ({ ...c, road: true }));
    await expect(autoPlaceDmine(due)).resolves.toBe("none");
    s.cells = ring();
    s.gone = true;
    await expect(autoPlaceDmine(due)).resolves.toBe("gone");
    expect(s.announced).toHaveLength(0);
  });

  it("без id или героя — «нет»", async () => {
    await expect(autoPlaceDmine({ ...due, id: "" })).resolves.toBe("gone");
    await expect(autoPlaceDmine({ ...due, hero_id: "" })).resolves.toBe("gone");
  });
});
