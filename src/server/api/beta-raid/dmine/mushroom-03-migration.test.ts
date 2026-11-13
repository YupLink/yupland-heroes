// Миграция mushroom-03 (владелец, 22.10.2026) против правил — по тексту SQL:
// три вида гриба, гриб — не шахта v2, облики, «Забрать» любого вида в стопку
// своего вида, конец жизни любого вида, появление на жилах раз в час (ключ
// часа, шансы из settings, клетка жилы и соседние × near, годная пустая клетка,
// более редкий на клетке, лимиты по всем мирам, журнал). Плюс запрос статистики
// — только чтение.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { MUSHROOMS, MUSHROOM_SPAWN_DEFAULT } from "@/lib/mushroomKinds";

const read = (name: string) =>
  readFileSync(
    fileURLToPath(new URL(`../../../../../migrations/${name}`, import.meta.url)),
    "utf8",
  );
const raw = read("mushroom-03-kinds-spawn.sql");
const sql = raw.replace(/--[^\n]*/g, "").replace(/\s+/g, " ");
const fnOf = (name: string) => {
  const from = sql.indexOf(`CREATE OR REPLACE FUNCTION yuplink.${name}(`);
  expect(from, name).toBeGreaterThan(0);
  const end =
    sql.indexOf("$fn$;", from) > 0 ? sql.indexOf("$fn$;", from) : sql.indexOf("$function$;", from);
  return sql.slice(from, end);
};

describe("mushroom-03: виды, облики, «Забрать», конец жизни", () => {
  it("одной транзакцией; вид — столбец raid_dmine с проверкой", () => {
    expect(sql.trimStart().startsWith("BEGIN;")).toBe(true);
    expect(raw.trimEnd().endsWith("COMMIT;")).toBe(true);
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS mushroom text NOT NULL DEFAULT 'darai';");
    expect(sql).toContain("CHECK (mushroom IN ('darai', 'gold', 'diamonds'))");
  });

  it("узнавание вида — та же лестница, что mushroomKindOf: метка, иначе токен Darai", () => {
    const f = fnOf("raid_mushroom_kind");
    expect(f).toContain(
      "WHEN p_cfg->>'mushroom' IN ('darai', 'gold', 'diamonds') THEN p_cfg->>'mushroom'",
    );
    expect(f).toContain("lower(COALESCE(p_cfg->>'token', '')) = 'darai' THEN 'darai'");
    expect(f).toContain("IMMUTABLE");
  });

  it("гриб — не шахта v2: метка mushroom первой веткой, прежнее тело без изменений", () => {
    const f = fnOf("raid_mine_v2_std");
    expect(f.indexOf("WHEN p_cfg ? 'mushroom' THEN NULL")).toBeLessThan(f.indexOf("maxHours"));
    expect(f).toContain(
      "WHEN 'wood' THEN 10 WHEN 'stone' THEN 1 WHEN 'gold' THEN 1 WHEN 'diamonds' THEN 1",
    );
    expect(f).toContain("WHEN 'diamonds' THEN 1::numeric / 24");
  });

  it("облики золотого и алмазного — в группе грибов, повтор не перетирает картинку", () => {
    expect(sql).toContain(
      "('bskin_dm_gold', 'bgrp_dmineDarai', 'Золотой гриб', '/uploads/tasks/mushroom-gold.webp')",
    );
    expect(sql).toContain(
      "('bskin_dm_diamonds', 'bgrp_dmineDarai', 'Алмазный гриб', '/uploads/tasks/mushroom-diamond.webp') ON CONFLICT (id) DO NOTHING;",
    );
    for (const k of ["gold", "diamonds"] as const) expect(MUSHROOMS[k].skin).toBe(`bskin_dm_${k}`);
  });

  it("«Забрать»: любой вид, стопка своего вида, место — по стопке вида, жизнь вида по умолчанию", () => {
    const f = fnOf("raid_dmine_take");
    expect(f).toContain(
      "v_kind := yuplink.raid_mushroom_kind(c.building_config); IF v_kind IS NULL THEN RAISE EXCEPTION 'dmine_not_darai';",
    );
    expect(f).toContain("v_stack := 'dmine:' || v_kind;");
    expect(f).toContain("WHERE b.hero_id = p_hero AND b.stack_key = v_stack;");
    expect(f).toContain(
      "CASE WHEN v_kind = 'diamonds' THEN interval '72 hours' ELSE interval '168 hours' END",
    );
    expect(f).toContain("p_hero, p_account, 'dmine', v_kind, v_kind, v_stack, p_name, c.image, 1)");
    expect(f).toContain("v_last.id, v_block, p_hero, v_dies, v_kind);");
    // Прежние отказы — до энергии.
    const energy = f.indexOf("PERFORM yuplink.touch_energy_atomic(p_wallet, p_cost)");
    for (const e of ["'dmine_own'", "'dmine_once'", "'dmine_guarded'", "'dmine_room:%'"])
      expect(f.indexOf(`RAISE EXCEPTION ${e}`), e).toBeLessThan(energy);
  });

  it("конец жизни — любой вид: на карте по raid_mushroom_kind, в рюкзаке — стопка вида", () => {
    expect(fnOf("raid_mushroom_expire_cell")).toContain(
      "OR yuplink.raid_mushroom_kind(c.building_config) IS NULL",
    );
    const item = fnOf("raid_mushroom_expire_item");
    expect(item).toContain("SELECT d.hero_id, 'dmine:' || d.mushroom INTO v_hero, v_stack");
    expect(item).toContain("WHERE hero_id = v_hero AND stack_key = v_stack AND count > 1;");
  });

  it("минутная свёртка прежних стопок не сливает стопки видов в DARAI", () => {
    expect(fnOf("raid_mushroom_fold")).toContain(
      "WHERE b.kind = 'dmine' AND b.stack_key NOT IN ('dmine:darai', 'dmine:gold', 'dmine:diamonds')",
    );
  });
});

describe("mushroom-03: появление на жилах", () => {
  const f = fnOf("raid_mushroom_spawn_hour");

  it("ключ часа: второй процесс и повтор в этот час не бросают; пропуски не догоняются", () => {
    expect(f).toContain("v_hour timestamptz := date_trunc('hour', now());");
    expect(f).toContain(
      "INSERT INTO yuplink.raid_mushroom_hour (hour, op) VALUES (v_hour, p_op) ON CONFLICT (hour) DO NOTHING; IF NOT FOUND THEN RETURN (SELECT h.res FROM yuplink.raid_mushroom_hour h WHERE h.hour = v_hour AND h.op = p_op); END IF;",
    );
    // Повтор моста того же вызова — тот же итог: он записан в ключ часа.
    expect(f).toContain("SET spawned = v_n, res = v_res,");
    expect(f).toContain("RETURN v_res;");
  });

  it("шансы — settings.mushroom_spawn, по умолчанию — как в lib; соседние × near", () => {
    const d = MUSHROOM_SPAWN_DEFAULT;
    expect(sql).toContain(
      `VALUES ('mushroom_spawn', '{"gold":${d.gold},"darai":${d.darai},"diamonds":${d.diamonds},"near":${d.near}}') ON CONFLICT (key) DO NOTHING;`,
    );
    expect(f).toContain(
      `(VALUES ('diamonds', 1, ${d.diamonds}), ('darai', 2, ${d.darai}), ('gold', 3, ${d.gold}))`,
    );
    expect(f).toContain("AND random() < COALESCE(NULLIF(v_cfg->>k.kind, '')::numeric, k.p0) * s.f");
    expect(f).toContain("SELECT v.map_id, v.q + d.dq, v.r + d.dr, v.kind, false");
    expect(f).toContain("(VALUES (1, 0), (1, -1), (0, -1), (-1, 0), (-1, 1), (0, 1)) d(dq, dr)");
  });

  it("клетка — один бросок на вид: жила пары и общий сосед двух жил не бросают дважды", () => {
    expect(f).toContain("CASE WHEN bool_or(a.on_vein) THEN 1::numeric ELSE v_near END AS f");
    expect(f).toContain("GROUP BY a.map_id, a.q, a.r, a.vein_kind");
  });

  it("лимиты — после локов карт; клетка — под локами постановки и со сверкой сундуков/мешочков", () => {
    expect(f.indexOf("PERFORM pg_advisory_xact_lock(hashtext('godmove:' || m))")).toBeLessThan(
      f.indexOf("SELECT 200 - count(*)"),
    );
    const upd = f.slice(f.indexOf("UPDATE yuplink.raid_map_cells x"));
    for (const k of ["chestcell", "lootdrop", "mine"])
      expect(f.indexOf(`hashtext('${k}:' || c.map_id`), k).toBeLessThan(
        f.indexOf("UPDATE yuplink.raid_map_cells x"),
      );
    for (const t of ["raid_magic_chest", "raid_plain_chest", "raid_loot_bag", "raid_mine_state"])
      expect(upd.slice(0, upd.indexOf("CONTINUE WHEN NOT FOUND"))).toContain(`yuplink.${t} z`);
  });

  it("золотая жила — золотой или DARAI, алмазная — только алмазный", () => {
    expect(f).toContain(
      "((s.vein_kind = 'gold' AND k.kind IN ('gold', 'darai')) OR (s.vein_kind = 'diamonds' AND k.kind = 'diamonds'))",
    );
  });

  it("клетка — пустая проходимая суша, не под туманом; занятая — только эта, соседи как обычно", () => {
    for (const part of [
      "NOT (t.name ~* '(вод|water|море|океан|ocean|river|река)')",
      "NOT COALESCE(x.void_fog, false)",
      "x.building_id IS NULL AND x.group_id IS NULL AND x.object_id IS NULL AND x.decoration_id IS NULL",
      "FROM yuplink.raid_loot_bag z",
      "FROM yuplink.raid_dig_hole z WHERE z.map_id = x.map_id AND z.q = x.q AND z.r = x.r AND z.dug_at > now() - interval '1 hour'",
      "FROM yuplink.beta_raid_runner z",
    ])
      expect(f).toContain(part);
  });

  it("на клетке один гриб — более редкий; лимиты вида по всем мирам (карты + рюкзаки)", () => {
    expect(f).toContain("SELECT DISTINCT ON (f.map_id, f.q, f.r)");
    expect(f).toContain("ORDER BY f.map_id, f.q, f.r, f.rk, f.on_vein DESC");
    expect(f).toContain(
      `SELECT ${MUSHROOMS.gold.limit} - count(*) FILTER (WHERE x.k = 'gold'), ${MUSHROOMS.darai.limit} - count(*) FILTER (WHERE x.k = 'darai'), ${MUSHROOMS.diamonds.limit} - count(*) FILTER (WHERE x.k = 'diamonds')`,
    );
    expect(f).toContain("SELECT d.mushroom FROM yuplink.raid_dmine d WHERE d.state = 'item'");
    expect(f).toContain(
      "CONTINUE WHEN (c.kind = 'gold' AND v_gold <= 0) OR (c.kind = 'darai' AND v_darai <= 0) OR (c.kind = 'diamonds' AND v_dia <= 0);",
    );
  });

  it("новый гриб — без хозяина, жизнь вида от появления, облик вида; журнал появлений", () => {
    expect(f).toContain(
      "CASE WHEN c.kind = 'diamonds' THEN interval '72 hours' ELSE interval '168 hours' END",
    );
    expect(f).toContain(
      "WHEN 'gold' THEN jsonb_build_object('resource', 'gold', 'yield', 1, 'captureCost', 5, 'diesAt', v_dies, 'mushroom', 'gold')",
    );
    expect(f).toContain("'yield', 10000, 'captureCost', 5, 'diesAt', v_dies, 'mushroom', 'darai')");
    expect(f).not.toContain("INSERT INTO yuplink.raid_mine_state");
    expect(f).toContain(
      "INSERT INTO yuplink.raid_mushroom_spawn (hour, kind, map_id, q, r, on_vein, vein_kind, dies_at)",
    );
    expect(sql).toContain("CREATE UNIQUE INDEX IF NOT EXISTS raid_mushroom_spawn_cell_hour");
  });
});

describe("статистика грибов — только чтение", () => {
  const stats = read("mushroom-stats.sql").replace(/--[^\n]*/g, "");
  it("BEGIN READ ONLY … ROLLBACK, без записи", () => {
    expect(stats).toContain("BEGIN READ ONLY;");
    expect(stats.trimEnd().endsWith("ROLLBACK;")).toBe(true);
    expect(stats).not.toMatch(/\b(INSERT|UPDATE|DELETE|ALTER|CREATE|DROP)\b/i);
  });

  it("живые по виду и месту, появившиеся за сутки и неделю, поднятые и посаженные", () => {
    expect(stats).toContain("FROM yuplink.raid_mushroom_spawn");
    expect(stats).toContain("interval '1 day'");
    expect(stats).toContain("interval '7 days'");
    expect(stats).toContain("AS taken_day");
    expect(stats).toContain("AS planted_week");
  });
});
