// migrations/mob-relocate-01.sql — переселение боссов с дорог и жил (владелец,
// 22.10.2026: «подвинь рядом стоящие клетки»). На базе файл гоняется пробой с
// откатом (scratchpad/batch6/mob-relocate-01-trial.sql); здесь — сторожа того,
// на чём держится его безопасность.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { roadHereSql } from "./mob-ground";

const SQL = readFileSync(join(process.cwd(), "migrations/mob-relocate-01.sql"), "utf8");
const flat = (s: string) => s.replace(/\s+/g, " ");
const BODY = flat(SQL);

describe("mob-relocate-01", () => {
  it("одна транзакция на карту, копия до правки, функция — временная", () => {
    for (const map of ["rmap_UthOURxc", "rmap_CAzVp8fn"]) {
      expect(BODY).toContain(
        `BEGIN; SET LOCAL lock_timeout = '5s'; SELECT pg_temp.mob_relocate('${map}'); COMMIT;`,
      );
    }
    expect(BODY).toContain("CREATE TABLE IF NOT EXISTS yuplink.mob_relocate_bak_20261022");
    expect(BODY).toContain("INSERT INTO yuplink.mob_relocate_bak_20261022");
    expect(BODY).toContain("DROP FUNCTION pg_temp.mob_relocate(text, boolean)");
  });

  it("двигает только объект клетки boss:/mob: на дороге или жиле; слой беглецов не трогает", () => {
    expect(BODY).toContain("(c.object_id LIKE 'boss:%' OR c.object_id LIKE 'mob:%')");
    // Дорога — тем же признаком, что в коде (пустой road_id — не дорога).
    expect(BODY).toContain(flat(roadHereSql("c").slice(1, -1)));
    expect(BODY).toContain("FROM yuplink.raid_map_vein v");
    expect(SQL).not.toMatch(/UPDATE yuplink\.beta_raid_runner/);
    expect(SQL).not.toMatch(/DELETE FROM/);
  });

  it("поверженного не двигает; ближайшая клетка — радиус от 1 до 8", () => {
    expect(BODY).toContain("IF s.dead THEN");
    expect(BODY).toContain("dd.d BETWEEN 1 AND 8");
    expect(BODY).toContain("ORDER BY dd.d, x.q, x.r LIMIT 1");
  });

  it("цель свободна как для генерации: не дорога, не жила, без всего, что держит клетку", () => {
    expect(BODY).toContain(`AND NOT (${flat(roadHereSql("x").slice(1, -1))})`);
    for (const t of [
      "raid_map_vein",
      "beta_raid_object_hp",
      "beta_raid_runner",
      "raid_loot_bag",
      "raid_magic_chest",
      "raid_plain_chest",
      "beta_raid_ship",
      "raid_mine_guard",
      "raid_dig_hole",
      "raid_dmine",
      "raid_mob_spawn",
      "beta_raid_positions",
    ])
      expect(BODY, t).toContain(`yuplink.${t}`);
    expect(BODY).toContain("x.building_id IS NULL AND x.group_id IS NULL");
    expect(BODY).toContain("x.object_id IS NULL AND x.decoration_id IS NULL");
    expect(BODY).toContain("NOT COALESCE(x.void_fog, false)");
  });

  it("состояние едет с объектом: настройки, расписка Darai, боевое состояние тем же id, точка", () => {
    expect(BODY).toContain(
      "SET object_id = s.object_id, object_config = s.object_config, darai_ref = s.darai_ref, darai_hold = s.darai_hold",
    );
    expect(BODY).toContain("darai_ref = t.darai_ref, darai_hold = t.darai_hold");
    expect(BODY).toContain(
      "UPDATE yuplink.beta_raid_object_hp h SET q = t.q, r = t.r WHERE h.id = s.hp_id",
    );
    expect(BODY).toContain("UPDATE yuplink.raid_mob_spawn sp SET cur_q = t.q, cur_r = t.r");
  });

  it("после — «карта перестроена»: версия, журнал full, pg_notify", () => {
    expect(BODY).toContain("SET revision = COALESCE(revision, 0) + 1");
    expect(BODY).toContain(`VALUES (p_map, v_rev, '{"full":true}'::jsonb)`);
    expect(BODY).toContain("pg_notify('raid_live'");
    expect(BODY).toContain("'type', 'map', 'mapId', p_map, 'rev', v_rev, 'full', true");
    // Нечего двигать (повтор) — версию не трогаем.
    expect(BODY).toContain("IF v_moved > 0 AND NOT p_dry THEN");
  });
});
