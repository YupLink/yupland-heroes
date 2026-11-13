// Миграция wd-07 (ПРАВИЛА §8.53, 23.10.2026 вечер): вывод по обороту. Заведённые с кошелька —
// назад 1:1 вне лимита; трата берёт холдерские, потом заведённые; оборот — только траты в игру
// (закрытый список); лимит = max(10 млн, оборот + min(10 %, 100 млн)); $ и ★ — тем же списком;
// холдерские выводы (wdh:) — вне лимита. Живой прогон сценария — на проде с откатом.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  fileURLToPath(new URL("../../../../migrations/wd-07-darai-turnover.sql", import.meta.url)),
  "utf8",
);
const fn = (name: string) =>
  sql.slice(sql.indexOf(`FUNCTION yuplink.${name}`), sql.indexOf("END $fn$;", sql.indexOf(`FUNCTION yuplink.${name}`)));

describe("wd-07: вывод по обороту", () => {
  it("возврат траты — любой хвост, каким его пишет код", () => {
    const base = fn("darai_ref_base");
    expect(base).toContain("':undo(Part)?([2-9])$', ':p\\2'");
    expect(base).toContain("'(-undo|:back|:undo|:undoPart|:part|:partial)$'");
    // Заполнение — с начала журнала, журнал закрыт на запись на это время.
    expect(sql).toContain("LOCK TABLE yuplink.acc_ledger IN SHARE MODE;");
    expect(sql).toContain("TRUNCATE yuplink.darai_raw, yuplink.darai_raw_float, yuplink.darai_turnover, yuplink.darai_wd_part;");
  });

  it("оборот — закрытый список трат в игру; аукцион, рынок героев, вклад, лавки — нет", () => {
    const sink = fn("darai_turnover_sink");
    for (const p of ["esub", "epack", "cpack", "bankswap", "gshop", "portal", "gate", "tree", "temple"]) {
      expect(sink).toContain(`'${p}'`);
    }
    for (const p of ["gaucbid", "hmkt", "bstk", "mkt", "shop", "bankfund"]) {
      expect(sink).not.toContain(`'${p}'`);
    }
    expect(sink).toContain("p_ref NOT LIKE '%-undo'");
  });

  it("лимит: оборот + 10 % (до 100 млн), не меньше базы; $ и ★ — тем же списком", () => {
    const cap = fn("darai_withdraw_cap");
    expect(cap).toContain("RETURN GREATEST(v_base, floor(v_own + LEAST(v_own * 0.1, 100000000)))");
    expect(cap).toContain("GREATEST(0, t_prev + u_prev - w_prev) + t_cur + u_cur");
    // $ и ★ — по ключу без хвоста возврата и любым видом строки, кроме ввода/покупки звёзд/вывода.
    expect(cap.match(/darai_turnover_sink\(yuplink\.darai_ref_base\(l\.ref\)\)/g)).toHaveLength(2);
    expect(cap).toContain("l.kind NOT IN ('acc_deposit', 'acc_stars', 'acc_withdraw')");
    // $ и ★ — не больше заведённых за окно USDT и купленных звёзд.
    expect(cap).toContain("l.token = 'USDT' AND l.kind = 'acc_deposit'");
    expect(cap).toContain("l.token = 'STARS' AND l.kind = 'acc_stars'");
    // Оборот — за вычетом возвращённой доли.
    expect(cap).toContain("t.amount * GREATEST(0, 1 - t.refunded / NULLIF(t.spent, 0))");
    // Ввод DARAI с кошелька и NFT во вкладе лимит не поднимают: в формуле их нет.
    expect(cap).not.toContain("token = 'Darai'");
    expect(cap).not.toContain("bank_stake");
  });

  it("вывод: заведённые первыми и вне лимита, холдерские (wdh:) — вне лимита, части — в журнал заявки", () => {
    const lim = fn("darai_withdraw_limit");
    expect(lim).toContain("IF NEW.ref LIKE 'wdh:%' THEN RETURN NEW; END IF;");
    expect(lim).toContain("v_rawt := LEAST(v_raw, -NEW.delta);");
    expect(lim).toContain("IF v_clean > 0 AND NOT v_own_only THEN");
    expect(lim).toContain("floor(v_raw + GREATEST(0, v_cap - v_used))");
    expect(lim).toContain("'w_' || substr(md5(NEW.account_id || ':' || NEW.ref), 1, 24)");
  });

  it("трата: холдерские первыми, потом заведённые; возвраты и отмена — назад", () => {
    const f = fn("holder_darai_follow");
    expect(f).toContain("v_take := LEAST(v7 + v30, -NEW.delta);");
    expect(f).toContain("GREATEST(0, -NEW.delta - v_take)");
    expect(f).toContain("PERFORM yuplink.darai_raw_add(NEW.account_id, NEW.delta);");
    expect(f).toContain("NEW.ref LIKE 'bstk:%:out'");
    expect(f).toContain("v_back := yuplink.darai_refund_share(NEW.account_id, v_src, NEW.delta);");
    expect(f).toContain("NEW.ref LIKE 'wd-cancel:%'");
    // Вывод по-прежнему не трогает метку холдеров мимо wdh:.
    expect(f).toContain("RAISE EXCEPTION 'holder_darai_withdraw:%', v_take;");
  });
});
