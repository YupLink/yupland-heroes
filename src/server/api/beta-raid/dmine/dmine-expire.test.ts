// Конец жизни гриба DARAI (владелец, 22.10.2026: «живёт неделю … после недели
// исчезает»): свёртка стопок, гриб из рюкзака уходит, с карты — клетка пуста
// у всех сразу (дельта в журнал карты, «built» с owner для «Добычи» хозяина).
// Повтор (функция базы ответила NULL) — без второй рассылки. И таймер ячейки:
// одна ячейка, ближайшее выпадение (час или конец жизни), число штук.
import { beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({
  sql: [] as string[],
  items: [] as Array<{ id: string }>,
  itemGone: new Set<string>(),
  cells: [] as Array<{ map_id: string; q: number; r: number }>,
  /** Ответ raid_mushroom_expire_cell по клетке «q,r» (нет — NULL). */
  cellRes: new Map<string, unknown>(),
  recorded: [] as Array<Record<string, unknown>>,
  published: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/server/db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    s.sql.push(sql);
    if (sql.includes("raid_mushroom_fold()")) return [{ n: 0 }];
    if (sql.includes("FROM yuplink.raid_dmine d") && sql.includes("d.dies_at <= now()"))
      return s.items;
    const item = /raid_mushroom_expire_item\('([^']+)'\)/.exec(sql);
    if (item) return [{ gone: s.itemGone.has(item[1]) }];
    if (sql.includes("building_config ? 'diesAt'")) return s.cells;
    const cell = /raid_mushroom_expire_cell\('[^']+', (-?\d+), (-?\d+)\)/.exec(sql);
    if (cell) return [{ res: s.cellRes.get(`${cell[1]},${cell[2]}`) ?? null }];
    return [];
  },
}));
vi.mock("@/server/raidLive", () => ({
  publishRaid: (e: Record<string, unknown>) => s.published.push(e),
}));
vi.mock("@/server/api/beta-raid/map-journal", () => ({
  recordMapChange: async (mapId: string, change: Record<string, unknown>) => {
    s.recorded.push({ mapId, ...change });
    return 1;
  },
}));

const { expireMushrooms, deadCellsSql, deadItemsSql, expireResOf } = await import("./dmine-expire");
const { dmineTimersOf, dmineTimersSql } = await import("./dmine-read");

beforeEach(() => {
  s.sql.length = 0;
  s.items = [];
  s.itemGone = new Set();
  s.cells = [];
  s.cellRes = new Map();
  s.recorded.length = 0;
  s.published.length = 0;
});

describe("конец жизни", () => {
  it("свёртка стопок — первым шагом", async () => {
    await expireMushrooms();
    expect(s.sql[0]).toContain("SELECT yuplink.raid_mushroom_fold()");
  });

  it("гриб в рюкзаке — уходит; повтор (уже ушёл) не считается", async () => {
    s.items = [{ id: "dm_1" }, { id: "dm_2" }];
    s.itemGone = new Set(["dm_1"]);
    await expect(expireMushrooms()).resolves.toBe(1);
    expect(s.sql.some((x) => x.includes("raid_mushroom_expire_item('dm_2')"))).toBe(true);
    expect(s.recorded).toHaveLength(0);
  });

  it("гриб на карте — клетка пуста у всех и «Добыча» хозяина без F5", async () => {
    s.cells = [{ map_id: "rmap_1", q: 3, r: -4 }];
    s.cellRes.set("3,-4", { owner: "acc_1", paid: 70000, block: false });
    await expect(expireMushrooms()).resolves.toBe(1);
    expect(s.recorded).toEqual([
      {
        mapId: "rmap_1",
        patches: [{ q: 3, r: -4, buildingId: null, buildingSkinId: null, buildingConfig: null }],
      },
    ]);
    expect(s.published).toEqual([
      { mapId: "rmap_1", type: "built", mine: true, owner: true, cells: ["3,-4"] },
    ]);
  });

  it("повтор и второй процесс: функция ответила NULL — без рассылки", async () => {
    s.cells = [{ map_id: "rmap_1", q: 3, r: -4 }];
    await expect(expireMushrooms()).resolves.toBe(0);
    expect(s.recorded).toHaveLength(0);
    expect(s.published).toHaveLength(0);
  });

  it("клетка была блоком — «карта перестроена» целиком", async () => {
    s.cells = [{ map_id: "rmap_1", q: 1, r: 1 }];
    s.cellRes.set("1,1", '{"owner":null,"paid":0,"block":true}');
    await expireMushrooms();
    expect(s.recorded).toEqual([{ mapId: "rmap_1", full: true }]);
  });

  it("выборки: истёкшие в рюкзаках и на карте (частичный индекс по diesAt)", () => {
    expect(deadItemsSql().replace(/\s+/g, " ")).toContain(
      "WHERE d.state = 'item' AND d.dies_at <= now()",
    );
    expect(deadCellsSql().replace(/\s+/g, " ")).toContain(
      "WHERE c.building_config ? 'diesAt' AND c.building_id IS NOT NULL AND (yuplink.raid_mushroom_kind(c.building_config) IS NOT NULL) AND (c.building_config->>'diesAt')::timestamptz <= now()",
    );
    // Золотой и алмазный тоже уходят с карты: не только токен Darai.
    expect(deadCellsSql()).not.toContain("= 'darai'");
    expect(expireResOf([{ res: null }])).toBeNull();
    expect(expireResOf([{ res: { owner: "a", paid: "5", block: false } }])).toEqual({
      owner: "a",
      paid: 5,
      block: false,
    });
  });
});

describe("таймер ячейки грибов", () => {
  const t0 = Date.parse("2026-10-22T10:00:00Z");
  const iso = (ms: number) => new Date(ms).toISOString();
  it("одна ячейка: ближайшее выпадение и число штук", () => {
    const rows = [
      { takenAt: iso(t0), diesAt: iso(t0 + 7 * 86_400_000) },
      { takenAt: iso(t0 + 20 * 60_000), diesAt: iso(t0 + 10 * 60_000) },
      { takenAt: iso(t0 + 5 * 60_000), diesAt: null },
    ];
    expect(dmineTimersOf(rows)).toEqual([
      { heroId: null, selected: false, stackKey: "dmine:darai", expiresAt: t0 + 10 * 60_000, count: 3 },
    ]);
  });

  it("своя ячейка на вид: золотой и алмазный — отдельно от DARAI", () => {
    const rows = [
      { takenAt: iso(t0), diesAt: null, kind: "gold" },
      { takenAt: iso(t0 + 60_000), diesAt: null, kind: "gold" },
      { takenAt: iso(t0), diesAt: iso(t0 + 5 * 60_000), kind: "diamonds" },
      { takenAt: iso(t0), diesAt: null, kind: null },
    ];
    const cell = (stackKey: string, expiresAt: number, count: number) =>
      ({ heroId: null, selected: false, stackKey, expiresAt, count });
    expect(dmineTimersOf(rows)).toEqual([
      cell("dmine:gold", t0 + 3_600_000, 2),
      cell("dmine:diamonds", t0 + 5 * 60_000, 1),
      cell("dmine:darai", t0 + 3_600_000, 1),
    ]);
    expect(dmineTimersSql("a")).toContain("d.mushroom AS kind");
  });

  it("грибов нет или даты битые — ячейки нет", () => {
    expect(dmineTimersOf([])).toEqual([]);
    expect(dmineTimersOf([{ takenAt: "мусор", diesAt: null }])).toEqual([]);
  });

  it("рюкзаки всех героев аккаунта с пометкой выбранного, только грибы в рюкзаке", () => {
    const sql = dmineTimersSql("acc_'1").replace(/\s+/g, " ");
    expect(sql).toContain("WHERE d.state = 'item' AND h.account_id = 'acc_''1'");
    expect(sql).toContain('d.hero_id AS "heroId"');
    expect(sql).toContain("s.account_id = 'acc_''1' AND s.selected_at IS NOT NULL");
    expect(sql).toContain("ORDER BY s.selected_at DESC LIMIT 1), false) AS selected");
  });

  it("ячейка на героя и вид: свой отсчёт у каждого героя, выбранный помечен", () => {
    const rows = [
      { takenAt: iso(t0), diesAt: null, kind: "gold", heroId: "h1", selected: true },
      { takenAt: iso(t0 + 60_000), diesAt: null, kind: "gold", heroId: "h1", selected: true },
      { takenAt: iso(t0 + 30 * 60_000), diesAt: null, kind: "gold", heroId: "h2", selected: false },
    ];
    expect(dmineTimersOf(rows)).toEqual([
      { heroId: "h1", selected: true, stackKey: "dmine:gold", expiresAt: t0 + 3_600_000, count: 2 },
      {
        heroId: "h2",
        selected: false,
        stackKey: "dmine:gold",
        expiresAt: t0 + 90 * 60_000,
        count: 1,
      },
    ]);
  });
});
