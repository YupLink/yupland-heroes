// dynamite-01: бросок динамита — одна функция базы под локами. По пунктам
// владельца: бросок (радиус 3, купол, город, штука, энергия до взрыва, повтор),
// взрыв 7 клеток, шахты (только сломанные, как разборка, без мешочка), мобы/боссы/
// беглецы/охрана −10 % максимума с записью урона, деревья → мешочек (посаженные
// не отрастают), что не трогается; повтор миграции безвреден.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  new URL("../../../../../migrations/dynamite-01-blast.sql", import.meta.url),
  "utf8",
);
const flat = sql.replace(/\s+/g, " ");
const fn = (name: string) => {
  const from = flat.indexOf(`CREATE OR REPLACE FUNCTION yuplink.${name}(`);
  return flat.slice(from, flat.indexOf("END $fn$;", from));
};
const blast = fn("raid_dynamite_blast");
const hit = fn("raid_dynamite_hit");
const dead = flat.slice(
  flat.indexOf("CREATE OR REPLACE FUNCTION yuplink.raid_dynamite_mine_dead("),
  flat.indexOf("CREATE OR REPLACE FUNCTION yuplink.raid_dynamite_hit("),
);
// Признак «руины» набора Ангелины (полосы службы) — им же решает и взрыв.
const bars = readFileSync(new URL("../mine-life-bars.ts", import.meta.url), "utf8")
  .replace(/\s+/g, " ")
  .replace(/c\.map_id/g, "p_map")
  .replace(/c\.q/g, "p_q")
  .replace(/c\.r/g, "p_r");
const town = flat.slice(
  flat.indexOf("CREATE OR REPLACE FUNCTION yuplink.raid_dynamite_in_town("),
  flat.indexOf("CREATE OR REPLACE FUNCTION yuplink.raid_dynamite_hit("),
);
const at = (s: string) => blast.indexOf(s);

describe("миграция: транзакция, повтор безвреден", () => {
  it("BEGIN/COMMIT, короткий лок, IF NOT EXISTS и CREATE OR REPLACE", () => {
    expect(flat).toMatch(/BEGIN; SET LOCAL lock_timeout = '5s';/);
    expect(flat.trim().endsWith("COMMIT;")).toBe(true);
    expect(flat).toContain("CREATE TABLE IF NOT EXISTS yuplink.raid_dynamite_op");
    expect(flat).toContain("CREATE INDEX IF NOT EXISTS raid_dynamite_op_unsent_idx");
    expect(flat).not.toMatch(/DROP (TABLE|FUNCTION)|ALTER TABLE/);
  });
});

describe("бросок", () => {
  it("локи: карта → повтор ключа → bp героя → decor-respawn → клетки по (q, r)", () => {
    const order = [
      "'godmove:'",
      "RETURN v_prev || jsonb_build_object('was', true)",
      "'bp:'",
      "'decor-respawn'",
      "'chestcell:'",
      "'lootdrop:'",
      "'mine:'",
    ].map(at);
    expect(order.every((x) => x > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(blast).toContain("FROM unnest(v_lq, v_lr) AS t(q, r) ORDER BY t.q, t.r LOOP");
  });

  it("герой на этой карте и цель в радиусе 3; клетка есть, не купол, не город", () => {
    expect(blast).toContain("/ 2 > 3 THEN RAISE EXCEPTION 'dynamite_far'");
    expect(blast).toContain("RAISE EXCEPTION 'dynamite_no_cell'");
    expect(blast).toContain(
      "IF COALESCE(r_cell.void_fog, false) THEN RAISE EXCEPTION 'dynamite_void'",
    );
    expect(blast).toContain(
      "IF yuplink.raid_dynamite_in_town(p_map, p_q, p_r) THEN RAISE EXCEPTION 'dynamite_town'",
    );
    expect(blast).toContain("RAISE EXCEPTION 'dynamite_island'");
  });

  it("сначала энергия, потом бросок: штука → энергия → минус штука → взрыв; отказ — до записи", () => {
    const box = at("RAISE EXCEPTION 'dynamite_no_item'");
    const pay = at("PERFORM yuplink.energy_touch_acc(p_account, p_cost)");
    const take = at("UPDATE yuplink.raid_hero_backpack b SET count = v_left");
    expect(box).toBeGreaterThan(0);
    expect(pay).toBeGreaterThan(box);
    expect(take).toBeGreaterThan(pay);
    for (const write of [
      "PERFORM yuplink.raid_mine_dismantle(",
      "yuplink.raid_dynamite_hit(",
      "DELETE FROM yuplink.raid_mine_guard",
      "UPDATE yuplink.raid_map_cells cu",
      "INSERT INTO yuplink.raid_loot_bag ",
      "INSERT INTO yuplink.raid_dynamite_op",
    ]) {
      expect(at(write)).toBeGreaterThan(take);
    }
    expect(at("RAISE EXCEPTION 'dynamite_far'")).toBeLessThan(pay);
    expect(at("RAISE EXCEPTION 'dynamite_town'")).toBeLessThan(pay);
  });

  it("целая штука (изношенная остаётся), метки происхождения — как при списании", () => {
    expect(blast).toContain("AND (b.wear = 0 OR b.count >= 2)");
    expect(blast).toContain("mob_count = LEAST(b.mob_count, v_left)");
    expect(blast).toContain(
      "DELETE FROM yuplink.raid_hero_backpack b WHERE b.id = r_box.id AND b.wear = 0",
    );
  });

  it("ключ нажатия ложится вместе с делом и хранит итог", () => {
    expect(blast).toContain(
      "INSERT INTO yuplink.raid_dynamite_op (op, account_id, map_id, q, r, detail) VALUES (p_op, p_account, p_map, p_q, p_r, v_res)",
    );
  });
});

describe("взрыв: 7 клеток без купола и города", () => {
  it("центр и шесть соседних", () => {
    expect(blast).toContain("(VALUES (0, 0), (1, 0), (-1, 0), (0, 1), (0, -1), (1, -1), (-1, 1))");
    expect(blast).toContain(
      "NOT COALESCE(cc.void_fog, false) AND NOT yuplink.raid_dynamite_in_town(p_map, cc.q, cc.r)",
    );
  });

  it("город: 5 шагов от ратуши (реестр и постройка), 2 — от городской постройки", () => {
    expect(town).toContain("FROM yuplink.raid_town rt");
    expect(town).toContain("= 'town_hall' THEN 5");
    expect(town).toContain(
      "IN ('tavern', 'warehouse', 'chambers', 'boost', 'museum', 'university', 'market', 'spellbook') THEN 2",
    );
  });
});

describe("шахты", () => {
  it("только v2 (грибы — нет: у них raid_mine_v2_std пуст) не на острове", () => {
    expect(blast).toContain("AND yuplink.raid_mine_v2_std(mc.building_config) IS NOT NULL");
    expect(blast).toContain("AND NOT yuplink.raid_mine_is_island(mc.building_config)");
  });

  it("сносится только шахта, у которой жизнь кончилась; иначе — мимо", () => {
    expect(blast).toContain(
      "IF NOT yuplink.raid_dynamite_mine_dead(p_map, r_m.q, r_m.r) THEN CONTINUE; END IF;",
    );
    expect(at("raid_dynamite_mine_dead(p_map, r_m.q, r_m.r)")).toBeLessThan(
      at("PERFORM yuplink.raid_mine_dismantle("),
    );
    expect(blast).not.toContain("r_st");
  });

  it("с хозяином: срок службы вышел — сломана; старого образца или жизнь есть — нет", () => {
    expect(dead).toContain(
      "CASE WHEN s.map_id IS NOT NULL THEN s.accrue_from IS NOT NULL AND now() >= yuplink.raid_mine_break_at(s.mode, s.life_left, s.life_at)",
    );
  });

  it("ничья: сломана, только если последняя запись журнала — поломка или захват", () => {
    const rule =
      "SELECT l.kind IN ('break', 'capture') FROM yuplink.raid_mine_capture_log l WHERE l.map_id = p_map AND l.q = p_q AND l.r = p_r ORDER BY l.seized_at DESC LIMIT 1";
    expect(dead).toContain(`ELSE (${rule})`);
    // Тот же признак, что «руины» у полос службы и картинок набора Ангелины.
    expect(bars).toContain(rule);
  });

  it("ничья без записей (ни разу не запускалась, ждёт хозяина) — жизнь есть, не сносится", () => {
    // Нет записей → подзапрос NULL → COALESCE(…, false); разборка/остров — kind не тот.
    expect(dead).toMatch(/SELECT COALESCE\( CASE .* END, false\)/);
    expect(dead).toContain(
      "LEFT JOIN yuplink.raid_mine_state s ON s.map_id = p_map AND s.q = p_q AND s.r = p_r",
    );
    expect(dead).not.toMatch(/'dismantle'|'island'|'take'|'expire'/);
  });

  it("снос — как «Разобрать»: цена 0, без мешочка; блок задет любой клеткой", () => {
    expect(blast).toContain(
      "PERFORM yuplink.raid_mine_dismantle(v_dop, p_map, r_m.q, r_m.r, p_account, 0::numeric, '[]'::jsonb, NULL::text)",
    );
    expect(blast).toContain("v_dop := 'dyn:' || p_op || ':' || r_m.q || ':' || r_m.r");
    expect(blast).toContain("AND mc.group_id IN (SELECT gc.group_id");
    // Шахта блока, сама стоящая в городе или под куполом, — не трогается.
    expect(blast).toContain(
      "AND NOT COALESCE(mc.void_fog, false) AND NOT yuplink.raid_dynamite_in_town(p_map, mc.q, mc.r) AND mc.group_id IN",
    );
    expect(blast).toContain("'building', r_m.building_id, 'skin', r_m.building_skin_id");
  });
});

describe("мобы, боссы, беглецы, охрана", () => {
  it("объект клетки и беглец под ним — только boss:", () => {
    expect(blast).toContain("yuplink.raid_dynamite_hit(p_map, r_o.q, r_o.r, 0,");
    expect(blast).toContain("yuplink.raid_dynamite_hit(p_map, r_o.q, r_o.r, 1,");
    expect(blast).toContain("FROM yuplink.beta_raid_runner rn");
    expect(blast.match(/object_id LIKE 'boss:%'/g)).toHaveLength(2);
  });

  it("−10 % максимума вверх; запас строки — как первый удар; уже повержен — мимо", () => {
    expect(hit).toContain("v_dmg := GREATEST(1, ceil(h.max_hp::numeric / 10))::bigint");
    expect(hit).toContain("ON CONFLICT (map_id, q, r, cycle_no) DO NOTHING");
    expect(hit).toContain("IF h.killed_at IS NOT NULL OR h.current_hp <= 0");
    expect(hit).toContain("killed_by = CASE WHEN v_dead THEN p_wallet ELSE killed_by END");
  });

  it("урон — бросившему записью удара (rounds 1, поколение жизни)", () => {
    expect(hit).toContain("INSERT INTO yuplink.beta_raid_object_run");
    expect(hit).toContain(
      "h.id, v_bare, p_wallet, p_account, v_dealt, 1, v_dead, COALESCE(h.generation, 0), now()",
    );
  });

  it("охрана шахт и сундуков: −10 %, ноль — строка удалена", () => {
    expect(blast).toContain("v_dmg := GREATEST(1, ceil(COALESCE(r_g.max_hp, 0) / 10))");
    expect(blast).toContain("DELETE FROM yuplink.raid_mine_guard gd");
    expect(blast).toContain("FOR UPDATE OF gg");
  });
});

describe("деревья и камни", () => {
  it("снимается только тот декор, что на клетке; посаженный — без отрастания", () => {
    expect(blast).toContain("AND cc.decoration_id = r_x.d");
    expect(blast).toContain("SET decoration_id = NULL, planted_decor = NULL");
    expect(blast).toContain("DELETE FROM yuplink.raid_decor_respawn dr");
  });

  it("добыча — мешочком «decor» на клетке дерева, порция со сроком и метками", () => {
    expect(blast).toContain(
      "v_bag := 'lb_' || md5('dyn:' || p_op || ':' || r_x.q || ':' || r_x.r)",
    );
    expect(blast).toContain(
      "VALUES (v_bag, p_map, r_x.q, r_x.r, now(), p_account, 'decor', r_x.nm, now())",
    );
    expect(blast).toContain("make_interval(hours => GREATEST(1, COALESCE(v.h, 24)))");
    expect(blast).toContain("COALESCE(v.loot, 0)");
  });
});

describe("не трогается", () => {
  it("ни постройки (кроме разборки шахт), ни сундуки, ни грибы, ни корабли, ни жилы", () => {
    for (const t of [
      "raid_map_vein",
      "raid_dmine",
      "beta_raid_ship",
      "raid_plain_chest",
      "raid_magic_chest SET",
      "building_id = NULL",
    ]) {
      expect(blast).not.toContain(t);
    }
  });
});
