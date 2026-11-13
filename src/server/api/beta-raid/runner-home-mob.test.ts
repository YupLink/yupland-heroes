// «Восстановить» возвращает беглецов домой. Моб, чей дом — дорога или жила, домой
// не встаёт (владелец, 22.10.2026: «мобов на жилах и дорогах не спавнить»): как
// с домом-шахтой — остаётся, где был, и поднимается целым там же.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mobGroundSql, mobIdSql } from "./mob-ground";

const db = vi.hoisted(() => ({ sql: [] as string[] }));
vi.mock("../../db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    db.sql.push(sql);
    return [{ returned: 0, parked: 0 }];
  },
}));

const { returnRunnersHome } = await import("./runner-home");
const flat = (x: string) => x.replace(/\s+/g, " ");

beforeEach(() => {
  db.sql = [];
});

describe("беглецы домой: мобу дом на дороге или жиле закрыт", () => {
  it("флаг дома — только у моба и только на дороге или жиле", async () => {
    await returnRunnersHome({ mapId: "m1", kindFilter: "true", resourceOk: "true" });
    const sql = flat(db.sql[0]);
    expect(sql).toContain(
      flat(`COALESCE(hc.map_id IS NOT NULL AND ${mobIdSql("rn.object_id")}
        AND NOT ${mobGroundSql("hc")}, false) AS home_road`),
    );
  });

  it("в клетку не возвращается, слоем домой не едет, сирот дома не трогает", async () => {
    await returnRunnersHome({ mapId: "m1", kindFilter: "true", resourceOk: "true" });
    const sql = flat(db.sql[0]);
    const back = sql.slice(sql.indexOf("back AS ("), sql.indexOf("hp_gone AS ("));
    expect(back).toContain("AND NOT p.home_road AND p.home_free");
    const parked = sql.slice(sql.indexOf("parked AS ("));
    expect(parked).toContain("AND NOT p.home_mine AND NOT p.home_road");
    expect(sql).toMatch(
      /h\.q = p\.home_q AND h\.r = p\.home_r AND h\.cycle_no = \d+ AND NOT p\.home_mine AND NOT p\.home_road/,
    );
  });
});
