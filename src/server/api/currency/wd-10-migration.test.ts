// Прибавка вывода — своя у каждой подписки, сразу при покупке (wd-10, владелец 07.11.2026):
// запас = прибавка тарифа на 30 дней подписки, остаток — самый большой из действующих, кончилась — сгорел.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const sql = readFileSync("migrations/wd-10-sub-bonus-per-sub.sql", "utf8");
const flat = sql.replace(/\s+/g, " ");

describe("wd-10: запас прибавки на подписку", () => {
  it("остаток — максимум по действующим, расход — с начала её 30 дней", () => {
    expect(flat).toContain("FUNCTION yuplink.darai_withdraw_sub_left(p_account text)");
    expect(flat).toContain("COALESCE(max(GREATEST(0, t.withdraw_bonus -");
    expect(flat).not.toMatch(/sum\(t\.withdraw_bonus\)/);
    expect(flat).toContain("s.ends_at > now()");
    expect(flat).toContain(
      "floor(extract(epoch FROM now() - s.starts_at) / 2592000) * interval '30 days'",
    );
    expect(flat).toContain("p.cancelled_at IS NULL");
  });

  it("обычный лимит месяца первым, сверх — запас подписки; часть пишется в sub", () => {
    expect(flat).toContain("sum(GREATEST(0, p.clean - p.sub))");
    expect(flat).toContain(
      "v_room := GREATEST(0, v_cap - yuplink.darai_withdraw_sub_bonus(NEW.account_id) - v_used);",
    );
    expect(flat).toContain("v_sub := GREATEST(0, v_clean - v_room);");
    expect(flat).toContain("IF v_sub > v_left THEN");
    expect(flat).toMatch(/INSERT INTO yuplink\.darai_wd_part \(id, account_id, raw, clean, sub\)/);
  });

  it("«только своё» берёт тот же запас, не месячную прибавку; wdh: — без прибавки", () => {
    expect(flat).toContain("ELSE yuplink.darai_withdraw_sub_left(NEW.account_id) END;");
    expect(flat).not.toContain("v_sub_month");
    expect(flat).toContain("WHEN NEW.ref LIKE 'wdh:%' THEN 0");
  });

  it("ноябрь задним числом: часть сверх обычного лимита — в sub, только где ещё 0", () => {
    expect(flat).toContain("p.at >= '2026-11-01 00:00:00+00'");
    expect(flat).toContain("GREATEST(0, n.cum - c0.cap) - GREATEST(0, n.cum - n.clean - c0.cap)");
    expect(flat).toContain("n.sub = 0");
    expect(flat).toContain("NOT EXISTS (SELECT 1 FROM yuplink.darai_withdraw_own_only o");
  });
});
