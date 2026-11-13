// Шахта (§8.59 п. 9) держит клетку и там, где клетку героя выбирает СЕРВЕР:
// сход на берег, выход из портала (nearestLand), клетка у замка/ратуши,
// спасение застрявших. Все они ходят через ships.blockedSql — проверяем, что
// признак шахты в нём есть (и у админа тоже) и доезжает до каждого запроса.
// И снимок карты: список шахт уходит клиенту тем же признаком.
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ sql: [] as string[], rows: [] as unknown[] }));
vi.mock("../../db/mcpClient", () => ({
  mcpExec: async (sql: string) => (db.sql.push(sql), db.rows),
}));
vi.mock("./castle", () => ({ castleCell: async () => ({ q: 0, r: 0 }) }));

import { blockedSql, freeWaterAround, landAround } from "./ships";
import { findStuckShips, nearestLand } from "./ship-rescue";
import { castleLanding } from "./castle-door";
import { loadMineCells } from "./mine-cells";
import { mineCellSql } from "./mine-cell-sql";
import { packCells, type RawCell } from "./packCells";

const MINE = mineCellSql("c");

beforeEach(() => {
  db.sql = [];
  db.rows = [];
});

describe("blockedSql: шахта — стена и для админа", () => {
  it("признак шахты в условии при любом bypassVoid", () => {
    expect(blockedSql(false)).toContain(`OR ${MINE}`);
    expect(blockedSql(true)).toContain(`OR ${MINE}`);
  });

  it("доезжает до схода на берег, выхода из портала, замка и спасения судов", async () => {
    await landAround("m", 0, 0);
    await nearestLand("m", 0, 0);
    await castleLanding("m", { q: 0, r: 0 });
    await freeWaterAround("m", 0, 0);
    await findStuckShips("m");
    // У замка пусто (строк нет) — castleLanding спрашивает ещё и nearestLand: шесть.
    expect(db.sql).toHaveLength(6);
    for (const sql of db.sql) expect(sql).toContain(MINE);
  });
});

describe("снимок карты: список шахт", () => {
  it("loadMineCells — по тому же признаку, ключами «q,r»", async () => {
    db.rows = [
      { q: 3, r: -4 },
      { q: "5", r: "6" },
    ];
    expect([...(await loadMineCells("m1"))].sort()).toEqual(["3,-4", "5,6"]);
    expect(db.sql[0]).toContain(`c.map_id = 'm1' AND ${MINE}`);
  });

  it("packCells кладёт в mines только клетки с постройкой из набора", () => {
    const cell = (q: number, building: string | null): RawCell => ({
      q,
      r: 0,
      terrain_id: "t",
      road_id: null,
      object_id: null,
      decoration_id: null,
      building_id: building,
    });
    const mines = new Set(["0,0", "2,0"]);
    const p = packCells(
      [cell(0, "building_mine"), cell(1, "building_mine"), cell(2, null)],
      (raw) => raw,
      () => false,
      () => false,
      () => false,
      (key) => mines.has(key),
    );
    expect(p.mines).toEqual([0]);
    // Без предиката (старый путь getBetaRaidMap) — пусто, а не ошибка.
    expect(
      packCells(
        [cell(0, "b")],
        (raw) => raw,
        () => false,
      ).mines,
    ).toEqual([]);
  });
});
