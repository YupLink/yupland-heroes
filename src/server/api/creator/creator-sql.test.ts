// SQL работ креатора: видно только своё и открытое, имя — в работе и в карте.
import { describe, expect, it } from "vitest";
import { blankCellsSql, clearStateSql, wipeCellsSql } from "@/server/api/creator/creator-map-sql";
import {
  insertWorkSql,
  lastOwnSql,
  renameWorkSql,
  saveBackSql,
  shareSql,
  workEditSql,
  workSql,
  worksListSql,
} from "@/server/api/creator/creator-sql";
import { spawnOf } from "@/server/api/creator/creator-store";

describe("работы креатора: SQL", () => {
  it("список — свои и открытые мне; админу — все", () => {
    const mine = worksListSql("acc_x'y");
    expect(mine).toContain("w.owner_account = 'acc_x''y'");
    expect(mine).toContain("s.account_id = 'acc_x''y'");
    expect(worksListSql("acc_a", true)).toContain("WHERE true");
  });

  it("вход — свой мир, где был последним (вход отмечает updated_at)", () => {
    const sql = lastOwnSql("acc_a");
    expect(sql).toContain("w.owner_account = 'acc_a'");
    expect(sql).toContain("ORDER BY w.updated_at DESC");
  });

  it("работа по id — с той же проверкой доступа", () => {
    const sql = workSql("isle_cw_1", "acc_a");
    expect(sql).toContain("w.map_id = 'isle_cw_1'");
    expect(sql).toContain("raid_creator_share");
  });

  it("новая работа хранит старт героя в places.spawn", () => {
    expect(
      insertWorkSql({ mapId: "isle_cw_1", name: "Порт", owner: "acc_a", spawn: { q: 16, r: 16 } }),
    ).toContain(`'{"spawn":{"q":16,"r":16}}'::jsonb`);
    expect(spawnOf({ spawn: { q: 16, r: 16 } })).toEqual({ q: 16, r: 16 });
    expect(spawnOf('{"spawn":{"q":1,"r":-2}}')).toEqual({ q: 1, r: -2 });
    expect(spawnOf({})).toBeNull();
  });

  it("переименование — и работа, и карта", () => {
    const [w, m] = renameWorkSql("isle_cw_1", "Город");
    expect(w).toContain("raid_creator_work SET name = 'Город'");
    expect(m).toContain("raid_maps SET name = 'Город'");
  });

  it("поделиться — с ролью (смотреть/править), смена роли — тем же; закрыть — удаление", () => {
    const view = shareSql("isle_cw_1", "acc_b", "view");
    expect(view).toContain("VALUES ('isle_cw_1', 'acc_b', 'view')");
    expect(view).toContain("ON CONFLICT (map_id, account_id) DO UPDATE SET role = EXCLUDED.role");
    expect(shareSql("isle_cw_1", "acc_b", "edit")).toContain("'edit'");
    expect(shareSql("isle_cw_1", "acc_b", null)).toMatch(/^DELETE FROM yuplink.raid_creator_share/);
  });

  it("править — автор или роль «править»; просмотр — нет", () => {
    const sql = workEditSql("isle_cw_1", "acc_b");
    expect(sql).toContain("w.owner_account = 'acc_b'");
    expect(sql).toContain("s.role = 'edit'");
  });

  it("голая карта — только координаты, пачками", () => {
    const cells = Array.from({ length: 2500 }, (_, i) => ({ q: i, r: -i }));
    const sql = blankCellsSql("isle_cw_1", cells);
    expect(sql).toHaveLength(3);
    expect(sql[0]).toContain("INSERT INTO yuplink.raid_map_cells (map_id, q, r, saved_at)");
    expect(sql[0]).not.toContain("terrain_id");
  });

  it("очистка — все слои клеток пустые, состояние мира прочь, журнал и позиции на месте", () => {
    const wipe = wipeCellsSql("isle_cw_1");
    for (const col of [
      "terrain_id = NULL",
      "decoration_id = NULL",
      "object_id = NULL",
      "building_id = NULL",
      "road_id = NULL",
      "void_fog = false",
    ])
      expect(wipe).toContain(col);
    expect(wipe).not.toContain("darai_hold");
    const state = clearStateSql("isle_cw_1").join("\n");
    expect(state).toContain("raid_spawn_point");
    expect(state).toContain("raid_market_item");
    expect(state).not.toContain("raid_map_journal");
    expect(state).not.toContain("beta_raid_positions");
    expect(state).not.toContain("raid_creator");
  });

  it("точка возврата — одна на аккаунт", () => {
    expect(saveBackSql("acc_a", { mapId: "rmap_x", q: 1.7, r: -2 })).toContain(
      "VALUES ('acc_a', 'rmap_x', 1, -2",
    );
  });
});
