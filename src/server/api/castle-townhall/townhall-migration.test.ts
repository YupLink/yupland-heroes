// Миграция townhall-01 (ПРАВИЛА §8.64) сходится с правилами в коде: потолок
// уровня, вид здания, лимит мест считает база по своему уровню, Храм
// альфа-тестеров (кто улучшал) выдаётся один раз и повтор безвреден.
// Сам SQL прогнан на встроенном Postgres (PGlite) с заглушками таблиц прода:
// улучшение, повтор ключа, «уровень сдвинулся», нехватка, покупка Храма и
// повтор, второй Храм, нужен уровень, лимит 15/15, декор раз и повтор (отчёт).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { TOWN_HALL_MAX_LEVEL } from "@/lib/townHall";
import { KIND_RE, TEMPLE_KIND } from "@/lib/townHallCatalog";

const sql = readFileSync(
  fileURLToPath(
    new URL("../../../../migrations/townhall-01-levels-buildings-decor.sql", import.meta.url),
  ),
  "utf8",
);

describe("миграция townhall-01", () => {
  it("одной транзакцией, чужой лок ждём не дольше 5 с", () => {
    expect(sql).toMatch(/^BEGIN;\nSET LOCAL lock_timeout = '5s';$/m);
    expect(sql.trimEnd().endsWith("COMMIT;")).toBe(true);
  });
  it("идемпотентна: только IF NOT EXISTS / OR REPLACE / ON CONFLICT", () => {
    expect(sql).not.toMatch(/CREATE TABLE (?!IF NOT EXISTS)/);
    expect(sql).not.toMatch(/CREATE (UNIQUE )?INDEX (?!IF NOT EXISTS)/);
    expect(sql).not.toMatch(/CREATE FUNCTION/);
    expect(sql).not.toMatch(/\b(DROP|DELETE|TRUNCATE|UPDATE yuplink\.castle_temple)\b/);
  });
  it("потолок уровня и вид здания — как в коде", () => {
    expect(sql).toContain(`CHECK (level BETWEEN 1 AND ${TOWN_HALL_MAX_LEVEL})`);
    expect(sql).toContain(
      `IF v_level >= ${TOWN_HALL_MAX_LEVEL} THEN RAISE EXCEPTION 'townhall_max_level'`,
    );
    const re = KIND_RE.source;
    expect(sql.split(`'${re}'`).length - 1).toBe(4);
  });
  it("лимит — по уровню из базы, в лимите Казино, Дом и Архитектор", () => {
    expect(sql).toContain("v_limit := COALESCE(p_limits[v_level], 0);");
    expect(sql).toContain("v_used := yuplink.castle_slots_used(p_account) + COALESCE(p_base, 0);");
    for (const t of ["castle_casino", "castle_auction_house", "castle_architect"])
      expect(sql).toContain(`yuplink.${t} `);
  });
  it("Храм альфа-тестеров: кто улучшал, один на аккаунт, повтор ничего не меняет", () => {
    expect(sql).toContain(`CREATE UNIQUE INDEX IF NOT EXISTS castle_building_one_temple`);
    expect(sql).toContain(`WHERE kind = '${TEMPLE_KIND}'`);
    const alpha = sql.slice(
      sql.indexOf("INSERT INTO yuplink.castle_building (account_id, kind, source, op_id)"),
    );
    expect(alpha).toContain("'temple', 'alpha', 'alpha-temple:' || t.account_id");
    expect(alpha).toContain("WHERE t.level > 1");
    expect(alpha).toContain("o.kind = 'upgrade'");
    expect(alpha).toContain("ON CONFLICT DO NOTHING;");
  });
  it("декор — один раз: ключ списания — аккаунт + вид", () => {
    expect(sql).toContain("'cdecor:' || p_account || ':' || p_kind");
    expect(sql).toContain("PRIMARY KEY (account_id, kind)");
  });
});
