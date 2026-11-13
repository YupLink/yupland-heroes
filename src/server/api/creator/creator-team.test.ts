// Команда креаторов: ник Telegram и выдача права без затирания чужих прав.
import { describe, expect, it } from "vitest";
import { accountsByTgSql, cleanTgNick, grantCreatorSql } from "@/server/api/creator/creator-team";
import { copyMapSql, growFrameSql } from "@/server/api/creator/creator-map-sql";

describe("команда креаторов", () => {
  it("ник: @ и регистр не важны, мусор — нет", () => {
    expect(cleanTgNick(" @Player_Nick ")).toBe("player_nick");
    expect(cleanTgNick("partnernick")).toBe("partnernick");
    expect(cleanTgNick("a b")).toBeNull();
    expect(cleanTgNick("@")).toBeNull();
    expect(accountsByTgSql("player_nick")).toContain("lower(telegram_username) = 'player_nick'");
  });

  it("право дописывается к правам аккаунта, уже выданное не дублируется", () => {
    const sql = grantCreatorSql("acc_x");
    expect(sql).toContain(
      "COALESCE(value::jsonb -> 'acc_x', '[]'::jsonb) || '[\"creator\"]'::jsonb",
    );
    expect(sql).toContain("NOT COALESCE(value::jsonb -> 'acc_x', '[]'::jsonb) ? 'creator'");
  });

  it("копия мира — та же рамка и все слои клеток, без обеспечения наград", () => {
    const sql = copyMapSql("isle_cw_a", "isle_cw_b", "Порт — копия").join("\n");
    expect(sql).toContain("SELECT 'isle_cw_b', 'Порт — копия', size, false");
    expect(sql).toContain("decoration_id, building_id");
    expect(sql).toContain("beta_raid_building_state");
    expect(sql).toContain("raid_town");
    expect(sql).not.toContain("darai_hold");
  });

  it("расширение — рамка одним оператором вокруг того же центра, созданное не трогает", () => {
    const sql = growFrameSql("isle_cw_a", 128);
    expect(sql).toContain("generate_series(-32, 95) AS r(row)");
    expect(sql).toContain("generate_series(-32, 95) AS c(col)");
    expect(sql).toContain("c.col - (r.row - (r.row & 1)) / 2");
    expect(sql).toContain("ON CONFLICT (map_id, q, r) DO NOTHING");
    expect(growFrameSql("isle_cw_a", 64)).toContain("generate_series(0, 63)");
  });
});
