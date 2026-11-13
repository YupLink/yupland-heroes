// Миграция minebag-02 (владелец, 22.10.2026): «Забрать в рюкзак» — хозяин
// свою не поднимает, одно поднятие до размещения, блок клеток берётся целиком;
// охрана с DARAI-шахт — хозяевам подарком «босс» без срока, повтор не задваивает.
// Текст SQL против правил: отказы — до энергии, подарок — только снятой живой
// охране, тем же оператором, что снимает.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { takeDmineSql } from "./dmine-take-sql";

vi.mock("@/server/db/mcpClient", () => ({ mcpExec: vi.fn() }));
const { dmineLastTakerSql } = await import("./dmine-last-taker");

const sql = readFileSync(
  fileURLToPath(new URL("../../../../../migrations/minebag-02-dmine-no-bag.sql", import.meta.url)),
  "utf8",
);
const flat = sql.replace(/--[^\n]*/g, "").replace(/\s+/g, " ");
const fn = flat.slice(flat.indexOf("CREATE OR REPLACE FUNCTION"), flat.indexOf("END $fn$;"));
const at = (s: string): number => {
  const i = fn.indexOf(s);
  expect(i, s).toBeGreaterThan(0);
  return i;
};

describe("миграция minebag-02", () => {
  it("одной транзакцией, столбцы — IF NOT EXISTS, индекс «шахта на клетке»", () => {
    expect(flat.startsWith(" BEGIN;") || flat.startsWith("BEGIN;")).toBe(true);
    expect(sql.trimEnd().endsWith("COMMIT;")).toBe(true);
    for (const col of ["taken_wallet text", "prev_id text", "lifted_at timestamptz", "block jsonb"])
      expect(flat).toContain(`ALTER TABLE yuplink.raid_dmine ADD COLUMN IF NOT EXISTS ${col};`);
    expect(flat).toContain(
      "CREATE INDEX IF NOT EXISTS raid_dmine_here ON yuplink.raid_dmine (placed_map, placed_q, placed_r) WHERE state = 'placed' AND lifted_at IS NULL;",
    );
  });

  it("подпись функции — та же, что зовёт ручка (11 параметров)", () => {
    expect(fn).toContain(
      "yuplink.raid_dmine_take( p_op text, p_map text, p_q integer, p_r integer, p_account text, p_wallet text, p_hero text, p_capacity numeric, p_cell numeric, p_cost numeric, p_name text)",
    );
    const call = takeDmineSql({
      op: "o",
      mapId: "m",
      q: 1,
      r: 2,
      account: "a",
      wallet: "w",
      heroId: "h",
      capacity: 8,
      cost: 5,
    });
    expect(call.match(/,/g)).toHaveLength(10);
  });

  it("хозяин свою не поднимает, поднявший — второй раз до чужого размещения; всё до энергии", () => {
    const energy = at("PERFORM yuplink.touch_energy_atomic(p_wallet, p_cost)");
    expect(at("IF v_owner = p_account THEN RAISE EXCEPTION 'dmine_own'")).toBeLessThan(energy);
    expect(
      at("IF FOUND AND v_last.taken_by = p_account THEN RAISE EXCEPTION 'dmine_once'"),
    ).toBeLessThan(energy);
    // «Эта шахта» — строка «на клетке» той же постройки, последняя по размещению.
    expect(fn).toContain(
      "WHERE d.state = 'placed' AND d.lifted_at IS NULL AND d.placed_map = p_map AND d.placed_q = p_q AND d.placed_r = p_r AND d.building_id = c.building_id ORDER BY d.placed_at DESC NULLS LAST LIMIT 1",
    );
    expect(at("RAISE EXCEPTION 'dmine_guarded'")).toBeLessThan(energy);
    expect(at("RAISE EXCEPTION 'dmine_room:%'")).toBeLessThan(energy);
  });

  it("блок клеток — не отказ: берётся целиком, блок распущен, след — в строке шахты", () => {
    expect(fn).not.toContain("dmine_block");
    expect(fn).toContain(
      "UPDATE yuplink.raid_map_cells SET group_id = NULL, icon_scale = NULL, saved_at = now() WHERE map_id = p_map AND group_id = c.group_id;",
    );
    expect(fn).toContain("'cells', jsonb_agg(jsonb_build_array(m.q, m.r) ORDER BY m.r, m.q))");
    expect(fn).toContain("'block', v_block IS NOT NULL");
  });

  it("накопленное — прежнему хозяину (это всегда не я), строки клетки сняты, новая с цепочкой", () => {
    expect(fn).toContain(
      "IF v_owner IS NOT NULL THEN PERFORM yuplink.raid_mine_capture(p_map, p_q, p_r, p_account, p_wallet);",
    );
    expect(fn).not.toContain("raid_mine_claim");
    expect(fn).toContain(
      "UPDATE yuplink.raid_dmine SET lifted_at = now() WHERE state = 'placed' AND lifted_at IS NULL AND placed_map = p_map AND placed_q = p_q AND placed_r = p_r;",
    );
    expect(fn).toContain("p_account, p_wallet, now(), 'item', v_last.id, v_block);");
  });

  it("охрана DARAI-шахт: снятие и подарок «босс» без срока — одним оператором, только живой", () => {
    const tail = flat.slice(flat.indexOf("END $fn$;"));
    expect(tail).toContain(
      "WITH gone AS ( DELETE FROM yuplink.raid_mine_guard g USING yuplink.raid_map_cells c",
    );
    expect(tail).toContain(
      "AND COALESCE(c.building_config->>'resource', '') = 'token' AND lower(COALESCE(c.building_config->>'token', '')) = 'darai'",
    );
    expect(tail).toContain("(g.killed_at IS NULL AND g.current_hp > 0) AS alive");
    expect(tail).toContain("FROM gone x WHERE x.alive");
    expect(tail).toMatch(
      /'boss', 1, gift\.boss_template_id, gift\.name, gift\.image, 'dmine-guard:', 'pending', gift\.ref, 'dmine-guard', NULL FROM gift/,
    );
    // Повтор файла не задваивает: ключ — клетка и минута постановки охраны.
    expect(tail).toContain("'dmineguard:' || x.map_id || ':' || x.q || ':' || x.r || ':'");
    expect(tail).toContain("ON CONFLICT (source_ref) WHERE source_ref IS NOT NULL DO NOTHING;");
  });
});

describe("окно шахты: кто поднимал последним", () => {
  it("тот же выбор, что у функции базы: строка «на клетке» той же постройки, последняя", () => {
    const q = dmineLastTakerSql("rmap_1", 3, -2).replace(/\s+/g, " ");
    expect(q).toContain("c.building_id = d.building_id");
    expect(q).toContain(
      "WHERE d.state = 'placed' AND d.lifted_at IS NULL AND d.placed_map = 'rmap_1' AND d.placed_q = 3 AND d.placed_r = -2 ORDER BY d.placed_at DESC NULLS LAST LIMIT 1",
    );
  });
});
