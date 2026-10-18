// Текст SQL дельт: фильтр валюты уходит внутрь ветки нужного леджера, и
// сборщик строк раскладывает агрегат по игрокам с группами и наваром.
import { beforeEach, describe, expect, it, vi } from "vitest";

const mcpExec = vi.fn();
vi.mock("@/server/db/mcpClient", () => ({ mcpExec: (...a: unknown[]) => mcpExec(...a) }));

import { deltaAggSql, kindLabel, ledgerOf, movementsUnionSql, tradeMarginSql } from "./deltas-sql";
import { buildDeltaRows } from "./deltas-build";

const RANGE = { from: "2026-09-01T00:00:00.000Z", to: "2026-09-08T00:00:00.000Z" };

describe("ledgerOf", () => {
  it("ресурсы, билеты, энергия, лайки — свои леджеры; прочее — токен счёта", () => {
    expect(ledgerOf("gold")).toBe("res");
    expect(ledgerOf("tickets")).toBe("ticket");
    expect(ledgerOf("Energy")).toBe("energy");
    expect(ledgerOf("likes")).toBe("likes");
    expect(ledgerOf("Darai")).toBe("acc");
  });
});

describe("movementsUnionSql", () => {
  it("без фильтра — все пять леджеров и оба лога лайков, окно по created_at", () => {
    const sql = movementsUnionSql(RANGE);
    for (const t of [
      "yuplink.acc_ledger",
      "yuplink.res_ledger",
      "yuplink.ticket_ledger",
      "yuplink.currency_ledger WHERE token = 'Energy'",
      "yuplink.like_grant_log",
      "yuplink.like_spend_log",
    ]) {
      expect(sql).toContain(t);
    }
    expect(sql).toContain(
      "created_at >= '2026-09-01T00:00:00.000Z' AND created_at < '2026-09-08T00:00:00.000Z'",
    );
    expect(sql.split("UNION ALL")).toHaveLength(6);
  });

  it("валюта задана — только её леджер, фильтр внутри ветки", () => {
    const gold = movementsUnionSql(RANGE, { currency: "gold" });
    expect(gold).toContain("yuplink.res_ledger");
    expect(gold).toContain("AND resource = 'gold'");
    expect(gold).not.toContain("acc_ledger");
    expect(gold).not.toContain("UNION ALL");
    const darai = movementsUnionSql(RANGE, { currency: "Darai" });
    expect(darai).toContain("AND token = 'Darai'");
    expect(darai).not.toContain("currency_ledger");
  });

  it("список леджеров — без энергии, когда она не нужна", () => {
    const sql = movementsUnionSql(RANGE, { ledgers: ["acc", "res"] });
    expect(sql).not.toContain("currency_ledger");
    expect(sql.split("UNION ALL")).toHaveLength(2);
  });
});

describe("deltaAggSql / tradeMarginSql / kindLabel", () => {
  it("агрегат раскладывает приход и расход фильтрами по знаку и хранит префикс ref", () => {
    const sql = deltaAggSql(RANGE);
    expect(sql).toContain("sum(delta) FILTER (WHERE delta > 0)");
    expect(sql).toContain("sum(delta) FILTER (WHERE delta < 0)");
    expect(sql).toContain("split_part(COALESCE(ref, ''), ':', 1) AS prefix");
    expect(sql).toContain("GROUP BY 1, 2, 3, 4, 5");
  });

  it("навар — продажи минус покупки по журналу, только со стоимостью", () => {
    const sql = tradeMarginSql(RANGE, "gold");
    expect(sql).toContain("yuplink.trade_journal");
    expect(sql).toContain("side IN ('buy', 'sell')");
    expect(sql).toContain("AND price_cur = 'gold'");
    expect(sql).toContain("at >= '2026-09-01T00:00:00.000Z'");
  });

  it("подпись kind: у acc_spend направление в префиксе", () => {
    expect(kindLabel("acc", "acc_spend", "mkt")).toBe("acc_spend:mkt");
    expect(kindLabel("acc", "acc_reward", "red")).toBe("acc_reward");
    expect(kindLabel("res", "market_buy", "")).toBe("market_buy");
  });
});

describe("buildDeltaRows", () => {
  beforeEach(() => mcpExec.mockReset());

  it("сводит агрегат в строки: earned/spent/net, группы, навар, имена, сортировка по |net|", async () => {
    mcpExec
      .mockResolvedValueOnce([
        {
          account_id: "A",
          currency: "gold",
          ledger: "res",
          kind: "market_sell",
          prefix: "",
          plus: "300",
          minus: 0,
          n: 3,
        },
        {
          account_id: "A",
          currency: "gold",
          ledger: "res",
          kind: "market_buy",
          prefix: "",
          plus: 0,
          minus: "-100",
          n: 2,
        },
        {
          account_id: "B",
          currency: "Darai",
          ledger: "acc",
          kind: "acc_spend",
          prefix: "portal",
          plus: 0,
          minus: "-40",
          n: 1,
        },
      ])
      .mockResolvedValueOnce([{ account_id: "A", currency: "gold", trades: "5", margin: "200" }])
      .mockResolvedValueOnce([
        { account_id: "A", telegram_id: 7, telegram_username: "alice" },
        { account_id: "B", telegram_id: 9, telegram_username: null },
      ]);
    const rows = await buildDeltaRows(RANGE);
    expect(rows.map((r) => r.accountId)).toEqual(["A", "B"]);
    expect(rows[0]).toMatchObject({
      displayName: "@alice",
      telegramUsername: "alice",
      currency: "gold",
      earned: 300,
      spent: 100,
      net: 200,
      trades: 5,
      margin: 200,
    });
    expect(rows[0].byKind).toEqual([
      { kind: "market_sell", group: "trade_sell", amount: 300, n: 3 },
      { kind: "market_buy", group: "trade_buy", amount: -100, n: 2 },
    ]);
    expect(rows[1]).toMatchObject({ displayName: "tg9", net: -40, margin: null, trades: 0 });
    expect(rows[1].byKind[0]).toEqual({
      kind: "acc_spend:portal",
      group: "sink",
      amount: -40,
      n: 1,
    });
  });

  it("журнала сделок ещё нет — дельты всё равно считаются", async () => {
    mcpExec
      .mockResolvedValueOnce([
        {
          account_id: "A",
          currency: "gold",
          ledger: "res",
          kind: "mine",
          prefix: "",
          plus: "10",
          minus: 0,
          n: 1,
        },
      ])
      .mockRejectedValueOnce(new Error('relation "yuplink.trade_journal" does not exist'))
      .mockResolvedValueOnce([]);
    const rows = await buildDeltaRows(RANGE, "gold");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ displayName: "acc:A", earned: 10, margin: null });
  });
});
