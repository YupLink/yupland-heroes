// Текст SQL респавна: лок отдельным оператором, CAS «декора нет», снятие и
// отсрочка тем же оператором, рассылка по базе. Смысл вердикта (что занято,
// что правка админа) сверен SELECT-ом на живой базе (только чтение); сценарии —
// decor-respawn.test.
import { describe, expect, it } from "vitest";
import { placedSql, scheduleSql, sentSql, sweepSql } from "./decor-respawn-sql";
import { mineCellSql } from "./mine-cell-sql";

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

  it("шахта на клетке — снятие, а не ожидание: дерево там больше не вырастает (§8.59)", () => {
    expect(sql).toContain(`${mineCellSql("c")} AS c_mine`);
    expect(sql).toMatch(/WHEN \(NOT s\.here OR NOT s\.alive OR s\.c_mine OR/);
    // Шахта не в «занято» (BUSY): ожидание крутило бы строку раз в минуту вечно.
    const busy = sql.slice(sql.indexOf("AS alive"), sql.indexOf("AS busy"));
    expect(busy).not.toContain("mine");
  });

  it("стоит гриб — ждать, а не снимать: ушёл гриб — декор отрастает (владелец 23.10)", () => {
    const flat = sql.replace(/\s+/g, " ");
    expect(flat).toContain(
      "EXISTS (SELECT 1 FROM yuplink.raid_dmine dm WHERE dm.state = 'placed' AND dm.lifted_at IS NULL AND dm.placed_map = u.map_id AND dm.placed_q = u.q AND dm.placed_r = u.r) AS mushroom",
    );
    // Гриб проверяется раньше «клетку поменяли»: его постройка не снимает строку.
    expect(flat).toMatch(/CASE WHEN s\.mushroom OR s\.planted THEN 'hold' WHEN \(NOT s\.here/);
  });

  it("посаженное дерево держит отрастание, как гриб (владелец 25.10)", () => {
    const flat = sql.replace(/\s+/g, " ");
    expect(flat).toContain(
      "COALESCE((c.decoration_id IS NOT NULL AND c.planted_decor = c.decoration_id), false) AS planted",
    );
  });

  it("гриб ушёл — таймер «Респавн, мин» с этого момента, а не сразу (владелец 23.10)", () => {
    const flat = sql.replace(/\s+/g, " ");
    // Пока гриб стоит — строка помечена held_at и проверяется раз в минуту.
    expect(flat).toContain(
      "UPDATE yuplink.raid_decor_respawn d SET due_at = now() + CASE WHEN v.planted THEN interval '30 minutes' ELSE interval '1 minute' END, held_at = now() FROM verdict v WHERE v.act = 'hold'",
    );
    // Гриба нет, а метка есть — срок заводится заново по шаблону, метка снимается.
    expect(flat).toMatch(/WHEN s\.held_at IS NOT NULL THEN 'rearm'/);
    expect(flat).toContain(
      "SET due_at = now() + make_interval(mins => v.respawn_min::int), held_at = NULL FROM verdict v WHERE v.act = 'rearm'",
    );
    expect(flat).toContain("(t.meta->'interact'->>'respawnMin')::numeric");
    // Клетку поменяли — снятие раньше перезавода.
    expect(flat.indexOf("THEN 'drop'")).toBeLessThan(flat.indexOf("THEN 'rearm'"));
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
    // Новая рубка — новый срок: прежние «держит» и «ждёт под посаженным» снимаются.
    expect(sql).toContain("held_at = NULL, under_decor = NULL");
  });

  it("рассылка знает, что под вставшим декором мешочек или бугорок (перечитать слой)", () => {
    const p = placedSql().replace(/\s+/g, " ");
    expect(p).toContain(
      "FROM yuplink.raid_loot_bag b WHERE b.map_id = d.map_id AND b.q = d.q AND b.r = d.r",
    );
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

  it("рассылка посаженного поверх ждавшего декора — строка снова ждёт его (владелец 25.10)", () => {
    const flat = sentSql([
      { map_id: "m", q: 1, r: -2, placed_at: "2026-10-25T09:00:00+00:00", here: true, decoration_id: "d" },
    ]).replace(/\s+/g, " ");
    // Сначала возврат ожиданию, потом удаление: вернувшуюся (placed_at NULL) DELETE не видит.
    expect(flat).toMatch(
      /^UPDATE yuplink\.raid_decor_respawn d SET decor_id = d\.under_decor, under_decor = NULL, placed_at = NULL, held_at = now\(\), due_at = now\(\) \+ interval '1 minute'/,
    );
    expect(flat).toContain("AND d.under_decor IS NOT NULL; DELETE FROM yuplink.raid_decor_respawn d");
  });
});
