// Вклад NFT-холдера досрочно не снять (владелец 23.10.2026, §8.51 п. 3, bank-10):
// срок от ввода — 30 дней, если в вкладе DARAI с выводом через 30 дней, иначе 7;
// до срока закрытие отказывает целиком, окно — дата вместо кнопки.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { stakeHeld } from "./bankStake";
import { humanStakeError } from "@/server/api/bank/bank-stake";

const sql = readFileSync(
  fileURLToPath(new URL("../../migrations/bank-10-holder-lock.sql", import.meta.url)),
  "utf8",
);

describe("лок вклада холдера", () => {
  it("на сроке — держим; срок прошёл, обычный вклад или старый ответ — нет", () => {
    const now = Date.parse("2026-10-23T12:00:00Z");
    expect(stakeHeld({ holdUntil: "2026-10-27T20:26:00Z" }, now)).toBe(true);
    expect(stakeHeld({ holdUntil: "2026-10-22T20:26:00Z" }, now)).toBe(false);
    expect(stakeHeld({ holdUntil: null }, now)).toBe(false);
    expect(stakeHeld({}, now)).toBe(false);
  });

  it("отказ базы — понятная дата", () => {
    const ms = Date.parse("2026-10-27T20:26:00Z");
    expect(humanStakeError(`ERROR: bank_stake_holder_lock:${ms}`)).toBe(
      "Вклад холдера снимается не раньше 27 октября",
    );
  });

  it("SQL: 30 дней при holder30 > 0, иначе 7; отказ до начисления и до золота", () => {
    expect(sql).toContain("CASE WHEN COALESCE(p_holder30, 0) > 0");
    expect(sql).toContain("THEN 30 ELSE 7 END");
    const body = sql.slice(sql.indexOf("FUNCTION yuplink.bank_stake_close"));
    const refuse = body.indexOf("bank_stake_holder_lock");
    expect(refuse).toBeGreaterThan(0);
    expect(refuse).toBeLessThan(body.indexOf("bank_stake_accrue"));
    expect(refuse).toBeLessThan(body.indexOf("res_move"));
  });
});
