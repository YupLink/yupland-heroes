// Миграция minev2-20 (постановка шахт): первичная разметка «дерево/гора» — один
// раз, при появлении колонки; правила имён проверены на настоящих названиях
// декора с прода (20.10.2026); функция соседей и ключи нажатий — идемпотентно.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  fileURLToPath(new URL("../../../../../migrations/minev2-20-placement.sql", import.meta.url)),
  "utf8",
);

/** Регулярка из «WHEN d.name ~* '…' THEN '<nature>'» — тем же текстом, что увидит база. */
function nameRule(nature: "tree" | "mountain"): RegExp {
  const m = new RegExp(`WHEN d\\.name ~\\* '([^']+)'\\s+THEN '${nature}'`).exec(sql);
  if (!m) throw new Error(`нет правила имени для ${nature}`);
  return new RegExp(m[1], "i");
}

describe("миграция minev2-20", () => {
  it("BEGIN/COMMIT; разметка — только когда колонки ещё нет", () => {
    expect(sql.trimStart().startsWith("--")).toBe(true);
    expect(sql).toContain("BEGIN;");
    expect(sql.trimEnd().endsWith("COMMIT;")).toBe(true);
    expect(sql).toMatch(/IF NOT EXISTS \(\s*SELECT 1 FROM information_schema\.columns/);
    expect(sql).toContain("ADD COLUMN nature text");
    expect(sql).toContain("WHERE yuplink.raid_asset_tags.nature IS NULL");
  });

  it("соседи — шесть клеток; гора — ещё и местность «Горы»/«Высокогорье»", () => {
    expect(sql).toContain("CREATE OR REPLACE FUNCTION yuplink.raid_nature_around");
    expect(sql).toContain("(VALUES (1, 0), (-1, 0), (0, 1), (0, -1), (1, -1), (-1, 1))");
    const terrain = /tt\.name ~\* '([^']+)'/.exec(sql)?.[1] ?? "";
    const re = new RegExp(terrain.replace(/\\s/g, "\\s"), "i");
    for (const name of ["Горы", "Высокогорье"]) expect(re.test(name), name).toBe(true);
    for (const name of ["трава с холмами", "Подземелье Дракона"]) expect(re.test(name)).toBe(false);
  });

  it("ключи нажатий — своя таблица с отметкой рассылки (и у таблицы раннего прогона)", () => {
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS yuplink.raid_mine_place_op");
    expect(sql).toMatch(/at\s+timestamptz NOT NULL DEFAULT now\(\),\s+sent_at\s+timestamptz\s*\)/);
    expect(sql).toContain(
      "ALTER TABLE yuplink.raid_mine_place_op ADD COLUMN IF NOT EXISTS sent_at timestamptz;",
    );
    expect(sql).toMatch(
      /CREATE INDEX IF NOT EXISTS raid_mine_place_op_unsent\s+ON yuplink\.raid_mine_place_op \(at\) WHERE sent_at IS NULL;/,
    );
  });

  it("деревья по имени: и нерубимые ели/пальмы; не мельница", () => {
    const tree = nameRule("tree");
    for (const name of [
      "Дерево север",
      "Елка север",
      "Елка юпик",
      "Кабанье дерево",
      "Мед ель",
      "Нелесная Ель",
      "Пальмы",
      "Дерево Гречи 2",
      "Древо ада",
    ])
      expect(tree.test(name), name).toBe(true);
    for (const name of ["Мельница", "Колодец", "Кусты - Пустыня", "Гора - ад", "Камни"])
      expect(tree.test(name), name).toBe(false);
  });

  it("горы по имени: гора/горы, но не «городок»", () => {
    const mountain = nameRule("mountain");
    for (const name of [
      "Гора - ад",
      "Горы",
      "Горы - земли",
      "Подземная гора",
      "Снежная гора",
      "Гора единорога",
    ])
      expect(mountain.test(name), name).toBe(true);
    for (const name of ["Палаточный городок - земли", "Город", "Подземный столб", "Вулкан"])
      expect(mountain.test(name), name).toBe(false);
  });
});
