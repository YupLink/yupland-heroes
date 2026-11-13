// Миграция dynamite-07 (30.10.2026): рыба красного в воду (p_fish → мешочки-рыбы на
// клетках воды взрыва) и «свой корабль синий не взрывает». Тело raid_dynamite_blast —
// dynamite-05 с этими правками: всё прежнее на месте и в том же порядке.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { WATER_SQL } from "@/server/api/beta-raid/cell-sql";
import { FISH_BAG_SOURCE, FISH_BOOT_KEY } from "@/lib/raid/dynamiteFish";

const raw = readFileSync("migrations/dynamite-07-fish-own-ship.sql", "utf8");
const sql = raw.replace(/\s+/g, " ");

/** Тело функции взрыва из файла миграции — построчно. */
function blastBody(text: string): string[] {
  const from = text.indexOf("CREATE OR REPLACE FUNCTION yuplink.raid_dynamite_blast(");
  const to = text.indexOf("END $fn$;", from);
  return text.slice(from, to).split("\n");
}

describe("миграция dynamite-07", () => {
  it("одна транзакция; функция из 11 аргументов снята, новая — с p_fish по умолчанию", () => {
    expect(sql).toMatch(/^-- .*BEGIN; SET LOCAL lock_timeout = '5s';.*COMMIT; $/);
    expect(sql).toContain(
      "DROP FUNCTION IF EXISTS yuplink.raid_dynamite_blast(text, text, integer, integer, text, text, text, text, numeric, jsonb, text);",
    );
    expect(sql).toContain(
      "p_decor jsonb, p_kind text DEFAULT 'red'::text, p_fish jsonb DEFAULT '[]'::jsonb)",
    );
    expect(sql.indexOf("DROP FUNCTION")).toBeLessThan(sql.indexOf("CREATE OR REPLACE FUNCTION"));
  });

  it("тело — dynamite-05: каждая прежняя строка на месте и в том же порядке", () => {
    const prev = blastBody(readFileSync("migrations/dynamite-05-ships.sql", "utf8"));
    const next = blastBody(raw);
    // Строки, которые правка меняет, — в их новом виде.
    const changed = new Map([
      [prev[0], next[0]],
      [
        "  -- 1б) Синий (§8.75а, владелец 26.10.2026): все корабли клетки — разрушены, как после",
        "  -- 1б) Синий (§8.75а, владелец 26.10.2026): корабли клетки — разрушены, как после",
      ],
      [
        "    'kind', p_kind, 'blue', v_blue, 'ships', v_ships);",
        "    'kind', p_kind, 'blue', v_blue, 'ships', v_ships, 'fish', v_fish);",
      ],
    ]);
    let at = 0;
    for (const line of prev) {
      const want = changed.get(line) ?? line;
      const found = next.indexOf(want, at);
      expect(found, want).toBeGreaterThanOrEqual(at);
      at = found + 1;
    }
  });

  it("синий: свой корабль (аккаунт или старый кошелёк) не трогает, ничьи и чужие — как были", () => {
    expect(sql).toContain(
      "WHERE s.map_id = p_map AND s.q = p_q AND s.r = p_r AND (s.owner IS NULL OR s.owner NOT IN (p_account, p_wallet)) ORDER BY s.id FOR UPDATE OF s",
    );
  });

  it("синий по клетке, где только свой корабль, — отказ dynamite_own_ship до денег", () => {
    const at = (s: string) => sql.indexOf(s);
    const refuse = at("RAISE EXCEPTION 'dynamite_own_ship';");
    expect(refuse).toBeGreaterThan(0);
    expect(refuse).toBeLessThan(at("PERFORM yuplink.energy_touch_acc(p_account, p_cost);"));
    expect(refuse).toBeLessThan(at("FROM yuplink.raid_hero_backpack b WHERE b.hero_id = p_hero"));
    expect(refuse).toBeGreaterThan(at("RAISE EXCEPTION 'dynamite_town'"));
    expect(sql).toContain(
      "IF p_kind = 'blue' AND EXISTS (SELECT 1 FROM yuplink.beta_raid_ship s WHERE s.map_id = p_map AND s.q = p_q AND s.r = p_r AND s.owner IN (p_account, p_wallet))",
    );
    // «Нечего задеть» — с запасом: чужой или ничей корабль, постройка, объект, беглец,
    // живая охрана, декор — и бросок идёт.
    expect(sql).toContain(
      "AND NOT EXISTS (SELECT 1 FROM yuplink.beta_raid_ship s WHERE s.map_id = p_map AND s.q = p_q AND s.r = p_r AND (s.owner IS NULL OR s.owner NOT IN (p_account, p_wallet)))",
    );
    expect(sql).toContain(
      "AND (oc.building_id IS NOT NULL OR oc.group_id IS NOT NULL OR oc.object_id IS NOT NULL OR oc.decoration_id IS NOT NULL))",
    );
    expect(sql).toContain("FROM yuplink.beta_raid_runner rn WHERE rn.map_id = p_map");
    expect(sql).toContain("AND g.killed_at IS NULL AND g.current_hp > 0) THEN");
  });

  it("рыба: только красный, только клетки взрыва, только вода — правило берега удочки", () => {
    expect(sql).toContain("WHERE p_kind = 'red' AND ((e->>'q')::integer, (e->>'r')::integer)");
    expect(sql).toContain("IN (SELECT t.q, t.r FROM unnest(v_bq, v_br) AS t(q, r))");
    expect(sql).toContain(`AND ${WATER_SQL}) THEN CONTINUE;`);
  });

  it("рыба — мешочек: id от ключа и клетки, источник рыбы, порции как у декора, итог 'fish'", () => {
    expect(sql).toContain(
      "v_bag := 'lb_' || md5('dynfish:' || p_op || ':' || r_f.q || ':' || r_f.r);",
    );
    expect(sql).toContain("PERFORM pg_advisory_xact_lock(hashtext('lootbag:' || v_bag));");
    expect(sql).toContain(
      `VALUES (v_bag, p_map, r_f.q, r_f.r, now(), p_account, '${FISH_BAG_SOURCE}', r_f.nm, now())`,
    );
    expect(sql).toContain("ON CONFLICT (bag_id, stack_key, expires_at) DO NOTHING;");
    expect(sql).toContain("jsonb_build_object('q', r_f.q, 'r', r_f.r, 'bag', v_bag)");
    expect(sql).toContain("'ships', v_ships, 'fish', v_fish);");
    expect(raw).toContain(`'${FISH_BOOT_KEY}'`);
  });

  it("рыба — после декора и до итога; ключ нажатия пишется с итогом, как раньше", () => {
    const at = (s: string) => sql.indexOf(s);
    expect(at("-- 4) Деревья и камни")).toBeLessThan(at("-- 5) Красный в воду"));
    expect(at("-- 5) Красный в воду")).toBeLessThan(at("v_res := jsonb_build_object("));
    expect(sql).toContain(
      "INSERT INTO yuplink.raid_dynamite_op (op, account_id, map_id, q, r, detail, crew_due) VALUES (p_op, p_account, p_map, p_q, p_r, v_res, v_crew);",
    );
  });
});
