// Перенос декора (режим бога): вне блока едет только декор клетки — с его
// отрастанием (raid_decor_respawn): строка едет на новую клетку, и снимок
// клетки в ней — какой клетка станет, иначе сборщик снял бы возврат.
// Цель — как у роста декора: не на игрока, беглеца, сундук и чужой декор.
import { describe, expect, it, vi } from "vitest";
import { POS_MAP_SQL } from "@/server/api/beta-raid/pos-map-sql";

vi.mock("@/server/db/mcpClient", () => ({ mcpExec: vi.fn() }));

import { moveUnitSql, unitWriteNames } from "@/server/api/beta-raid/god-move/move-sql";
import {
  DST,
  SRC,
  WRITE_RE,
  cteOf,
  decorAt,
  flat,
  writtenTables,
} from "@/server/api/beta-raid/god-move/move-sql.fixture";

const sql = flat(moveUnitSql(decorAt));
const cte = (name: string) => cteOf(sql, name);

describe("перенос декора", () => {
  it("локи: без шахты и грядки и без склада города — постройка не едет", () => {
    expect(sql).toContain("hashtext('decor-respawn')");
    expect(sql).toContain("hashtext('chestcell:rmap_x:7:1')");
    expect(sql).not.toContain("hashtext('mine:");
    expect(sql).not.toContain("raid_town_stock x");
  });

  it("на ведущей — тот самый декор; повтор — тот же декор уже на цели", () => {
    const chk = cte("chk");
    expect(chk).toContain(
      "WHEN NOT EXISTS (SELECT 1 FROM lead WHERE lead.decoration_id IS NOT NULL)",
    );
    expect(chk).toContain(
      "WHEN EXISTS (SELECT 1 FROM goal WHERE goal.decoration_id = 'dec_oak') THEN 'already'",
    );
    expect(chk).toContain(
      "WHEN NOT EXISTS (SELECT 1 FROM lead WHERE lead.decoration_id = 'dec_oak') THEN 'changed'",
    );
    expect(cte("drift")).toContain("u.d <> p.d");
    expect(cte("drift")).not.toContain("u.b <> p.b");
  });

  it("цель: CELL_HELD, плюс любой декор, беглец и игрок; без остатков постройки", () => {
    const chk = cte("chk");
    expect(chk).toContain("'target_runner'");
    expect(chk).toContain("'target_player'");
    expect(chk).toContain("OR (SELECT fx.any_decor FROM fx) THEN 'target_decor'");
    expect(chk).not.toContain("'chest_guard'");
    expect(cte("lo")).toBe(
      "SELECT NULL::boolean AS market, NULL::boolean AS town, NULL::boolean AS warehouse, NULL::boolean AS field, NULL::boolean AS mine",
    );
    expect(cte("fx")).toContain(`${POS_MAP_SQL("p")} = c.map_id`);
  });

  it("мешочки под встающим декором — отказ: под декором их не видно (§8.19)", () => {
    expect(cte("bd")).toContain(
      "WHERE lb.map_id = 'rmap_x' AND lb.q = 7 AND lb.r = 1 AND li.count > 0 AND li.expires_at > now()",
    );
    const chk = cte("chk");
    expect(chk).toContain("WHEN (SELECT bd.bag FROM bd) THEN 'target_bag'");
    expect(chk.indexOf("'target_chest'")).toBeLessThan(chk.indexOf("'target_bag'"));
    expect(chk.indexOf("'target_bag'")).toBeLessThan(chk.indexOf("'target_guard'"));
  });

  it("клетки: едет только декор", () => {
    const cells = cte("cells");
    expect(cells).toContain("SET decoration_id = s.decoration_id, saved_at = now()");
    expect(cells).not.toContain("building_id = s.building_id");
    expect(cells).not.toContain("group_id = s.group_id");
  });

  it("отрастание едет с декором; снимок — клетка цели (постройка и блок — её собственные)", () => {
    const put = cte("regrow_put");
    expect(put).toContain(
      "SELECT d.map_id, 7, 1, d.decor_id, d.due_at, t.terrain_id, t.road_id, t.building_id, t.object_id, t.group_id, NULL, d.created_at",
    );
    expect(put).toContain(`JOIN yuplink.raid_map_cells sc ON ${SRC("sc")}`);
    expect(put).toContain(`JOIN yuplink.raid_map_cells t ON ${DST("t")}`);
    // Только ждущая и не снятая бы сборщиком (клетку не правили после рубки).
    expect(put).toContain(
      `WHERE ${SRC("d")} AND d.placed_at IS NULL AND NOT (sc.terrain_id IS NULL`,
    );
    expect(put).toContain("ON CONFLICT (map_id, q, r) DO UPDATE SET decor_id = EXCLUDED.decor_id");
    expect(put).toContain("placed_at = NULL, created_at = EXCLUDED.created_at");
    const planted = `EXISTS (SELECT 1 FROM yuplink.raid_map_cells pc WHERE ${SRC("pc")} AND pc.decoration_id IS NOT NULL AND pc.planted_decor = pc.decoration_id)`;
    expect(cte("regrow_del")).toBe(
      `DELETE FROM yuplink.raid_decor_respawn d USING go WHERE ${SRC("d")} AND d.placed_at IS NULL AND NOT ${planted} RETURNING 1`,
    );
    // Едет посаженное дерево — ожидание декора карты под ним остаётся и будится (decor-05).
    expect(cte("regrow_wake")).toBe(
      `UPDATE yuplink.raid_decor_respawn d SET due_at = now() FROM go WHERE ${SRC("d")} AND d.placed_at IS NULL AND d.held_at IS NOT NULL AND ${planted} RETURNING 1`,
    );
  });

  it("хозяйство постройки не едет; объекты, сундуки, мешочки — на месте", () => {
    const written = writtenTables(sql);
    expect([...written].sort()).toEqual(["raid_decor_respawn", "raid_map_cells"]);
    expect([...sql.matchAll(WRITE_RE)].length).toBe(unitWriteNames(decorAt).length);
    expect(unitWriteNames(decorAt)).toEqual(["cells", "regrow_put", "regrow_del", "regrow_wake"]);
  });
});
