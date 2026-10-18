// Перенос мешочков клетки (режим бога): едут разом все, что видел админ (и
// бугорки); упавший после открытия окна остаётся — повтор не увезёт невиданное.
// Порции и ключи нажатий — по id мешочка, едут сами; входы «Открыть» гаснут.
// Цель: земля, не вода, не купол, без декора и живого объекта. Базы нет — текст.
import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/db/mcpClient", () => ({ mcpExec: vi.fn() }));

import {
  BAGS_WRITE_NAMES,
  moveBagsSql,
  parseBagsRow,
} from "@/server/api/beta-raid/god-move/move-bags-sql";
import {
  DST,
  SRC,
  WRITE_RE,
  cteOf,
  flat,
  writtenTables,
} from "@/server/api/beta-raid/god-move/move-sql.fixture";

const o = { mapId: "rmap_x", from: { q: 4, r: -2 }, to: { q: 7, r: 1 }, ids: ["lb_a", "lb_b"] };
const sql = flat(moveBagsSql(o));
const cte = (n: string) => cteOf(sql, n);
const SEEN = "b.id IN ('lb_a', 'lb_b')";

describe("перенос мешочков", () => {
  it("локи как у выброса: клетки по порядку, затем виденные мешочки по id; строки — FOR UPDATE", () => {
    expect(
      sql.startsWith(
        "SELECT pg_advisory_xact_lock(hashtext('godmove:rmap_x')) AS l; " +
          "SELECT pg_advisory_xact_lock(hashtext('lootdrop:rmap_x:4:-2')) AS l; " +
          "SELECT pg_advisory_xact_lock(hashtext('lootdrop:rmap_x:7:1')) AS l; " +
          "SELECT pg_advisory_xact_lock(hashtext('lootbag:' || s.id)) AS l FROM (SELECT b.id FROM yuplink.raid_loot_bag b " +
          `WHERE ${SRC("b")} AND ${SEEN} ORDER BY b.id) s; ` +
          `SELECT 1 FROM yuplink.raid_loot_bag b WHERE ${SRC("b")} AND ${SEEN} ORDER BY b.id FOR UPDATE; ` +
          "SELECT 1 FROM yuplink.raid_map_cells c",
      ),
    ).toBe(true);
  });

  it("решение: виденных нет — повтор (на цели), другие мешочки (changed) или ушли; цель — по порядку", () => {
    const chk = cte("chk");
    expect(chk).toContain(
      `WHEN NOT EXISTS (SELECT 1 FROM yuplink.raid_loot_bag b WHERE ${SRC("b")} AND ${SEEN})`,
    );
    expect(chk).toContain(
      `CASE WHEN EXISTS (SELECT 1 FROM yuplink.raid_loot_bag b WHERE ${DST("b")} AND ${SEEN}) THEN 'already'`,
    );
    expect(chk).toContain(
      `WHEN EXISTS (SELECT 1 FROM yuplink.raid_loot_bag b WHERE ${SRC("b")}) THEN 'changed' ELSE 'gone' END`,
    );
    const order = [
      "'target_missing'",
      "'target_water'",
      "'target_dome'",
      "'target_object'",
      "'target_decor'",
      "ELSE 'ok'",
    ];
    const pos = order.map((s) => chk.lastIndexOf(s));
    expect(pos.every((p) => p >= 0)).toBe(true);
    expect([...pos].sort((a, b) => a - b)).toEqual(pos);
    expect(chk).toContain(
      "WHEN EXISTS (SELECT 1 FROM dst WHERE dst.decoration_id IS NOT NULL) THEN 'target_decor'",
    );
    // Постройка, сундук и другие мешочки на цели — не помеха.
    expect(chk).not.toContain("target_building");
    expect(chk).not.toContain("target_chest");
  });

  it("едут виденные мешочки клетки; входы в них гаснут; порции и ключи не трогаются", () => {
    expect(cte("bags")).toBe(
      `UPDATE yuplink.raid_loot_bag b SET q = 7, r = 1 FROM go WHERE ${SRC("b")} AND ${SEEN} RETURNING b.id`,
    );
    expect(cte("pass")).toContain("FROM bags x WHERE p.target = 'lb:' || x.id AND p.until > now()");
    expect([...writtenTables(sql)].sort()).toEqual(["raid_loot_bag", "raid_open_pass"]);
    expect([...sql.matchAll(WRITE_RE)].length).toBe(BAGS_WRITE_NAMES.length);
  });

  it("ничего не видел — ничего не везёт и повтор не признаётся; ответ разбирается", () => {
    const none = flat(moveBagsSql({ ...o, ids: [] }));
    expect(none).toContain("b.id IN (NULL)");
    expect(cteOf(none, "bags")).toContain("AND b.id IN (NULL)");
    expect(parseBagsRow({ reason: "ok", bags: 2 })).toMatchObject({ ok: true, already: false });
    expect(parseBagsRow({ reason: "changed" })).toMatchObject({ ok: false, reason: "changed" });
    expect(parseBagsRow({ reason: "target_decor" })).toMatchObject({
      ok: false,
      reason: "target_decor",
    });
  });
});
