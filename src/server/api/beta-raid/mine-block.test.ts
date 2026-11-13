// Блок-шахта режима бога (§8.59 п. 9): постройка на одной клетке блока, стена —
// весь блок. На проде 20.10 таких 10 (семь «Золотых шахт», «Банк», «Бедный
// Юпик», «Лавка Алхимика»): вторая клетка была проходимой и копаемой.
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ sql: [] as string[], rows: [] as unknown[], fail: false }));
vi.mock("@/server/db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    db.sql.push(sql);
    if (db.fail) throw new Error("pool is closed");
    return db.rows;
  },
}));

import { blockMineSql, mineCellSql, ownMineSql } from "@/server/api/beta-raid/mine-cell-sql";
import {
  blockMineProbe,
  blockMinesMoved,
  liftedBlockMine,
  readBlockMines,
} from "@/server/api/beta-raid/mine-block-sync";
import { loadMineCells } from "@/server/api/beta-raid/mine-cells";
import { packCells, type RawCell } from "@/server/api/beta-raid/packCells";

const flat = (s: string) => s.replace(/\s+/g, " ");

beforeEach(() => {
  db.sql = [];
  db.rows = [];
  db.fail = false;
});

describe("mineCellSql: своя постройка или блок-шахта", () => {
  it("шахта = своя постройка ИЛИ член блока, где постройка-шахта", () => {
    expect(flat(mineCellSql("c"))).toBe(flat(`(${ownMineSql("c")} OR ${blockMineSql("c")})`));
  });

  it("блок — по group_id той же карты (индекс map_id, group_id), лестница — у постройки блока", () => {
    const sql = flat(blockMineSql("hc"));
    expect(sql).toContain("(hc.group_id IS NOT NULL AND EXISTS");
    expect(sql).toContain("mine_b.map_id = hc.map_id AND mine_b.group_id = hc.group_id");
    expect(sql).toContain("mine_b.building_id IS NOT NULL");
    // Вложенная проверка — своим алиасом шаблона, лестница та же.
    expect(sql).toContain(flat(ownMineSql("mine_b", "mine_bt")));
    expect(sql).toContain("WHEN mine_b.building_config->>'effect' IN (");
    expect(sql).not.toMatch(/\bc\./);
  });
});

describe("снимок: члены блока-шахты в списке шахт", () => {
  const cell = (q: number, building: string | null, group: string | null): RawCell => ({
    q,
    r: 0,
    terrain_id: "t",
    road_id: null,
    object_id: null,
    decoration_id: null,
    building_id: building,
    group_id: group,
  });

  it("член блока без своей постройки — в mines; пустая клетка из набора — нет", () => {
    const mines = new Set(["0,0", "1,0", "2,0"]);
    const p = packCells(
      [cell(0, "building_gold", "g1"), cell(1, null, "g1"), cell(2, null, null)],
      (raw) => raw,
      () => false,
      () => false,
      () => false,
      (key) => mines.has(key),
    );
    expect(p.mines).toEqual([0, 1]);
  });

  it("сбой чтения шахт роняет сборку снимка, а не отдаёт карту без шахт", async () => {
    db.fail = true;
    await expect(loadMineCells("m1")).rejects.toThrow("pool is closed");
  });
});

describe("mine-block-sync: дельтой или полным снимком", () => {
  it("спрашиваем только клетки с блоком, настройками постройки или снятым куполом", () => {
    const probe = blockMineProbe([
      { q: 1, r: 1, groupId: "g1" },
      { q: 2, r: 2, buildingConfig: { effect: "mine" } },
      { q: 3, r: 3, voidFog: false },
      { q: 4, r: 4, groupId: null },
      { q: 5, r: 5, voidFog: true },
      { q: 6, r: 6 },
    ]);
    expect(probe.cells).toEqual([
      { q: 1, r: 1 },
      { q: 2, r: 2 },
      { q: 3, r: 3 },
      { q: 4, r: 4 },
    ]);
    expect(probe.groups).toEqual(["g1"]);
    expect([...probe.lifted]).toEqual(["3,3"]);
  });

  it("пустой вопрос — без похода в базу", async () => {
    expect((await readBlockMines("m", [], [])).keys.size).toBe(0);
    expect(db.sql).toEqual([]);
  });

  it("блоки клеток и названные блоки — одной выборкой; ключи — только «шахта от блока»", async () => {
    db.rows = [
      { q: 57, r: 74, group_id: "g_a", by_block: false },
      { q: 58, r: 73, group_id: "g_a", by_block: true },
      { q: 76, r: 88, group_id: "g_b", by_block: true },
    ];
    const got = await readBlockMines("m1", [{ q: 57, r: 74 }], ["g_b"]);
    expect([...got.keys].sort()).toEqual(["58,73", "76,88"]);
    expect(got.groups.sort()).toEqual(["g_a", "g_b"]);
    const sql = flat(db.sql[0]);
    expect(sql).toContain("(c.q, c.r) IN ((57,74))");
    expect(sql).toContain("SELECT unnest(ARRAY['g_b']::text[])");
    expect(sql).toContain(flat(`(${blockMineSql("c")} AND NOT ${ownMineSql("c")}) AS by_block`));
  });

  it("сменился состав членов-шахт или с члена сняли купол — полный снимок", () => {
    const set = (...k: string[]) => ({ keys: new Set(k), groups: [] });
    const none = new Set<string>();
    expect(blockMinesMoved(set("1,1"), set("1,1"), none)).toBe(false);
    expect(blockMinesMoved(set(), set("1,1"), none)).toBe(true); // вступил в блок-шахту
    expect(blockMinesMoved(set("1,1"), set(), none)).toBe(true); // вышел / эффект снят
    expect(blockMinesMoved(set("1,1"), set("2,2"), none)).toBe(true);
    expect(blockMinesMoved(set("1,1"), set("1,1"), new Set(["1,1"]))).toBe(true);
    expect(blockMinesMoved(set(), set(), new Set(["1,1"]))).toBe(false);
  });

  it("правка по клетке: купол снят с члена блока-шахты — да; сбой чтения — тоже да", async () => {
    expect(await liftedBlockMine("m", { q: 1, r: 1, voidFog: true })).toBe(false);
    expect(await liftedBlockMine("m", { q: 1, r: 1 })).toBe(false);
    expect(db.sql).toEqual([]);
    db.rows = [{ q: 1, r: 1, group_id: "g", by_block: true }];
    expect(await liftedBlockMine("m", { q: 1, r: 1, voidFog: false })).toBe(true);
    db.rows = [{ q: 2, r: 2, group_id: "g", by_block: true }];
    expect(await liftedBlockMine("m", { q: 1, r: 1, voidFog: false })).toBe(false);
    db.fail = true;
    expect(await liftedBlockMine("m", { q: 1, r: 1, voidFog: false })).toBe(true);
  });
});
