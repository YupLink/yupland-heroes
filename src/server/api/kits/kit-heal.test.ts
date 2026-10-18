// Самопочинка броней: зависшая оплаченная бронь доводится до выдачи,
// неоплаченная — снимается (kit_release вернёт деньги, если они всё же ушли);
// снятая бронь с невозвращёнными деньгами — сразу к возврату; сбой одной брони
// не мешает остальным. Выдача идёт по снимку брони: валюта, сумма, бокс.
import { beforeEach, describe, expect, it, vi } from "vitest";

const ev: string[] = [];
const sqls: string[] = [];
const st = { paid: new Set<string>(), releaseFails: new Set<string>() };

vi.mock("../../db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    sqls.push(sql.replace(/\s+/g, " "));
    const row = (id: string, status = "reserved") => ({
      id,
      status,
      token: "Darai",
      amount: "16387044.00000000",
      price_usd: "7.00",
      box_id: "cp_dragon",
      box_count: 3,
      pay_ref: `kit:acc:${id}`,
    });
    return [
      row("ko_paid"),
      row("ko_unpaid"),
      row("ko_broken"),
      row("ko_lost", "released"),
      { ...row("ko_bad"), token: "X" },
    ];
  },
}));
vi.mock("./kit-order", () => ({
  grantOrder: async (o: { id: string; token: string; amount: number; boxCount: number }) => {
    ev.push(`grant:${o.id}:${o.token}:${o.amount}:${o.boxCount}`);
    if (!st.paid.has(o.id)) throw new Error("kits.err_retry");
  },
  releaseOrder: async (id: string) => {
    ev.push(`release:${id}`);
    if (st.releaseFails.has(id)) throw new Error("MCP timeout");
    return "released";
  },
}));

const { healKitOrders } = await import("./kit-heal");

beforeEach(() => {
  ev.length = 0;
  sqls.length = 0;
  st.paid = new Set(["ko_paid"]);
  st.releaseFails = new Set(["ko_broken"]);
});

describe("самопочинка броней", () => {
  it("оплаченную — выдаёт, неоплаченную — снимает, снятую с деньгами — к возврату", async () => {
    await expect(healKitOrders()).resolves.toBe(3);
    expect(ev).toEqual([
      "grant:ko_paid:Darai:16387044:3",
      "grant:ko_unpaid:Darai:16387044:3",
      "release:ko_unpaid",
      "grant:ko_broken:Darai:16387044:3",
      "release:ko_broken",
      "release:ko_lost",
    ]);
  });

  it("ищет и висящие брони, и снятые с невозвращёнными деньгами", async () => {
    await healKitOrders();
    const sql = sqls[0];
    expect(sql).toContain("o.token, o.amount, o.price_usd, o.box_id, o.box_count");
    expect(sql).toContain("o.status = 'reserved' AND o.created_at < now() - interval '10 minutes'");
    expect(sql).toContain("o.status = 'released'");
    expect(sql).toContain("l.kind = 'acc_spend' AND l.ref = o.pay_ref");
    expect(sql).toContain(
      "NOT EXISTS (SELECT 1 FROM yuplink.acc_ledger l WHERE l.kind = 'acc_refund'",
    );
  });
});
