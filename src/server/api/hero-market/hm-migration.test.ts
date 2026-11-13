// Рынок героев: договор кода с migrations/hero-market-01.sql — то, на чём держатся
// деньги и герои. Сами функции прогнаны на живой базе в транзакции с ROLLBACK
// (сценарии: минимумы, обычный, занятые, повтор, двойное выставление, мешочек,
// покупка золотом/DARAI, повтор покупки, снятие) — здесь сторож от тихой правки.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buyCallSql, dbErrorText, opKey, refusalText, withdrawCallSql } from "./hm-call";

const SQL = readFileSync(
  fileURLToPath(new URL("../../../../migrations/hero-market-01.sql", import.meta.url)),
  "utf8",
);
const fn = (name: string): string => {
  const start = SQL.indexOf(`FUNCTION yuplink.${name}(`);
  return SQL.slice(start, SQL.indexOf("END $fn$", start));
};

describe("миграция: форма", () => {
  it("одна транзакция, замок не дольше 5 с, повтор безвреден", () => {
    expect(SQL).toMatch(/^BEGIN;$/m);
    expect(SQL).toMatch(/^COMMIT;$/m);
    expect(SQL).toContain("SET LOCAL lock_timeout = '5s'");
    expect(SQL).toContain("CREATE TABLE IF NOT EXISTS yuplink.hero_market_lot");
    expect(SQL).not.toMatch(/CREATE (UNIQUE )?INDEX (?!IF NOT EXISTS)/);
    expect(SQL).not.toMatch(/CREATE FUNCTION/);
  });

  it("одна копия — один активный лот; обычный в таблицу не попадёт", () => {
    expect(SQL).toContain("hero_market_lot_item_active");
    expect(SQL).toContain("ON yuplink.hero_market_lot (item_id) WHERE status = 'active'");
    expect(SQL).toContain("CHECK (rarity IN ('rare', 'epic', 'legendary'))");
  });
});

// Выставление в -01 — прежняя редакция (код зовёт hero-market-03: карманы основному,
// отказов dmine/worn_tool нет — hm-migration-03.test.ts). Здесь — что она не сломана.
describe("выставление (прежняя редакция -01)", () => {
  const list = fn("hero_market_list");
  it("замок копии и героя — те же ключи, что у пробуждения и выбора основного", () => {
    expect(list).toContain("hashtext('heroitem:' || p_item)");
    expect(list).toContain("hashtext('hero:' || h.id)");
  });
  it("занятые: основной, отдых, грядка, рыбалка; шахта и изношенный — до записей", () => {
    for (const e of [
      "'active'",
      "'resting'",
      "'field'",
      "'fishing'",
      "'dmine'",
      "'worn_tool'",
      "'common'",
    ])
      expect(list).toContain(e);
    expect(list.indexOf("'worn_tool'")).toBeLessThan(
      list.indexOf("INSERT INTO yuplink.raid_loot_bag"),
    );
  });
  it("DARAI — минимум × курс пула gold/Darai, вверх до целого", () => {
    expect(list).toContain("p.token_a = 'gold' AND p.token_b = 'Darai'");
    expect(list).toContain("v_min_darai := ceil(v_min * v_rate)");
  });
  it("залог — счёт '_hero_market', wallet не трогаем (штамп-триггер)", () => {
    expect(list).toContain("c_escrow constant text := '_hero_market'");
    expect(list).toMatch(
      /UPDATE yuplink\.user_game_item SET account_id = c_escrow\s+WHERE id = p_item/,
    );
  });
});

describe("покупка", () => {
  const buy = fn("hero_market_buy");
  it("замок строки лота, повтор по ключу, отказ проданному/снятому/своему", () => {
    expect(buy).toContain("WHERE id = p_lot FOR UPDATE");
    expect(buy).toContain("IF v_lot.buy_op = p_op THEN");
    for (const e of ["'lot_sold'", "'lot_withdrawn'", "'own_lot'", "'price_changed'"])
      expect(buy).toContain(e);
  });
  it("деньги ключуются лотом: золото — buy/fee/sale, DARAI — acc_spend/acc_refund + пул и корзины", () => {
    expect(buy).toContain("'hero_market_buy', 'hmkt:' || p_lot");
    expect(buy).toContain("'hero_market_fee', 'hmkt:' || p_lot");
    expect(buy).toContain("'hero_market_sale',");
    expect(buy).toContain("'acc_spend', 'hmkt:' || p_lot");
    expect(buy).toContain("'acc_refund',");
    expect(buy).toContain("'player_spend'");
    expect(buy).toContain("('sub_burn', v_burn), ('sub_dev', v_dev)");
    expect(buy).toContain("holder_darai_float");
  });
  it("герой — покупателю не основным, отряд и инструмент сброшены", () => {
    expect(buy).toContain("selected_at = NULL, squad = NULL");
    expect(buy).toContain("main_tool = NULL");
  });
});

describe("вызовы из кода", () => {
  it("аргументы функций — в порядке объявления", () => {
    // Выставление — сигнатура и вызов сверяются с -03 (hm-migration-03.test.ts).
    expect(SQL).toContain(
      "p_op text, p_account text, p_wallet text, p_item text,\n  p_price_gold numeric, p_price_darai numeric, p_mins jsonb, p_bag_hours integer",
    );
    expect(
      buyCallSql({
        op: "o",
        account: "a",
        wallet: "w",
        lotId: "l",
        currency: "gold",
        expect: 1500,
      }),
    ).toMatch(/hero_market_buy\('o', 'a', 'w',\s+'l', 'gold', 1500, 9,\s+0\.6, 0\.15\)/);
    expect(withdrawCallSql({ op: "o", account: "a", lotId: "l" })).toContain(
      "hero_market_withdraw('o', 'a', 'l')",
    );
  });

  it("ключ операции — свой у аккаунта и героя; кавычки экранируются", () => {
    expect(opKey("acc", "op1")).toBe("hm:acc:op1");
    expect(opKey("acc", "op1", "ugi_1")).toBe("hm:acc:op1:ugi_1");
    expect(withdrawCallSql({ op: "o'x", account: "a", lotId: "l" })).toContain("'o''x'");
  });

  it("отказы → ключи словаря; исключения базы → нехватка / «повтори» / «не получилось»", () => {
    expect(refusalText({ ok: false, error: "lot_sold" })).toBe("heromkt.lot_sold");
    expect(refusalText({ ok: false, error: "gold_min", min: 1000 })).toBe(
      'heromkt.gold_min|{"min":1000}',
    );
    expect(dbErrorText(new Error("res_move: в минус"))).toBe("heromkt.gold_short");
    expect(dbErrorText(new Error("not_enough_currency:Darai:10.5:300000"))).toBe(
      'heromkt.darai_short|{"need":300000,"have":10}',
    );
    expect(dbErrorText(new Error("deadlock detected"))).toBe("heromkt.busy_retry");
    expect(dbErrorText(new Error("boom"))).toBe("heromkt.failed");
  });
});
