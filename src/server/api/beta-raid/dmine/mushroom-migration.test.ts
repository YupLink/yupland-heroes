// Миграции грибов DARAI (владелец, 22.10.2026) против правил — по тексту SQL:
//  mushroom-01 — жизнь 7 суток от выката, 10 000/ч, подъём 5, один облик,
//    гриб — одна клетка, стопка dmine:darai, «Забрать» с жизнью и стопкой,
//    конец жизни (часы хозяину, клетка пуста), «карта перестроена»;
//  mushroom-02 — раскидка 10 грибов без хозяина: годные клетки, кольцо
//    проходимых соседей, не вплотную, ключ партии, «карта перестроена».
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const read = (name: string) =>
  readFileSync(
    fileURLToPath(new URL(`../../../../../migrations/${name}`, import.meta.url)),
    "utf8",
  );
const flatOf = (sql: string) => sql.replace(/--[^\n]*/g, "").replace(/\s+/g, " ");
const one = read("mushroom-01-darai-mushroom.sql");
const two = read("mushroom-02-scatter.sql");
const m1 = flatOf(one);
const m2 = flatOf(two);
const fnOf = (name: string) => {
  const from = m1.indexOf(`CREATE OR REPLACE FUNCTION yuplink.${name}(`);
  expect(from, name).toBeGreaterThan(0);
  return m1.slice(from, m1.indexOf("END $fn$;", from));
};

describe("mushroom-01: грибы из DARAI-шахт", () => {
  it("одной транзакцией (проба — COMMIT→ROLLBACK), столбцы и индексы — IF NOT EXISTS", () => {
    expect(m1.trimStart().startsWith("BEGIN;")).toBe(true);
    expect(one.trimEnd().endsWith("COMMIT;")).toBe(true);
    expect(m1).toContain("ADD COLUMN IF NOT EXISTS hero_id text;");
    expect(m1).toContain("ADD COLUMN IF NOT EXISTS dies_at timestamptz;");
    expect(m1).toContain("CHECK (state IN ('item', 'placed', 'gone'))");
    expect(m1).toContain("ON yuplink.raid_map_cells (map_id) WHERE building_config ? 'diesAt';");
  });

  it("жизнь 7 суток от выката, 10 000 в час, подъём 5 — только тем, у кого жизни ещё нет", () => {
    expect(m1).toContain(
      "jsonb_build_object('yield', 10000, 'captureCost', 5, 'diesAt', now() + interval '7 days')",
    );
    expect(m1.match(/AND NOT \(cc\.building_config \? 'diesAt'\)/g)).toHaveLength(1);
    expect(m1).toContain(
      "dies_at = now() + interval '7 days' WHERE d.state = 'item' AND d.dies_at IS NULL;",
    );
    // Хозяину — целые часы от начала отрезка до конца жизни.
    expect(m1).toContain(
      "jsonb_build_object('maxHours', GREATEST(0, floor( extract(epoch FROM (now() + interval '7 days' - x.since)) / 3600))::int)",
    );
    // Никаких выплат миграцией: накопленное хозяин собирает сам.
    expect(m1).not.toMatch(/SELECT yuplink\.raid_mine_claim\(s\.map_id/);
  });

  it("один облик «Гриб DARAI»; прежние bskin_dm_* — только когда ни на что не ссылаются", () => {
    expect(m1).toContain(
      "VALUES ('bskin_dm_mushroom', 'bgrp_dmineDarai', 'Гриб DARAI', '/uploads/tasks/dmine-darai-mushroom.webp')",
    );
    expect(m1).toContain(
      "AND NOT EXISTS (SELECT 1 FROM yuplink.raid_map_cells c WHERE c.building_skin_id = s.id);",
    );
  });

  it("гриб — одна клетка: блоки под грибами распущены", () => {
    expect(m1).toContain(
      "SET group_id = NULL, icon_scale = NULL, saved_at = now() WHERE (m.map_id, m.group_id) IN (SELECT c.map_id, c.group_id FROM yuplink.raid_map_cells c WHERE c.building_config ? 'diesAt' AND c.group_id IS NOT NULL);",
    );
  });

  it("свёртка стопок: под локом рюкзака, удалённая строка — один раз, герой у гриба", () => {
    const f = fnOf("raid_mushroom_fold");
    expect(f).toContain("PERFORM pg_advisory_xact_lock(hashtext('bp:' || r.hero_id));");
    expect(f).toContain(
      "DELETE FROM yuplink.raid_hero_backpack WHERE id = r.id; IF NOT FOUND THEN CONTINUE;",
    );
    expect(f).toContain(
      "SET hero_id = r.hero_id WHERE id = substr(r.stack_key, 7) AND state = 'item';",
    );
    expect(f).toContain(
      "ON CONFLICT (hero_id, stack_key) DO UPDATE SET count = yuplink.raid_hero_backpack.count + EXCLUDED.count",
    );
    expect(m1).toContain("SELECT yuplink.raid_mushroom_fold();");
  });

  it("«Забрать»: подпись прежняя; жизнь вышла — гриба нет; место — как у стопки; всё до энергии", () => {
    const f = fnOf("raid_dmine_take");
    expect(f).toContain(
      "raid_dmine_take( p_op text, p_map text, p_q integer, p_r integer, p_account text, p_wallet text, p_hero text, p_capacity numeric, p_cell numeric, p_cost numeric, p_name text)",
    );
    const energy = f.indexOf("PERFORM yuplink.touch_energy_atomic(p_wallet, p_cost)");
    expect(
      f.indexOf("IF v_dies IS NOT NULL AND v_dies <= now() THEN RAISE EXCEPTION 'dmine_gone'"),
    ).toBeLessThan(energy);
    expect(f.indexOf("RAISE EXCEPTION 'dmine_own'")).toBeLessThan(energy);
    expect(f.indexOf("RAISE EXCEPTION 'dmine_once'")).toBeLessThan(energy);
    expect(f).toContain("v_grow := ceil((v_cur + 1) / p_cell) - ceil(v_cur / p_cell);");
    expect(f).toContain("IF v_grow > 0 AND v_items + v_grow > GREATEST(p_capacity, v_items) THEN");
    expect(f.indexOf("RAISE EXCEPTION 'dmine_room:%'")).toBeLessThan(energy);
    expect(f).toContain(
      "'dmine:darai', p_name, c.image, 1) ON CONFLICT (hero_id, stack_key) DO UPDATE SET count = yuplink.raid_hero_backpack.count + 1",
    );
    expect(f).toContain("v_last.id, v_block, p_hero, v_dies);");
    // Вечных грибов нет: клетка без срока — 7 суток с подъёма; срок и в настройке.
    expect(f).toContain("v_dies := COALESCE(v_dies, now() + interval '7 days');");
    expect(f).toContain("(c.building_config - 'maxHours') || jsonb_build_object('diesAt', v_dies)");
  });

  it("конец жизни на карте: под локами, срок перепроверен, часы хозяину, клетка пуста", () => {
    const f = fnOf("raid_mushroom_expire_cell");
    expect(f).toContain(
      "PERFORM pg_advisory_xact_lock(hashtext('mine:' || p_map || ':' || p_q || ':' || p_r));",
    );
    expect(f).toContain("OR (c.building_config->>'diesAt')::timestamptz > now() THEN RETURN NULL;");
    expect(f).toContain(
      "v_paid := COALESCE(yuplink.raid_mine_claim(p_map, p_q, p_r, v_owner), 0);",
    );
    expect(f).toContain(
      "SET building_id = NULL, building_config = NULL, building_skin_id = NULL, saved_at = now()",
    );
    expect(f).toContain("SET state = 'gone', lifted_at = now()");
  });

  it("конец жизни в рюкзаке: лок рюкзака раньше строки гриба, минус штука, повтор — false", () => {
    const f = fnOf("raid_mushroom_expire_item");
    expect(f.indexOf("pg_advisory_xact_lock(hashtext('bp:' || v_hero))")).toBeLessThan(
      f.indexOf("UPDATE yuplink.raid_dmine SET state = 'gone'"),
    );
    expect(f).toContain(
      "WHERE id = p_id AND state = 'item' AND dies_at <= now(); IF NOT FOUND THEN RETURN false;",
    );
    expect(f).toContain(
      "SET count = count - 1, updated_at = now() WHERE hero_id = v_hero AND stack_key = 'dmine:darai' AND count > 1;",
    );
  });

  it('«карта перестроена»: версия, журнал {"full":true} и pg_notify', () => {
    expect(m1).toContain(
      "SET revision = COALESCE(revision, 0) + 1, edit_seq = COALESCE(edit_seq, 0) + 1",
    );
    expect(m1).toContain("VALUES (m, v_rev, '{\"full\":true}'::jsonb)");
    expect(m1).toContain(
      "PERFORM pg_notify('raid_live', json_build_object( 'w', 'mushroom-01', 'e', json_build_object('type', 'map', 'mapId', m, 'rev', v_rev, 'full', true))::text);",
    );
  });
});

describe("mushroom-02: раскидка грибов", () => {
  it("10 грибов на «Мире Альфа», ключ партии — повтор ничего не добавляет", () => {
    expect(m2.trimStart().startsWith("BEGIN;")).toBe(true);
    expect(two.trimEnd().endsWith("COMMIT;")).toBe(true);
    expect(m2).toContain("v_map text := 'rmap_UthOURxc';");
    expect(m2).toContain("v_need integer := 10;");
    expect(m2).toContain(
      "VALUES ('mushroom_scatter:20261022', '{\"state\":\"started\"}') ON CONFLICT (key) DO NOTHING; IF NOT FOUND THEN",
    );
  });

  it("без хозяина: ни строки владения, ни охраны — только клетка с жизнью 7 суток", () => {
    expect(m2).toContain(
      "building_config = jsonb_build_object('resource', 'token', 'token', 'Darai', 'yield', 10000, 'captureCost', 5, 'diesAt', v_dies)",
    );
    expect(m2).toContain("v_dies timestamptz := now() + interval '7 days';");
    expect(m2).toContain("building_skin_id = 'bskin_dm_mushroom'");
    expect(m2).not.toContain("INSERT INTO yuplink.raid_mine_state");
  });

  it("клетка: суша без дороги, построек, объектов, декора, следов; не под туманом", () => {
    for (const part of [
      "NOT (t.name ~* '(вод|water|море|океан|ocean|river|река)')",
      "NOT COALESCE(x.void_fog, false)",
      "NULLIF(btrim(COALESCE(x.road_id, '')), '') IS NULL",
      "x.building_id IS NULL AND x.group_id IS NULL AND x.object_id IS NULL AND x.decoration_id IS NULL",
      "FROM yuplink.raid_mine_state o",
      "FROM yuplink.raid_loot_bag o",
      "FROM yuplink.raid_map_vein o",
      "FROM yuplink.beta_raid_positions o",
      "FROM yuplink.raid_dig_hole o",
    ])
      expect(m2).toContain(part);
  });

  it("все шесть соседей проходимы — гриб не перекроет проход; не вплотную друг к другу", () => {
    expect(m2).toContain(
      "(n.q, n.r) IN ((x.q + 1, x.r), (x.q + 1, x.r - 1), (x.q, x.r - 1), (x.q - 1, x.r), (x.q - 1, x.r + 1), (x.q, x.r + 1))",
    );
    expect(m2).toMatch(/AND d\.placed_at IS NULL\)\) = 6/);
    expect(m2).toContain(
      "WHERE abs(p.q - c.q) + abs(p.r - c.r) + abs((p.q + p.r) - (c.q + c.r)) <= 2);",
    );
    expect(m2).toContain("ORDER BY md5(x.q || ',' || x.r || ':mushroom-20261022')");
  });

  it("после — «карта перестроена» у всех", () => {
    expect(m2).toContain("VALUES (v_map, v_rev, '{\"full\":true}'::jsonb)");
    expect(m2).toContain(
      "'e', json_build_object('type', 'map', 'mapId', v_map, 'rev', v_rev, 'full', true)",
    );
  });
});
