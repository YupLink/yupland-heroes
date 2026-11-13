// Договор кода с migrations/promo-01-codes.sql: ввод решает база под локом
// кода — повтор, флаг, предел игроков, исчерпанный объём, бросок (шанс,
// диапазон, срез остатком), резерв и запись активации. Сторож от тихой правки.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PROMO_KINDS } from "@/lib/promo/promoTypes";
import { redeemSql } from "./promo-sql";

const SQL = readFileSync(
  fileURLToPath(new URL("../../../../migrations/promo-01-codes.sql", import.meta.url)),
  "utf8",
);
const SQL2 = readFileSync(
  fileURLToPath(new URL("../../../../migrations/promo-02-one-prize.sql", import.meta.url)),
  "utf8",
);
const flat = (s: string): string =>
  s
    .replace(/--[^\n]*/g, "")
    .replace(/\s+/g, " ")
    .trim();
const FN = flat(SQL.slice(SQL.indexOf("FUNCTION yuplink.promo_redeem("), SQL.indexOf("END $fn$")));
/** Позиция куска в теле функции: порядок шагов — часть договора. */
const at = (s: string): number => {
  const i = FN.indexOf(flat(s));
  expect(i, s).toBeGreaterThan(-1);
  return i;
};

describe("миграция promo-01: форма", () => {
  it("одна транзакция, замок не дольше 5 с, повтор безвреден", () => {
    expect(SQL).toMatch(/^BEGIN;$/m);
    expect(SQL).toMatch(/^COMMIT;$/m);
    expect(SQL).toContain("SET LOCAL lock_timeout = '5s'");
    expect(SQL).not.toMatch(/CREATE TABLE (?!IF NOT EXISTS)/);
    expect(SQL).not.toMatch(/CREATE FUNCTION/);
    expect(SQL).toContain("CREATE OR REPLACE FUNCTION yuplink.promo_redeem(");
  });

  it("виды строк в CHECK — ровно виды кода (последний CHECK — promo-02 с «Ничего»)", () => {
    const check = /kind IN \(([^)]*)\)/.exec(flat(SQL2))?.[1] ?? "";
    const kinds = check.split(",").map((s) => s.trim().replace(/'/g, ""));
    expect(new Set(kinds)).toEqual(new Set(PROMO_KINDS));
  });

  it("одна активация на аккаунт и код; удалить введённый код нельзя (FK без каскада)", () => {
    const f = flat(SQL);
    expect(f).toContain("UNIQUE (code_id, account_id)");
    expect(f).toContain("code_id text NOT NULL REFERENCES yuplink.promo_code(id), account_id");
    expect(f).toContain("REFERENCES yuplink.promo_code(id) ON DELETE CASCADE, idx");
    expect(f).toContain("CHECK (budget IS NULL OR given <= budget)");
    expect(f).toContain("CHECK (chance > 0 AND chance <= 100)");
  });
});

describe("promo_redeem: порядок шагов", () => {
  it("лок кода → прежняя активация → тот же TG → флаг → предел игроков → объём → бросок → запись", () => {
    const lock = at("SELECT * INTO c FROM yuplink.promo_code WHERE code = p_code FOR UPDATE;");
    const prev = at("SELECT * INTO prev FROM yuplink.promo_redemption");
    const tg = at(
      "r.code_id = c.id AND r.telegram_id = p_tg) THEN RETURN jsonb_build_object('error', 'used');",
    );
    const active = at("IF NOT c.active THEN RETURN jsonb_build_object('error', 'inactive');");
    const users = at("IF c.max_users IS NOT NULL AND c.used_users >= c.max_users THEN");
    const budget = at("x.budget IS NOT NULL AND x.given < x.budget");
    const roll = at("FOR l IN SELECT * FROM yuplink.promo_code_line x");
    const bump = at("UPDATE yuplink.promo_code SET used_users = used_users + 1");
    const ins = at("INSERT INTO yuplink.promo_redemption");
    expect([lock, prev, tg, active, users, budget, roll, bump, ins]).toEqual(
      [lock, prev, tg, active, users, budget, roll, bump, ins].slice().sort((a, b) => a - b),
    );
  });

  it("повтор отдаёт ту же активацию с признаком «тот же ключ»", () => {
    at("'same_op', prev.op = p_op, 'was', true");
    at("'rolled', prev.rolled, 'delivered', prev.delivered");
  });

  it("бросок: шанс в процентах, диапазон включительно, срез остатком объёма, резерв", () => {
    at("CONTINUE WHEN random() * 100 >= l.chance;");
    at("v_amt := l.amount_min + floor(random() * (l.amount_max - l.amount_min + 1))::bigint;");
    at("v_amt := LEAST(v_amt, l.budget - l.given);");
    at("CONTINUE WHEN v_amt <= 0;");
    at("UPDATE yuplink.promo_code_line SET given = given + v_amt");
  });

  it("id активации — от кода и аккаунта: одна на пару", () => {
    at("v_rid := 'prd_' || substr(md5(c.id || ':' || p_account), 1, 24);");
  });

  it("Telegram пишется в активацию и уникален на код (частичный индекс)", () => {
    at(
      "INSERT INTO yuplink.promo_redemption (id, code_id, account_id, wallet, telegram_id, op, rolled)",
    );
    at("VALUES (v_rid, c.id, p_account, p_wallet, p_tg, p_op, v_out);");
    const f = flat(SQL);
    expect(f).toContain("ADD COLUMN IF NOT EXISTS telegram_id bigint");
    expect(f).toContain(
      "CREATE UNIQUE INDEX IF NOT EXISTS promo_redemption_code_tg ON yuplink.promo_redemption (code_id, telegram_id) WHERE telegram_id IS NOT NULL",
    );
  });

  it("код зовёт функцию в том же порядке аргументов; старой перегрузки нет", () => {
    expect(SQL).toContain(
      "promo_redeem(\n  p_code text, p_account text, p_wallet text, p_op text, p_tg bigint)",
    );
    expect(SQL).toContain("DROP FUNCTION IF EXISTS yuplink.promo_redeem(text, text, text, text);");
    const call = flat(redeemSql({ code: "C", account: "A", wallet: "W", op: "O", tg: 42 }));
    expect(call).toBe("SELECT yuplink.promo_redeem('C', 'A', 'W', 'O', 42::bigint) AS res");
    const noTg = flat(redeemSql({ code: "C", account: "A", wallet: "W", op: "O", tg: null }));
    expect(noTg).toContain("'O', NULL) AS res");
  });
});

describe("promo-02: один приз по весам (владелец, 05.11.2026)", () => {
  const F2 = flat(SQL2);
  it("одной транзакцией, CHECK видов заменён целиком", () => {
    expect(SQL2).toMatch(/^BEGIN;\nSET LOCAL lock_timeout = '5s';$/m);
    expect(SQL2.trimEnd().endsWith("COMMIT;")).toBe(true);
    expect(F2).toContain("DROP CONSTRAINT IF EXISTS promo_code_line_kind_check");
  });
  it("вес строки среди строк с остатком объёма; выпадает одна; независимого броска строк нет", () => {
    expect(F2).toContain(
      "SELECT COALESCE(sum(x.chance), 0) INTO v_total FROM yuplink.promo_code_line x WHERE x.code_id = c.id AND (x.budget IS NULL OR x.given < x.budget)",
    );
    expect(F2).toContain("v_pick := random() * v_total");
    expect(F2).toContain("EXIT WHEN v_pick < 0");
    expect(F2).not.toContain("CONTINUE WHEN random() * 100 >= l.chance");
    expect(F2).toContain("v_out := jsonb_build_array(");
  });
  it("«Ничего» ничего не выдаёт, только счётчик", () => {
    expect(F2).toContain(
      "IF v_found AND v_line.kind = 'nothing' THEN UPDATE yuplink.promo_code_line SET given = given + 1",
    );
  });
});
