// Перенос объекта карты (режим бога): объект клетки едет с настройками,
// распиской Darai и боевым состоянием ТОЙ ЖЕ строкой (id — ключ урона и
// наград); беглец под ним остаётся; повергнутый не едет; цель — как у
// автораздачи. Отказ — до записи, повтор — «уже там». Базы нет — читаем текст.
import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/db/mcpClient", () => ({ mcpExec: vi.fn() }));

import {
  OBJECT_WRITE_NAMES,
  moveObjectSql,
  parseObjectRow,
} from "@/server/api/beta-raid/god-move/move-object-sql";
import { GOD_MOVE_REASONS } from "@/lib/godMove";
import { POS_MAP_SQL } from "@/server/api/beta-raid/pos-map-sql";
import {
  DST,
  SRC,
  WRITE_RE,
  cteOf,
  flat,
  writtenTables,
} from "@/server/api/beta-raid/god-move/move-sql.fixture";

const o = { mapId: "rmap_x", from: { q: 4, r: -2 }, to: { q: 7, r: 1 }, ref: "boss:rbt_1" };
const sql = flat(moveObjectSql(o));
const cte = (name: string) => cteOf(sql, name);

describe("перенос объекта: локи и решение", () => {
  it("локи до чтения: карта, сундук и выброс на цели; клетки и бой объекта — FOR UPDATE", () => {
    expect(
      sql.startsWith(
        "SELECT pg_advisory_xact_lock(hashtext('godmove:rmap_x')) AS l; " +
          "SELECT pg_advisory_xact_lock(hashtext('decor-respawn')) AS l; " +
          "SELECT pg_advisory_xact_lock(hashtext('chestcell:rmap_x:7:1')) AS l; " +
          "SELECT pg_advisory_xact_lock(hashtext('lootdrop:rmap_x:7:1')) AS l; " +
          "SELECT 1 FROM yuplink.raid_map_cells c WHERE c.map_id = 'rmap_x' " +
          "AND ((c.q = 4 AND c.r = -2) OR (c.q = 7 AND c.r = 1)) ORDER BY c.q, c.r FOR UPDATE; " +
          `SELECT 1 FROM yuplink.beta_raid_object_hp h WHERE ${SRC("h")} AND h.cycle_no = 0 FOR UPDATE; WITH src AS`,
      ),
    ).toBe(true);
  });

  it("каждая запись под go, других записей нет", () => {
    expect(cte("go")).toBe("SELECT 1 AS ok FROM chk WHERE chk.reason = 'ok'");
    for (const n of OBJECT_WRITE_NAMES) expect(cte(n), n).toMatch(/\bFROM\s[^;]*\bgo\b/);
    expect([...sql.matchAll(WRITE_RE)].length).toBe(OBJECT_WRITE_NAMES.length);
  });

  it("причины по порядку: сам объект, повергнутый, потом цель как у автораздачи", () => {
    const chk = cte("chk");
    const order = [
      "'already'",
      "'gone'",
      "'changed'",
      "'dead'",
      "'target_missing'",
      "'target_block'",
      "'target_water'",
      "'target_dome'",
      "'target_building'",
      "'target_object'",
      "'target_runner'",
      "'target_player'",
      "'target_chest'",
      "'target_bag'",
      "'target_guard'",
      "'target_decor'",
      "'target_ship'",
      "'target_leftovers'",
      "ELSE 'ok'",
    ];
    const pos = order.map((s) => chk.indexOf(s));
    expect(pos.every((p) => p >= 0)).toBe(true);
    expect([...pos].sort((a, b) => a - b)).toEqual(pos);
    for (const r of chk.matchAll(/THEN '(\w+)'/g))
      if (r[1] !== "already") expect(GOD_MOVE_REASONS).toContain(r[1]);
    expect(chk).toContain(
      "WHEN EXISTS (SELECT 1 FROM dst WHERE dst.object_id = 'boss:rbt_1') THEN 'already'",
    );
    expect(chk).toContain(
      "WHEN NOT EXISTS (SELECT 1 FROM src WHERE src.object_id = 'boss:rbt_1') THEN 'changed'",
    );
  });

  it("повергнутый — по боевому состоянию клетки (слой 0)", () => {
    expect(cte("src")).toContain(
      "h.cycle_no = 0 AND (h.killed_at IS NOT NULL OR h.current_hp <= 0)) AS dead",
    );
  });

  it("цель: суша, без купола, блока, постройки, объекта, беглеца, игрока, живого мешочка, сундука, декора", () => {
    const tg = cte("tg");
    expect(tg).toContain("c.terrain_id IS NOT NULL AS ground");
    expect(tg).toContain(
      "COALESCE((t.name ~* '(вод|water|море|океан|ocean|river|река)'), false) AS water",
    );
    expect(tg).toContain("c.group_id IS NOT NULL AS block");
    expect(tg).toContain("c.object_id IS NOT NULL AS obj");
    // Игрок — с этой карты; позиция без карты — главный мир (этажи, 07.10).
    expect(tg).toContain(`${POS_MAP_SQL("p")} = c.map_id) AS player`);
    expect(tg).toContain("li.count > 0 AND li.expires_at > now()) AS bag");
    expect(tg).toContain("g.killed_at IS NULL AND g.current_hp > 0) AS guard");
    expect(tg).toContain("c.decoration_id IS NOT NULL AS decor");
    // Чужое боевое состояние на цели — остаток: наша строка встала бы на его ключ.
    expect(tg).toContain("h.cycle_no = 0) AS object");
    expect(tg).toContain(DST("c"));
  });
});

describe("перенос объекта: что едет", () => {
  it("клетки: объект и настройки — на цель, расписки Darai меняются местами", () => {
    const cells = cte("cells");
    expect(cells).toContain(
      "object_id = CASE WHEN c.q = 4 AND c.r = -2 THEN NULL ELSE s.object_id END",
    );
    expect(cells).toContain(
      "object_config = CASE WHEN c.q = 4 AND c.r = -2 THEN NULL ELSE s.object_config END",
    );
    expect(cells).toContain(
      "darai_ref = CASE WHEN c.q = 4 AND c.r = -2 THEN d.darai_ref ELSE s.darai_ref END",
    );
    expect(cells).toContain(
      "darai_hold = CASE WHEN c.q = 4 AND c.r = -2 THEN d.darai_hold ELSE s.darai_hold END",
    );
    expect(cells).toContain("FROM src s, dst d, go");
    expect(cells).toContain("((c.q = 4 AND c.r = -2) OR (c.q = 7 AND c.r = 1))");
    for (const col of ["building_id", "decoration_id", "group_id", "terrain_id"])
      expect(cells).not.toContain(col);
  });

  it("боевое состояние — та же строка (id), только адрес; беглец (слой 1) — на месте", () => {
    expect(cte("hp")).toBe(
      `UPDATE yuplink.beta_raid_object_hp h SET q = 7, r = 1 FROM go WHERE ${SRC("h")} AND h.cycle_no = 0 RETURNING 1`,
    );
    const written = writtenTables(sql);
    expect([...written].sort()).toEqual(["beta_raid_object_hp", "raid_map_cells"]);
    expect(sql).not.toContain("cycle_no = 1");
  });

  it("ответ: объект, мешочки на прежней клетке; повтор — тот, что на цели", () => {
    expect(sql).toContain(
      "CASE WHEN (SELECT reason FROM chk) = 'already' THEN (SELECT dst.object_id FROM dst) ELSE (SELECT src.object_id FROM src) END AS object_id",
    );
    expect(sql).toContain(
      `EXISTS (SELECT 1 FROM yuplink.raid_loot_bag b WHERE ${SRC("b")}) AS bags_from`,
    );
    expect(parseObjectRow({ reason: "ok", object_id: "boss:rbt_1" })).toEqual({
      ok: true,
      already: false,
      moved: { cells: [], object: { id: "boss:rbt_1", alive: true } },
    });
    expect(parseObjectRow({ reason: "target_leftovers", object: true })).toEqual({
      ok: false,
      reason: "target_leftovers",
      leftovers: ["object"],
    });
    expect(parseObjectRow({ reason: "ok", object_id: null })).toBeUndefined();
  });
});
