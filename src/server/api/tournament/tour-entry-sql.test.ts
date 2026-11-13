// SQL записи на турнир: цена — из базы, пустая — оплачено сразу; повтор
// упирается в PK; подтверждение, гашение и снятие — только строки своей
// попытки (ключ платежа); к разбору — неоплаченные старше 2 минут и
// погашенные; журналы платы — по ключу строки цены, у лайков следа нет.
import { describe, expect, it } from "vitest";
import {
  attemptRef,
  claimSql,
  dropSql,
  evidenceSql,
  openWhere,
  paidSql,
  staleSql,
  voidRef,
  voidSql,
} from "./tour-entry-sql";

const flat = (s: string) => s.replace(/\s+/g, " ");

describe("SQL записи", () => {
  it("занять строку: цена из базы, пустая — оплачено сразу, повтор — PK", () => {
    const sql = flat(claimSql({ id: "t1", account: "a'1", wallet: "w1", payRef: "tour:t1:a'1:n" }));
    expect(sql.startsWith("WITH t AS ( SELECT t.id, t.entry_price FROM yuplink.tournament t")).toBe(
      true,
    );
    expect(sql).toContain("FOR SHARE");
    expect(sql).toContain(
      "SELECT t.id, 'a''1', now(), 0, t.entry_price = '[]'::jsonb, t.entry_price, 'tour:t1:a''1:n', 'w1' FROM t",
    );
    expect(sql).toContain("ON CONFLICT (tournament_id, account_id) DO NOTHING");
    expect(sql).toContain(
      "(e.joined_at < now() - interval '2 minutes' OR e.pay_ref LIKE '%:void') AS stale",
    );
  });

  it("к разбору — зависшие и погашенные; при удалении черновика — все его неоплаченные", () => {
    const all = flat(staleSql());
    expect(all).toContain(
      "WHERE NOT e.paid AND (e.joined_at < now() - interval '2 minutes' OR e.pay_ref LIKE '%:void')",
    );
    expect(all).toContain("e.pay_ref, e.pay_wallet");
    expect(all).toContain("t.status = 'draft' AND t.start_at IS NOT NULL AND true");
    expect(all).not.toContain("e.tournament_id =");
    const one = flat(staleSql("t'1"));
    expect(one).toContain("WHERE NOT e.paid AND e.tournament_id = 't''1' ORDER BY");
    expect(one).not.toContain("interval");
  });

  it("гашение: CAS по ключу; плательщик (force) — и оплаченную, с очками до выплаты", () => {
    expect(voidRef("r1")).toBe("r1:void");
    expect(attemptRef("r1:void")).toBe("r1");
    expect(attemptRef("r1")).toBe("r1");
    const soft = flat(voidSql("t1", "a", "r1"));
    expect(soft).toContain("SET paid = false, pay_ref = 'r1:void'");
    expect(soft).toContain("AND e.pay_ref = 'r1' AND NOT e.paid");
    expect(soft).not.toContain("tournament_point");
    const force = flat(voidSql("t1", "a", "r1", true));
    expect(force).not.toContain("NOT e.paid");
    expect(force).toContain("DELETE FROM yuplink.tournament_point x USING u, yuplink.tournament t");
    expect(force).toContain("DELETE FROM yuplink.tournament_score x USING u, yuplink.tournament t");
    expect(force).toContain("t.status IN ('draft', 'running')");
  });

  it("журналы платы: ключ строки по номеру; энергия и товар — ключ операции, у лайков — NULL", () => {
    const sql = flat(
      evidenceSql(
        [
          { resource: "gold", amount: 5 },
          { resource: "tickets", amount: 1 },
          { resource: "energy", amount: 2 },
          { resource: "item", amount: 1, itemKey: "custom:a" },
          { resource: "likes", amount: 3 },
        ],
        "tour:t1:a:n",
      ),
    );
    expect(sql).toContain(
      "FROM yuplink.res_ledger WHERE kind = 'tour_fee' AND ref = 'tour:t1:a:n:0:gold'",
    );
    expect(sql).toContain(
      "FROM yuplink.res_ledger WHERE kind = 'tour_fee_refund' AND ref = 'tour:t1:a:n:0:gold:back'",
    );
    // Строка «в билетах» платится золотом ×500 тем же ключом (§8.61); запись,
    // оплаченная билетами до выката, видна по старому журналу.
    expect(sql).toContain("res_ledger WHERE kind = 'tour_fee' AND ref = 'tour:t1:a:n:1:tickets')");
    expect(sql).toContain(
      "ticket_ledger WHERE kind = 'building' AND ref = 'tour:t1:a:n:1:tickets'",
    );
    expect(sql).toContain(
      "res_ledger WHERE kind = 'tour_fee_refund' AND ref = 'tour:t1:a:n:1:tickets:back')",
    );
    expect(sql).toContain("kind = 'raid_reward' AND ref = 'tour:t1:a:n:1:tickets:back'");
    expect(sql).toContain("raid_backpack_op WHERE op = 'pay:tour:t1:a:n:2:energy')");
    expect(sql).toContain("raid_backpack_op WHERE op = 'pay:tour:t1:a:n:2:energy:back')");
    expect(sql).toContain("raid_backpack_op WHERE op = 'pay:tour:t1:a:n:3:item:back')");
    expect(sql.match(/NULL::boolean/g)).toHaveLength(2);
  });

  it("оплачено и снятие — только строка своей попытки", () => {
    expect(flat(paidSql("t1", "a", "r1"))).toContain(
      "SET paid = true, joined_at = now() WHERE e.tournament_id = 't1' AND e.account_id = 'a' AND NOT e.paid AND e.pay_ref = 'r1'",
    );
    expect(flat(dropSql("t1", "a", "r1"))).toContain("AND NOT e.paid AND e.pay_ref = 'r1'");
  });

  it("открыт: идущий до конца (проверка — только админу) и запланированный", () => {
    const w = flat(openWhere(false));
    expect(w).toContain("t.status = 'running' AND t.ends_at > now() AND NOT t.dry");
    expect(w).toContain("t.status = 'draft' AND t.start_at IS NOT NULL");
    expect(openWhere(true)).toContain("AND true");
  });
});
