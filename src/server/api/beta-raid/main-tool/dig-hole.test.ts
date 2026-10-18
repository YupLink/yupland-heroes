// Ямки от лопаты и мои бугорки (владелец, 02.10.2026): SQL записи и чтения.
import { describe, expect, it } from "vitest";
import { holeMarkSql, holesNearSql, myMoundsSql } from "@/server/api/beta-raid/main-tool/dig-hole";

const near = { account: "acc_1", activeMapId: "map_a", admin: false };

describe("ямка от лопаты", () => {
  it("запись: час заново на той же клетке, просроченные — прочь, кроме этой", () => {
    const sql = holeMarkSql({ mapId: "map_a", q: 3, r: -2 });
    expect(sql).toContain("ON CONFLICT (map_id, q, r) DO UPDATE SET dug_at = now()");
    expect(sql).toContain("interval '60 minutes'");
    expect(sql).toContain("AND NOT (map_id = 'map_a' AND q = 3 AND r = -2)");
  });

  it("чтение: только живые час, в круге, без декора, постройки, мешочка и сундука", () => {
    const sql = holesNearSql(near);
    expect(sql).toContain("h.dug_at > now() - interval '60 minutes'");
    expect(sql).toContain("c.decoration_id IS NULL");
    expect(sql).toContain("c.building_id IS NULL");
    expect(sql).toContain("yuplink.raid_loot_bag b");
    expect(sql).toContain("yuplink.raid_plain_chest x");
    expect(sql).toContain("yuplink.raid_magic_chest x");
    // Игроку — только разведанное и не под куполом, как у мешочков.
    expect(sql).toContain("beta_raid_fog_seen");
    expect(holesNearSql({ ...near, admin: true })).not.toContain("beta_raid_fog_seen");
  });
});

describe("мои бугорки", () => {
  it("закопал я: мешочки с живой порцией и оба вида сундуков, с любого расстояния", () => {
    const sql = myMoundsSql(near);
    expect(sql).toContain("b.buried_by = 'acc_1' AND b.buried_at IS NOT NULL");
    expect(sql).toContain("life.last IS NOT NULL");
    expect(sql).toContain("yuplink.raid_plain_chest x ON");
    expect(sql).toContain("yuplink.raid_magic_chest x ON");
    expect(sql).not.toContain("BETWEEN");
  });
});
