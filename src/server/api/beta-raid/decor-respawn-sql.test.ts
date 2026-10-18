// Текст SQL респавна: лок отдельным оператором, CAS «декора нет», снятие и
// отсрочка тем же оператором, рассылка по базе. Смысл вердикта (что занято,
// что правка админа) сверен SELECT-ом на живой базе (только чтение); сценарии —
// decor-respawn.test.
import { describe, expect, it } from "vitest";
import { placedSql, scheduleSql, sentSql, sweepSql } from "./decor-respawn-sql";

describe("SQL прохода", () => {
  const sql = sweepSql();

  it("лок отдельным оператором; берём созревшие и ещё не вставшие", () => {
    expect(sql.startsWith("SELECT pg_advisory_xact_lock(hashtext('decor-respawn')) AS l;")).toBe(
      true,
    );
    expect(sql).toContain("WHERE d.due_at <= now() AND d.placed_at IS NULL");
  });

  it("декор встаёт только на пустую клетку и помечается тем же оператором", () => {
    expect(sql).toMatch(/SET decoration_id = v\.decor_id[\s\S]*AND c\.decoration_id IS NULL/);
    expect(sql).toMatch(/SET placed_at = now\(\)\s+FROM put p/);
  });

  it("ждущие уезжают на минуту, правка админа — снятие", () => {
    expect(sql).toMatch(
      /SET due_at = now\(\) \+ interval '1 minute'\s+FROM verdict v WHERE v\.act = 'wait'/,
    );
    expect(sql).toMatch(
      /DELETE FROM yuplink\.raid_decor_respawn d USING verdict v WHERE v\.act = 'drop'/,
    );
  });

  it("занятость: игрок, корабль, беглец, сундук; правка админа — по снимку клетки", () => {
    for (const t of [
      "beta_raid_positions",
      "beta_raid_ship",
      "beta_raid_runner",
      "raid_magic_chest",
      "raid_plain_chest",
    ])
      expect(sql).toContain(`yuplink.${t}`);
    for (const c of ["terrain", "road", "building", "group"])
      expect(sql).toContain(`s.c_${c} IS DISTINCT FROM s.${c}_id`);
    expect(sql).toContain("s.c_decor IS NOT NULL");
    // Шаблон — только «существует»: выключенный не стирает очередь.
    expect(sql).not.toMatch(/active/);
  });

  it("рост держит только стоящий сундук; мешочек и любой бугорок — нет (дополнение №5)", () => {
    const flat = sql.replace(/\s+/g, " ");
    expect(flat).toContain(
      "FROM yuplink.raid_magic_chest mc WHERE mc.map_id = u.map_id AND mc.q = u.q AND mc.r = u.r AND mc.buried_at IS NULL",
    );
    expect(flat).toContain(
      "FROM yuplink.raid_plain_chest pc WHERE pc.map_id = u.map_id AND pc.q = u.q AND pc.r = u.r AND pc.buried_at IS NULL",
    );
    // Мешочек в занятость не входит: декор встаёт поверх и перекрывает его.
    expect(flat).not.toMatch(/raid_loot_bag b WHERE b\.map_id = u\.map_id/);
  });
});

describe("SQL очереди и рассылки", () => {
  it("рубка до срока переставляет строку и сбрасывает «встал»", () => {
    const sql = scheduleSql({ mapId: "m", q: 1, r: -2, decorId: "decoration_x", minutes: 30 });
    expect(sql).toContain("now() + make_interval(mins => 30)");
    expect(sql).toContain("ON CONFLICT (map_id, q, r) DO UPDATE");
    expect(sql).toContain("placed_at = NULL");
  });

  it("рассылка знает, что под вставшим декором мешочек или бугорок (перечитать слой)", () => {
    const p = placedSql().replace(/\s+/g, " ");
    expect(p).toContain("FROM yuplink.raid_loot_bag b WHERE b.map_id = d.map_id AND b.q = d.q AND b.r = d.r");
    expect(p).toContain(") AS covered");
  });

  it("рассылка берёт клетку из базы; снимается только та же постановка", () => {
    expect(placedSql()).toContain("c.decoration_id");
    const del = sentSql([
      {
        map_id: "m",
        q: 1,
        r: -2,
        placed_at: "2026-09-28T12:00:00.123+00:00",
        here: true,
        decoration_id: "d",
      },
    ]);
    expect(del).toContain("('m', 1, -2, '2026-09-28T12:00:00.123+00:00'::timestamptz)");
    expect(del).toContain("d.placed_at = v.placed_at");
  });
});
