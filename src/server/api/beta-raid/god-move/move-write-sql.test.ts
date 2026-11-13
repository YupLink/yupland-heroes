// Перенос здания в режиме бога: что переезжает вместе с постройкой и что
// остаётся на земле. Каждая таблица — своим подзапросом, подвешенным к go
// (сама подвеска — move-sql.test.ts). Базы нет — читаем текст операторов.
import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/db/mcpClient", () => ({ mcpExec: vi.fn() }));

import { TRADE_MOVES } from "@/server/api/beta-raid/god-move/move-write-sql";
import {
  DST,
  SRC,
  cte,
  sql,
  writtenTables,
} from "@/server/api/beta-raid/god-move/move-sql.fixture";

describe("перенос здания: что переезжает", () => {
  it("клетки: постройка, облик и конфиг уходят с прежней и встают на новую — и только они", () => {
    const cells = cte("cells");
    expect(cells).toContain(
      "SET building_id = s.building_id, building_skin_id = s.building_skin_id, " +
        "building_config = s.building_config, saved_at = now()",
    );
    // Новая берёт у прежней, прежняя — пустые слои (источника нет).
    expect(cells).toContain(
      "FROM (VALUES (7, 1, 4, -2), (4, -2, NULL::int, NULL::int)) AS m(q, r, sq, sr)",
    );
    expect(cells).toContain("LEFT JOIN src s ON s.q = m.sq AND s.r = m.sr CROSS JOIN go");
    expect(cells).toContain("WHERE c.map_id = 'rmap_x' AND c.q = m.q AND c.r = m.r");
    for (const col of ["terrain_id", "road_id", "decoration_id =", "object_id", "void_fog"])
      expect(cells).not.toContain(col);
    for (const col of ["group_id =", "icon_scale =", "darai"]) expect(cells).not.toContain(col);
    expect(cte("src")).toContain("(c.q, c.r) IN ((4, -2))");
  });

  it("тир: на цель — тир переезжающей, прежний снят; сирота цели — только если тира нет", () => {
    expect(cte("tier_up")).toContain(
      `SELECT s.map_id, 7, 1, s.tier, s.updated_at, s.updated_by FROM yuplink.beta_raid_building_state s, go WHERE ${SRC("s")} ON CONFLICT (map_id, q, r) DO UPDATE SET tier = EXCLUDED.tier`,
    );
    expect(cte("tier_up")).toContain("RETURNING b.tier");
    expect(cte("tier_del")).toContain(
      `WHERE (${SRC("b")}) OR (${DST("b")} AND NOT EXISTS (SELECT 1 FROM yuplink.beta_raid_building_state s WHERE ${SRC("s")}))`,
    );
  });

  it("отметки вышек и деревьев: такая же на цели — лишнюю снять, иначе перевезти", () => {
    const twin = `t.owner = u.owner AND t.kind = u.kind`;
    expect(cte("use_dup")).toContain(`WHERE ${SRC("u")} AND EXISTS`);
    expect(cte("use_dup")).toContain(twin);
    expect(cte("use_mv")).toContain(`SET q = 7, r = 1 FROM go WHERE ${SRC("u")} AND NOT EXISTS`);
    expect(cte("use_mv")).toContain(twin);
  });

  it("лавка едет сама, лавки переезжающей ратуши — перепривязываются, одним UPDATE", () => {
    const shops = cte("shops");
    expect(shops).toContain("SET q = CASE WHEN s.q = 4 AND s.r = -2 THEN 7 ELSE s.q END");
    expect(shops).toContain(
      "town_q = CASE WHEN s.town_q = 4 AND s.town_r = -2 THEN 7 ELSE s.town_q END",
    );
    expect(shops).toContain(
      "WHERE s.map_id = 'rmap_x' AND ((s.q = 4 AND s.r = -2) OR (s.town_q = 4 AND s.town_r = -2))",
    );
  });

  it("остальные таблицы постройки переезжают целиком", () => {
    const tables: Record<string, string> = {
      items: "raid_market_item",
      towns: "raid_town",
      stock: "raid_town_stock",
      wh: "raid_warehouse_slot",
      workers: "raid_field_worker",
      mines: "raid_mine_state",
      guard: "raid_mine_guard",
      mine_log: "raid_mine_capture_log",
      ward: "raid_mine_ward",
      cash: "raid_town_cash",
      cash_log: "raid_town_cash_move",
      swaps: "hero_swap_log",
      trades: "trade_journal",
      rites: "raid_hero_rite",
      spells: "raid_enchant_spell",
    };
    for (const [name, table] of Object.entries(tables))
      expect(cte(name), name).toContain(
        `UPDATE yuplink.${table} x SET q = 7, r = 1 FROM go WHERE ${SRC("x")}`,
      );
  });

  it("обряды и заклинания: свои едут, забытые на цели — снимаются, только если едут свои", () => {
    for (const [name, table] of [
      ["rites", "raid_hero_rite"],
      ["spells", "raid_enchant_spell"],
    ])
      expect(cte(`${name}_drop`), name).toContain(
        `DELETE FROM yuplink.${table} x USING go WHERE ${DST("x")} AND EXISTS (SELECT 1 FROM yuplink.${table} s WHERE ${SRC("s")})`,
      );
  });

  it("журнал склада города: ключи суточного тика — на новую клетку", () => {
    expect(cte("stock_log")).toContain(
      "ref = CASE WHEN x.ref LIKE 'tick:%' THEN replace(x.ref, ':rmap_x:4,-2:', ':rmap_x:7,1:') ELSE x.ref END",
    );
  });

  it("охрана при магическом сундуке — его, остаётся на месте", () => {
    expect(cte("guard")).toContain(
      `AND NOT EXISTS (SELECT 1 FROM yuplink.raid_magic_chest mc WHERE ${SRC("mc")})`,
    );
  });

  it("сделки — только самой постройки; сундуки, мешочки и рынок фишек — нет", () => {
    expect(cte("trades")).toContain(
      "x.source IN ('market', 'market_sell', 'town', 'wh_take', 'wh_put', 'gate', 'portal', 'tour', 'field')",
    );
    for (const s of ["chest", "chest_plunder", "loot_bag", "plain_chest", "chip_market"] as const)
      expect(TRADE_MOVES[s]).toBe(false);
  });

  it("срубленный декор под ушедшим зданием отрастёт: в снимке клетки постройки больше нет", () => {
    const keep = cte("regrow_keep");
    expect(keep).toContain(
      `UPDATE yuplink.raid_decor_respawn d SET building_id = NULL FROM go, yuplink.raid_map_cells sc WHERE ${SRC("d")} AND d.placed_at IS NULL AND ${SRC("sc")} AND NOT (sc.terrain_id IS NULL OR sc.decoration_id IS NOT NULL`,
    );
    // Возврат, который сборщик уже снял бы, уход дома не оживляет — снимается.
    expect(cte("regrow_drop")).toContain(
      `DELETE FROM yuplink.raid_decor_respawn d USING go, yuplink.raid_map_cells sc WHERE ${SRC("d")} AND d.placed_at IS NULL AND ${SRC("sc")} AND (sc.terrain_id IS NULL`,
    );
    for (const col of ["road_id", "building_id", "group_id"])
      expect(keep).toContain(`sc.${col} IS DISTINCT FROM d.${col}`);
    expect(keep).toContain(
      "(sc.object_id IS NOT NULL AND sc.object_id IS DISTINCT FROM d.object_id)",
    );
  });
});

describe("перенос здания: что остаётся на земле", () => {
  it("сундуки, мешочки, ямка, объекты, беглецы, корабли, игроки, туман и входы не трогаются", () => {
    const written = writtenTables(sql);
    const ground = [
      "raid_magic_chest",
      "raid_plain_chest",
      "raid_plain_chest_slot",
      "raid_loot_bag",
      "raid_loot_bag_item",
      "raid_dig_hole",
      "raid_chest_plunder",
      "raid_open_pass",
      "beta_raid_object_hp",
      "beta_raid_runner",
      "beta_raid_ship",
      "beta_raid_positions",
      "beta_raid_fog_seen",
    ];
    for (const t of ground) expect(written.has(t), t).toBe(false);
  });
});
