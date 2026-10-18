// Оператор забвения эффектом (oblivion-sql.ts) — то, на что опирается модель в
// oblivion-forget.test.ts: лок аккаунта первым оператором, живые строки по
// сроку, порядок траты «безлимит → заряд со сроком → вечный» и трата только
// следом за реально ушедшей строкой книги. Выражения выбора заряда отдельно
// прогнаны SELECT-ом на движке прода по VALUES, без таблиц; изменяющие части
// живым Postgres не исполнялись.
import { describe, expect, it } from "vitest";
import { oblivionForgetSql } from "./oblivion-sql";

describe("модель повторяет оператор", () => {
  const sql = oblivionForgetSql("acc_me", "h_me", "sp_a");
  const flat = sql.replace(/\s+/g, " ");

  it("лок аккаунта — первым оператором, владение проверяет сам оператор", () => {
    expect(sql.trim().startsWith("SELECT pg_advisory_xact_lock(hashtext('oblivion:acc_me'))")).toBe(
      true,
    );
    expect(sql).toMatch(/h\.id = 'h_me' AND h\.account_id = 'acc_me'/);
    expect(sql).not.toContain("hero_spell_cd");
  });

  it("живые строки: безлимит по сроку, заряды — по сроку и с value > 0", () => {
    expect(flat).toContain("kind = 'oblivion_time' AND expires_at > now()");
    for (const kind of ["oblivion_lvt", "oblivion_lv"]) {
      expect(flat).toContain(`kind = '${kind}' AND value > 0 AND expires_at > now()`);
    }
  });

  it("порядок: безлимит → заряд со сроком → вечный; заряд — только за ушедшей строкой", () => {
    expect(flat).toContain(
      "pick AS ( SELECT id, value FROM lvt WHERE NOT EXISTS (SELECT 1 FROM tm)",
    );
    expect(flat).toContain(
      "SELECT id, value FROM lv WHERE NOT EXISTS (SELECT 1 FROM tm) AND NOT EXISTS (SELECT 1 FROM lvt)",
    );
    expect(flat).toContain("AND (EXISTS (SELECT 1 FROM tm) OR EXISTS (SELECT 1 FROM pick))");
    expect(flat).toContain(
      "WHERE e.id = pick.id AND pick.value > 1 AND EXISTS (SELECT 1 FROM gone)",
    );
    expect(flat).toContain(
      "WHERE e.id = pick.id AND pick.value <= 1 AND EXISTS (SELECT 1 FROM gone)",
    );
  });
});
