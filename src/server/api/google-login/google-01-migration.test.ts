// Миграция google-01 (вход через Google, 29.10.2026): таблицы входа и запрет вывода
// новыми триггерами — существующие функции вывода не переписываются. Живой прогон —
// на проде с откатом (ведущий).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { GOOGLE_TG_BASE } from "@/lib/auth/googleTg";

const sql = readFileSync(
  fileURLToPath(new URL("../../../../migrations/google-01-login.sql", import.meta.url)),
  "utf8",
);
const code = sql.replace(/--[^\n]*/g, "");
const trigger = (name: string, table: string) => {
  const at = code.indexOf(`CREATE TRIGGER ${name} `, code.indexOf(`ON yuplink.${table};`));
  return code.slice(at, code.indexOf(";", at));
};

describe("google-01: база входа через Google", () => {
  it("идемпотентно и в одной транзакции", () => {
    expect(code.trim().startsWith("BEGIN;")).toBe(true);
    expect(code.trim().endsWith("COMMIT;")).toBe(true);
    const creates = code.match(/CREATE (?:SEQUENCE|TABLE|INDEX)[^\n]*/g) ?? [];
    expect(creates.length).toBe(7);
    for (const line of creates) expect(line).toContain("IF NOT EXISTS");
    for (const m of code.matchAll(/CREATE TRIGGER (\w+) [\s\S]*? ON (yuplink\.\w+)/g)) {
      expect(code).toContain(`DROP TRIGGER IF EXISTS ${m[1]} ON ${m[2]};`);
    }
  });

  it("порог Google — тот же 2^52, что в коде; id в account_google не ниже его", () => {
    expect(code).toContain(`CHECK (tg_id >= ${GOOGLE_TG_BASE})`);
    const thresholds = [...code.matchAll(/telegram_id >= (\d+)/g)].map((m) => Number(m[1]));
    expect(thresholds.length).toBeGreaterThanOrEqual(4);
    expect(new Set(thresholds)).toEqual(new Set([GOOGLE_TG_BASE]));
  });

  it("журнал входов: устройство, слепок, адрес — с индексами", () => {
    expect(code).toMatch(/google_login_log \(\s*id\s+bigserial PRIMARY KEY/);
    for (const col of ["device", "fp", "ip", "ua"])
      expect(code).toMatch(new RegExp(`\\n\\s*${col}\\s+text`));
    expect(code).toContain("ON yuplink.google_login_log (device)");
    expect(code).toContain("ON yuplink.google_login_log (fp)");
    expect(code).toContain("ON yuplink.google_login_log (ip, at)");
  });

  it("вывод закрыт новыми триггерами; функции вывода не переписаны", () => {
    for (const f of [
      "acc_withdraw_request",
      "holder_withdraw_request",
      "hero_market_withdraw",
      "darai_withdraw_limit",
    ]) {
      expect(code).not.toContain(`FUNCTION yuplink.${f}`);
    }
    const acc = trigger("acc_google_no_withdraw", "acc_ledger");
    expect(acc).toContain("BEFORE INSERT ON yuplink.acc_ledger");
    expect(acc).toContain("WHEN (NEW.kind = 'acc_withdraw')");
    // Раньше лимита DARAI: триггеры одного момента идут по имени.
    expect("acc_google_no_withdraw" < "darai_withdraw_limit").toBe(true);
    expect(trigger("google_no_withdraw", "holder_withdraw")).toContain(
      "BEFORE INSERT ON yuplink.holder_withdraw",
    );
    expect(trigger("google_no_withdraw", "redemptions")).toContain(
      "WHEN (NEW.contract_id = 'acct')",
    );
    expect(trigger("google_no_payout", "redemptions")).toContain("NEW.status = 'processing'");
    expect(trigger("google_no_payout", "nft_redemptions")).toContain("NEW.status = 'withdrawn'");
    expect(code.match(/RAISE EXCEPTION 'google_no_withdraw'/g)).toHaveLength(3);
  });
});
