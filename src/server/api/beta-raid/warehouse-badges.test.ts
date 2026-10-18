// Бейдж склада считает ЕДИНИЦЫ товара, а не ячейки (владелец 21.09: «над
// складом цифра = занятые ячейки, а не сколько единиц товара лежит»).
// Проверяем по ТЕКСТУ запроса, как flee-sql.test: правило живёт в SQL-строке.
import { describe, expect, it, vi } from "vitest";

vi.mock("../../db/mcpClient", () => ({ mcpExec: vi.fn() }));

import { toWarehouseBadges, warehouseBadgesSql } from "./warehouse-badges";

describe("warehouseBadgesSql: единицы, не ячейки", () => {
  const sql = warehouseBadgesSql("rmap_x", "owner_account = 'acc_a'");

  it("сумма count до сотых по личной и по общей полке — дробь не теряется", () => {
    expect(sql).toContain("round(sum(count) FILTER (WHERE scope = 'own'), 2)");
    expect(sql).toContain("round(sum(count) FILTER (WHERE scope = 'shared'), 2)");
    expect(sql).not.toContain("floor(");
  });

  it("ячейки (ceil(count/20)) больше не считает", () => {
    expect(sql).not.toContain("ceil(");
  });

  it("чужие личные полки отсекает по WHERE, а не на клиенте", () => {
    expect(sql).toContain("scope = 'shared' OR owner_account = 'acc_a'");
    expect(sql).toContain("map_id = 'rmap_x'");
  });
});

describe("toWarehouseBadges", () => {
  it("(28,45): Молоко 40 на личной полке → «40», общей нет", () => {
    expect(toWarehouseBadges([{ q: 28, r: 45, own_units: 40, shared_units: 0 }])).toEqual({
      "28,45": { own: 40, shared: 0 },
    });
  });

  it("числа строками из JSON приводятся к числу", () => {
    expect(
      toWarehouseBadges([{ q: "-122", r: "131", own_units: "0", shared_units: "55" }]),
    ).toEqual({ "-122,131": { own: 0, shared: 55 } });
  });

  it("склад без единиц к сбору в ответ не попадает", () => {
    expect(toWarehouseBadges([{ q: 1, r: 2, own_units: 0, shared_units: 0 }])).toEqual({});
  });

  it("полка с 0,04 огурцов — ячейка занята, бейдж «0.04» есть", () => {
    expect(toWarehouseBadges([{ q: -43, r: 93, own_units: "0.04", shared_units: 0 }])).toEqual({
      "-43,93": { own: 0.04, shared: 0 },
    });
  });
});
