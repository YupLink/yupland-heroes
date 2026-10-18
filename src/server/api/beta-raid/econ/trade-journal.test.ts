// Журнал сделок: строка INSERT собирается с ON CONFLICT DO NOTHING (ретраи
// моста), кавычки экранируются, пустые поля уходят NULL-ами, а сбой базы
// не долетает до сделки (console.warn, не бросок).
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../db/mcpClient", () => ({ mcpExec: vi.fn() }));

import { mcpExec } from "../../../db/mcpClient";
import { noteTrade, noteTrades, tradeJournalSql, type TradeNote } from "./trade-journal";

const exec = vi.mocked(mcpExec);

const buy: TradeNote = {
  accountId: "acc_1",
  counterparty: "shop",
  mapId: "map_a",
  q: 28,
  r: 45,
  source: "market",
  side: "buy",
  itemKey: "custom:name:молоко",
  itemName: "Молоко",
  qty: 12,
  priceUnit: 40,
  priceCur: "gold",
  total: 480,
  ref: "mkt:mkt_1:acc_1:zz",
};

afterEach(() => {
  exec.mockReset();
});

describe("trade-journal.tradeJournalSql", () => {
  it("одна строка: все колонки, ON CONFLICT по (source, ref) с предикатом индекса", () => {
    const sql = tradeJournalSql([buy]);
    expect(sql).toContain("INSERT INTO yuplink.trade_journal");
    expect(sql).toContain("ON CONFLICT (source, ref) WHERE ref IS NOT NULL DO NOTHING");
    expect(sql).toContain(
      "('acc_1', 'shop', 'map_a', 28, 45, 'market', 'buy', 'custom:name:молоко', 'Молоко', 12, 40, 'gold', 480, 'mkt:mkt_1:acc_1:zz')",
    );
  });

  it("кавычка в имени и ключе удваивается — SQL не ломается", () => {
    const sql = tradeJournalSql([{ ...buy, itemName: "O'Neil", itemKey: "custom:name:o'neil" }]);
    expect(sql).toContain("'O''Neil'");
    expect(sql).toContain("'custom:name:o''neil'");
  });

  it("пустые поля — NULL, а не 'undefined'; координаты целые", () => {
    const sql = tradeJournalSql([
      {
        accountId: "acc_2",
        source: "wh_take",
        side: "take",
        itemKey: "resource:gold",
        qty: 3.5,
        q: 1.9,
      },
    ]);
    expect(sql).toContain(
      "('acc_2', NULL, NULL, 1, NULL, 'wh_take', 'take', 'resource:gold', NULL, 3.5, NULL, NULL, NULL, NULL)",
    );
    expect(sql).not.toContain("undefined");
  });

  it("несколько строк — один INSERT с VALUES через запятую", () => {
    const sql = tradeJournalSql([buy, { ...buy, side: "sell", ref: "mkt-sell:x" }]);
    expect(sql.match(/INSERT INTO/g)?.length).toBe(1);
    expect(sql).toContain("'mkt:mkt_1:acc_1:zz'),");
    expect(sql).toContain("'mkt-sell:x')");
  });

  it("время строки задано (улов — время поимки) — оно; у соседей без времени — now()", () => {
    const sql = tradeJournalSql([
      { ...buy, at: 1_700_000_000_000 },
      { ...buy, ref: "x" },
    ]);
    expect(sql).toContain("total, ref, at)");
    expect(sql).toContain("'mkt:mkt_1:acc_1:zz', to_timestamp(1700000000000 / 1000.0))");
    expect(sql).toContain("'x', now())");
    // Без времени у всех — колонки at нет вовсе: SQL прежний.
    expect(tradeJournalSql([buy])).not.toContain("ref, at)");
  });
});

describe("trade-journal.noteTrade(s)", () => {
  it("пишет одним mcpExec без JSON-обёртки", async () => {
    exec.mockResolvedValueOnce([]);
    await noteTrade(buy);
    expect(exec).toHaveBeenCalledTimes(1);
    expect(exec.mock.calls[0][1]).toEqual({ wrapJson: false });
  });

  it("негодные строки (без аккаунта, без товара, qty ≤ 0) отсеиваются молча", async () => {
    await noteTrades([
      { ...buy, accountId: "" },
      { ...buy, itemKey: "" },
      { ...buy, qty: 0 },
    ]);
    expect(exec).not.toHaveBeenCalled();
  });

  it("сбой базы — console.warn с источником, наружу ничего не летит", async () => {
    exec.mockRejectedValueOnce(new Error("relation does not exist"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(noteTrade(buy)).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith("trade-journal", "market", "relation does not exist");
    warn.mockRestore();
  });
});
