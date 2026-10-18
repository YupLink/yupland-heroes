// Текст SQL ленты: шум энергии свёрнут по дням, сделки и суточные причины
// трат в той же выборке, курсор режет по «at».
import { describe, expect, it } from "vitest";
import { feedSql } from "./feed-sql";

const RANGE = { from: "2026-09-01T00:00:00.000Z", to: "2026-09-08T00:00:00.000Z" };

describe("feedSql", () => {
  const sql = feedSql("acc'1", RANGE, null, 50);

  it("все источники в одном UNION ALL, игрок экранирован", () => {
    for (const t of [
      "yuplink.acc_ledger WHERE account_id = 'acc''1'",
      "yuplink.res_ledger WHERE account_id = 'acc''1'",
      "yuplink.ticket_ledger WHERE account = 'acc''1'",
      "yuplink.like_grant_log WHERE account_id = 'acc''1'",
      "yuplink.like_spend_log WHERE account_id = 'acc''1'",
      "yuplink.trade_journal WHERE account_id = 'acc''1'",
      "yuplink.energy_spend_daily",
    ]) {
      expect(sql).toContain(t);
    }
    expect(sql.split("UNION ALL")).toHaveLength(9);
  });

  it("шум энергии — суточными суммами, остальное построчно", () => {
    expect(sql).toContain("kind NOT IN ('energy_spend', 'energy_regen', 'energy_decay')");
    expect(sql).toContain(
      "SELECT date_trunc('day', created_at)::timestamptz, 'energy', 'Energy', sum(delta), kind, NULL",
    );
    expect(sql).toContain("kind IN ('energy_spend', 'energy_regen', 'energy_decay')");
    expect(sql).toContain("GROUP BY 1, kind");
  });

  it("причины трат энергии — строкой на день и причину", () => {
    expect(sql).toContain("'spend:' || reason");
    expect(sql).toContain("day::timestamptz >= '2026-09-01T00:00:00.000Z'");
  });

  it("сделка: знак по стороне, валюта — цена или ключ товара; плата — штуками ресурса", () => {
    expect(sql).toContain("WHEN 'buy' THEN -COALESCE(total, 0)");
    // Улов мешочком — приход, выпитое — расход (турнир рыбаков, 12.10.2026).
    expect(sql).toContain("WHEN 'put' THEN CASE source WHEN 'fish' THEN qty ELSE -qty END");
    expect(sql).toContain("WHEN 'pay' THEN -qty");
    expect(sql).toContain("WHEN 'use' THEN -qty ELSE qty END");
    expect(sql).toContain("CASE WHEN side IN ('buy', 'sell') THEN price_cur ELSE item_key END");
  });

  it("без курсора — TRUE, с курсором — at < …; порядок и лимит", () => {
    expect(sql).toContain("WHERE TRUE");
    expect(sql).toContain("ORDER BY at DESC\n      LIMIT 50;");
    const paged = feedSql("a", RANGE, "2026-09-05T00:00:00.000Z", 10);
    expect(paged).toContain("WHERE at < '2026-09-05T00:00:00.000Z'");
    expect(paged).toContain("LIMIT 10;");
  });
});
