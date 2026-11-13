// Доп. вывод DARAI по подписке (wd-08, владелец 01.11.2026): прибавка по самой старшей
// действующей подписке, не сумма, — сверх месячного лимита wd-07.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const sql = readFileSync("migrations/wd-08-sub-withdraw-bonus.sql", "utf8");

describe("wd-08: доп. вывод по подписке", () => {
  it("Новичок 5, Продвинутый 20, Эксперт 35, Ультра 100 млн", () => {
    for (const [id, n] of [
      ["esub_novice", 5],
      ["esub_advanced", 20],
      ["esub_expert", 35],
      ["esub_ultra", 100],
    ] as const) {
      expect(sql).toMatch(new RegExp(`WHEN '${id}'\\s+THEN\\s+${n * 1_000_000}\\b`));
    }
  });

  it("берётся самая большая из действующих, не сумма; прибавка — к лимиту месяца", () => {
    expect(sql).toContain("COALESCE(max(t.withdraw_bonus), 0)");
    expect(sql).not.toMatch(/sum\(t\.withdraw_bonus\)/);
    expect(sql).toContain("s.ends_at > now()");
    expect(sql).toContain("+ yuplink.darai_withdraw_sub_bonus(p_account);");
  });
});
