// Перенос здания и декора в режиме бога — один оператор под локами: решение и
// перенос на одном снимке, каждая запись подвешена к строке «можно» (go), и
// отказ поэтому всегда раньше любых изменений. Здесь — локи, решение и ответ
// одиночного здания; что едет — move-write-sql.test.ts, блок —
// move-block-sql.test.ts. Базы нет — читаем текст.
import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/db/mcpClient", () => ({ mcpExec: vi.fn() }));

import {
  moveUnitSql,
  parseUnitRow,
  unitWriteNames,
  type UnitRow,
} from "@/server/api/beta-raid/god-move/move-sql";
import { movedCounts } from "@/server/api/beta-raid/god-move/move-row";
import { GOD_MOVE_REASONS } from "@/lib/godMove";
import {
  DST,
  SRC,
  WRITE_RE,
  at,
  cte,
  flat,
  sql,
} from "@/server/api/beta-raid/god-move/move-sql.fixture";

describe("перенос здания: локи и решение до записи", () => {
  it("локи — отдельными операторами до чтения, строки клеток и склада города — FOR UPDATE", () => {
    expect(
      sql.startsWith(
        "SELECT pg_advisory_xact_lock(hashtext('godmove:rmap_x')) AS l; " +
          "SELECT pg_advisory_xact_lock(hashtext('decor-respawn')) AS l; " +
          "SELECT pg_advisory_xact_lock(hashtext('mine:rmap_x:4:-2')) AS l; " +
          "SELECT pg_advisory_xact_lock(hashtext('mine:rmap_x:7:1')) AS l; " +
          "SELECT pg_advisory_xact_lock(hashtext('field:rmap_x:4:-2')) AS l; " +
          "SELECT pg_advisory_xact_lock(hashtext('field:rmap_x:7:1')) AS l; " +
          "SELECT pg_advisory_xact_lock(hashtext('chestcell:rmap_x:7:1')) AS l; " +
          "SELECT 1 FROM yuplink.raid_map_cells c WHERE c.map_id = 'rmap_x' " +
          "AND (c.q, c.r) IN ((4, -2), (7, 1)) ORDER BY c.q, c.r FOR UPDATE; " +
          "SELECT 1 FROM yuplink.raid_town_stock x WHERE x.map_id = 'rmap_x' AND x.q = 4 AND x.r = -2 " +
          "ORDER BY x.good_id FOR UPDATE; WITH lead AS",
      ),
    ).toBe(true);
  });

  it("каждая запись подвешена к go, а go — только к «ok» решения", () => {
    expect(cte("go")).toBe("SELECT 1 AS ok FROM chk WHERE chk.reason = 'ok'");
    for (const name of unitWriteNames(at)) {
      expect(cte(name), name).toMatch(/\b(?:FROM|USING)\s[^;]*\bgo\b/);
    }
    // Других записей в запросе нет: ни в локах, ни в решении.
    expect([...sql.matchAll(WRITE_RE)].length).toBe(unitWriteNames(at).length);
  });

  it("отказы по порядку: сначала здание, потом целевая клетка", () => {
    const chk = cte("chk");
    const order = [
      "'already'",
      "'gone'",
      "'changed'",
      "THEN 'changed'",
      "'chest_guard'",
      "'target_missing'",
      "'target_block'",
      "'target_water'",
      "'target_dome'",
      "'target_building'",
      "'target_object'",
      "'target_chest'",
      "'target_guard'",
      "'target_decor'",
      "'target_ship'",
      "'target_leftovers'",
      "ELSE 'ok'",
    ];
    const pos = order.map((s, i) => (i === 3 ? chk.lastIndexOf(s) : chk.indexOf(s)));
    expect(pos.every((p) => p >= 0)).toBe(true);
    expect([...pos].sort((a, b) => a - b)).toEqual(pos);
  });

  it("одиночное здание: беглец и игрок на цели не мешают, проходной декор — тоже", () => {
    const chk = cte("chk");
    expect(chk).not.toContain("target_runner");
    expect(chk).not.toContain("target_player");
    expect(chk).not.toContain("fx.any_decor");
    expect(chk).toContain("WHEN (SELECT ex.decor FROM ex) THEN 'target_decor'");
  });

  it("одиночное здание: мешочки под ним не помеха (декор не едет)", () => {
    expect(cte("bd")).toBe("SELECT NULL::boolean AS bag");
  });

  it("причины из SQL окно знает", () => {
    const said = [...cte("chk").matchAll(/THEN '(\w+)'|ELSE '(\w+)'/g)]
      .map((m) => m[1] ?? m[2])
      .filter((r) => r !== "ok" && r !== "already");
    for (const r of said) expect(GOD_MOVE_REASONS).toContain(r);
  });

  it("здание: та самая постройка, состав клетки тот же; сундук с охраной — отказ", () => {
    const chk = cte("chk");
    expect(chk).toContain("WHEN NOT EXISTS (SELECT 1 FROM lead WHERE lead.building_id = 'bld_1')");
    expect(chk).toContain("WHEN EXISTS (SELECT 1 FROM drift) THEN 'changed'");
    expect(chk).toContain(
      `EXISTS (SELECT 1 FROM yuplink.raid_magic_chest x WHERE ${SRC("x")}) AND ` +
        `EXISTS (SELECT 1 FROM yuplink.raid_mine_guard x WHERE ${SRC("x")}) THEN 'chest_guard'`,
    );
    // Вне блока клетка обязана остаться вне блока — и с постройкой.
    const drift = cte("drift");
    expect(drift).toContain("c.q = 4 AND c.r = -2 AND c.group_id IS NULL");
    expect(drift).toContain("(VALUES (4, -2, true, false))");
    expect(drift).toContain("u.b <> p.b");
    expect(drift).not.toContain("u.d <> p.d");
  });

  it("повтор: на прежней клетке пусто, на цели та же постройка — already", () => {
    expect(cte("chk")).toContain(
      "CASE WHEN EXISTS (SELECT 1 FROM goal WHERE goal.building_id = 'bld_1') THEN 'already' ELSE 'gone' END",
    );
    expect(cte("goal")).toContain(DST("c"));
  });

  it("цель — «клетку держит» сундука (CELL_HELD) плюс земля, блок и остатки", () => {
    expect(cte("f")).toContain(`raid_plain_chest pc WHERE ${DST("pc")}`);
    expect(cte("f")).toContain("bool_or(x.water) AS water");
    expect(cte("ex")).toContain(`beta_raid_ship s WHERE ${DST("s")}`);
    expect(cte("ground")).toContain("(VALUES (7, 1)) AS p(q, r)");
    expect(cte("fx")).toContain("(c.q, c.r) IN ((7, 1))");
    const lo = cte("lo");
    const kept = ["raid_market_shop", "raid_market_item", "raid_town", "raid_town_stock"];
    kept.push("raid_warehouse_slot", "raid_field_worker", "raid_mine_state", "raid_mine_guard");
    for (const t of kept) expect(lo).toContain(`yuplink.${t} x WHERE ${DST("x")}`);
    expect(lo).toContain("x.map_id = 'rmap_x' AND x.town_q = 7 AND x.town_r = 1");
  });

  it("строки в кавычках экранируются", () => {
    const odd = flat(moveUnitSql({ ...at, ref: "b'1", mapId: "m'1" }));
    expect(odd).toContain("goal.building_id = 'b''1'");
    expect(odd).toContain("hashtext('godmove:m''1')");
  });
});

describe("перенос здания: ответ", () => {
  const base: UnitRow = {
    reason: "ok",
    moved: [
      { q: 4, r: -2, b: null, s: null, d: null, g: null, k: null },
      { q: 7, r: 1, b: "bld_1", s: "sk1", d: "dec_x", g: null, k: null },
    ],
    tier: 2,
  };

  it("ok — клетки как стали, тир — у клетки с постройкой", () => {
    expect(parseUnitRow(base)).toEqual({
      ok: true,
      already: false,
      moved: {
        object: null,
        cells: [
          {
            q: 4,
            r: -2,
            buildingId: null,
            skinId: null,
            tier: 0,
            decorationId: null,
            groupId: null,
            iconScale: null,
          },
          {
            q: 7,
            r: 1,
            buildingId: "bld_1",
            skinId: "sk1",
            tier: 2,
            decorationId: "dec_x",
            groupId: null,
            iconScale: null,
          },
        ],
      },
    });
  });

  it("повтор — «уже там» без клеток; отказ — причина и остатки; непонятное — undefined", () => {
    expect(parseUnitRow({ reason: "already", moved: null, tier: null })).toEqual({
      ok: true,
      already: true,
      moved: { object: null, cells: [] },
    });
    expect(parseUnitRow({ reason: "target_leftovers", warehouse: true, mine: true })).toEqual({
      ok: false,
      reason: "target_leftovers",
      leftovers: ["warehouse", "mine"],
    });
    expect(parseUnitRow({ reason: "bogus" })).toBeUndefined();
    expect(parseUnitRow(undefined)).toBeUndefined();
  });

  it("ключи ответа не совпадают с именами записей", () => {
    const keys = ["reason", "market", "town", "warehouse", "field", "mine", "moved", "tier"];
    for (const k of keys) expect(unitWriteNames(at)).not.toContain(k);
  });

  it("журнал сервера — только переехавшее", () => {
    expect(movedCounts({ cells: 2, wh: "23", trades: 0 }, unitWriteNames(at))).toEqual({
      cells: 2,
      wh: 23,
    });
  });
});
