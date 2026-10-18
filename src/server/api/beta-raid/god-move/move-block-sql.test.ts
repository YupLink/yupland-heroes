// Перенос блока клеток (режим бога): здание в блоке едет всем блоком — каждая
// клетка на один вектор, с формой, group_id, масштабом и декором блока. Блок
// сдвигается «сам на себя»: свои старые клетки свободны, проверяются только
// новые; клетки, куда встают постройка и декор, — без объекта, сундука и
// охраны даже среди своих. Базы нет — читаем текст.
import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/db/mcpClient", () => ({ mcpExec: vi.fn() }));

import { moveUnitSql, unitWriteNames } from "@/server/api/beta-raid/god-move/move-sql";
import { cellMap } from "@/server/api/beta-raid/god-move/move-cells-sql";
import {
  buildingCell,
  decorCell,
  freshCells,
  parseUnit,
  unitTooMany,
} from "@/server/api/beta-raid/god-move/move-unit";
import {
  WRITE_RE,
  block,
  blockAt,
  cteOf,
  flat,
} from "@/server/api/beta-raid/god-move/move-sql.fixture";

const sql = flat(moveUnitSql(blockAt));
const cte = (name: string) => cteOf(sql, name);
const at = (a: string, q: number, r: number) =>
  `${a}.map_id = 'rmap_x' AND ${a}.q = ${q} AND ${a}.r = ${r}`;

describe("блок: состав и вектор", () => {
  it("снимок: клетки блока ведущей клетки; вне блока — она одна", () => {
    const rows = [
      { q: 0, r: 0, group_id: "g_1", building: true, decor: false },
      { q: 1, r: 0, group_id: "g_1", building: false, decor: true },
      { q: 2, r: 0, group_id: "g_1", building: false, decor: false },
    ];
    expect(parseUnit(rows, { q: 0, r: 0 })).toEqual(block);
    expect(
      parseUnit([{ q: 5, r: 5, group_id: null, building: true, decor: false }], { q: 5, r: 5 }),
    ).toEqual({ gid: null, cells: [{ q: 5, r: 5, building: true, decor: false }] });
    expect(parseUnit([], { q: 5, r: 5 })).toBeNull();
  });

  it("сдвиг на клетку «сам на себя»: новая — одна (3,0), постройка и декор встают на свои старые", () => {
    expect(freshCells(blockAt)).toEqual([{ q: 3, r: 0 }]);
    expect(buildingCell(blockAt)).toEqual({ q: 0, r: 0 });
    expect(decorCell(blockAt)).toEqual({ q: 1, r: 0 });
    expect(cellMap(blockAt)).toEqual([
      { at: { q: 1, r: 0 }, from: { q: 0, r: 0 } },
      { at: { q: 2, r: 0 }, from: { q: 1, r: 0 } },
      { at: { q: 3, r: 0 }, from: { q: 2, r: 0 } },
      { at: { q: 0, r: 0 }, from: null },
    ]);
  });

  it("больше одной постройки или декора в блоке — отказ block_many; вне блока — не про это", () => {
    expect(unitTooMany(block)).toBe(false);
    const two = { ...block, cells: block.cells.map((c) => ({ ...c, building: true })) };
    expect(unitTooMany(two)).toBe(true);
    const decors = { ...block, cells: block.cells.map((c) => ({ ...c, decor: true })) };
    expect(unitTooMany(decors)).toBe(true);
    expect(unitTooMany({ gid: null, cells: [{ q: 0, r: 0, building: true, decor: true }] })).toBe(
      false,
    );
  });
});

describe("блок: локи и решение", () => {
  it("локи: шахта/грядка клетки постройки и её цели, chestcell новых клеток, строки всех", () => {
    expect(sql).toContain("hashtext('mine:rmap_x:0:0')");
    expect(sql).toContain("hashtext('mine:rmap_x:1:0')");
    expect(sql).toContain("hashtext('field:rmap_x:0:0')");
    // chestcell — всех новых клеток, и своих старых тоже: пустой член блока
    // без постройки сундук принял бы, а туда встаёт постройка или декор.
    for (const q of [1, 2, 3]) expect(sql).toContain(`hashtext('chestcell:rmap_x:${q}:0')`);
    expect(sql).not.toContain("hashtext('chestcell:rmap_x:0:0')");
    expect(sql).toContain(
      "(c.q, c.r) IN ((0, 0), (1, 0), (2, 0), (3, 0)) ORDER BY c.q, c.r FOR UPDATE",
    );
  });

  it("состав сверяется целиком: клетки блока, где постройка и где декор", () => {
    const drift = cte("drift");
    expect(drift).toContain("WHERE c.map_id = 'rmap_x' AND c.group_id = 'g_1'");
    expect(drift).toContain(
      "(VALUES (0, 0, true, false), (1, 0, false, true), (2, 0, false, false))",
    );
    expect(drift).toContain("u.b <> p.b OR u.d <> p.d");
    expect(drift).toContain("raid_decor_respawn rd");
  });

  it("цель: CELL_HELD и прочее — только по новой клетке; посадка постройки и декора — по своим", () => {
    expect(cte("f")).toContain(at("c", 3, 0));
    expect(cte("f")).not.toContain(at("c", 1, 0));
    expect(cte("ld")).toContain(at("c", 1, 0));
    expect(cte("ld")).toContain(at("c", 2, 0));
    expect(cte("ld")).not.toContain(at("c", 3, 0));
    expect(cte("ground")).toContain("(VALUES (1, 0), (2, 0), (3, 0))");
    expect(cte("fx")).toContain("(c.q, c.r) IN ((3, 0))");
    // Данные снесённой постройки — на клетке, куда встаёт постройка (своя старая).
    expect(cte("lo")).toContain(`yuplink.raid_warehouse_slot x WHERE ${at("x", 1, 0)}`);
  });

  it("повтор блока — на цели тот же блок; мешочки — под клеткой, куда встаёт декор блока", () => {
    expect(cte("chk")).toContain(
      "WHEN EXISTS (SELECT 1 FROM goal WHERE goal.building_id = 'bld_1' AND goal.group_id = 'g_1') THEN 'already'",
    );
    expect(cte("bd")).toContain("lb.q = 2 AND lb.r = 0");
  });

  it("блок с декором не ложится на чужой (даже проходной) декор, беглеца и игрока", () => {
    const chk = cte("chk");
    expect(chk).toContain("WHEN (SELECT fx.block FROM fx) THEN 'target_block'");
    expect(chk).toContain("WHEN (SELECT fx.runner FROM fx) THEN 'target_runner'");
    expect(chk).toContain("WHEN (SELECT fx.player FROM fx) THEN 'target_player'");
    expect(chk).toContain(
      "WHEN (SELECT ex.decor FROM ex) OR (SELECT fx.any_decor FROM fx) THEN 'target_decor'",
    );
    expect(chk).toContain(
      "WHEN (SELECT f.obj FROM f) OR (SELECT ld.obj FROM ld) THEN 'target_object'",
    );
  });
});

describe("блок: что едет", () => {
  it("клетки: постройка, декор, блок и масштаб — со своей старой; освободившаяся — пустая", () => {
    const cells = cte("cells");
    expect(cells).toContain(
      "SET building_id = s.building_id, building_skin_id = s.building_skin_id, " +
        "building_config = s.building_config, decoration_id = s.decoration_id, " +
        "group_id = s.group_id, icon_scale = s.icon_scale, saved_at = now()",
    );
    expect(cells).toContain(
      "(VALUES (1, 0, 0, 0), (2, 0, 1, 0), (3, 0, 2, 0), (0, 0, NULL::int, NULL::int))",
    );
    // Строки клеток не двигаются: местность, дорога, объект и купол на месте.
    const set = cells.slice(cells.indexOf("SET"), cells.indexOf(" FROM "));
    expect(set).not.toMatch(/\b[qr] = /);
  });

  it("хозяйство постройки — с её клетки (0,0) на (1,0)", () => {
    expect(cte("wh")).toContain(
      `UPDATE yuplink.raid_warehouse_slot x SET q = 1, r = 0 FROM go WHERE ${at("x", 0, 0)}`,
    );
    expect(cte("tier_up")).toContain("SELECT s.map_id, 1, 0, s.tier");
  });

  it("отрастание декора блока — на клетку декора после сдвига, снимок — блок и постройка оттуда", () => {
    const put = cte("regrow_put");
    expect(put).toContain(
      "SELECT d.map_id, 2, 0, d.decor_id, d.due_at, t.terrain_id, t.road_id, s.building_id, t.object_id, s.group_id, NULL, d.created_at",
    );
    expect(put).toContain(`JOIN yuplink.raid_map_cells t ON ${at("t", 2, 0)}`);
    expect(put).toContain("LEFT JOIN src s ON s.q = 1 AND s.r = 0 CROSS JOIN go");
    expect(put).toContain(`WHERE ${at("d", 1, 0)} AND d.placed_at IS NULL AND NOT (`);
    expect(put).toContain(`JOIN yuplink.raid_map_cells sc ON ${at("sc", 1, 0)}`);
    expect(cte("regrow_del")).toContain(`USING go WHERE ${at("d", 1, 0)}`);
    expect(sql).not.toContain("regrow_keep");
  });

  it("записи — ровно перечисленные, каждая под go", () => {
    expect([...sql.matchAll(WRITE_RE)].length).toBe(unitWriteNames(blockAt).length);
    for (const n of unitWriteNames(blockAt))
      expect(cte(n), n).toMatch(/\b(?:FROM|USING)\s[^;]*\bgo\b/);
  });
});
