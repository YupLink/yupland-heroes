// Вода под новый корабль: корабли в клетке не мешают (владелец, 27.09), но
// пустая вода берётся первой — флот расходится по берегу. Мешает только подбитый
// (dynamite-08): его клетка занята.
import { describe, expect, it, vi } from "vitest";

const seen = vi.hoisted(() => ({ sql: "" }));

vi.mock("../../db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    seen.sql = sql;
    return [{ q: 6, r: 5 }];
  },
}));

import { freeWaterAround } from "./ships";
import { blastedHereSql } from "./ship-blasted";

describe("freeWaterAround", () => {
  it("не отбрасывает клетки с кораблями, а сортирует по их числу", async () => {
    const spot = await freeWaterAround("map_1", 5, 5, false, "small");
    expect(spot).toEqual({ q: 6, r: 5 });
    // Единственное исключение по судам — подбитый корабль; обычные клетку не держат.
    expect(seen.sql).toContain(`AND NOT ${blastedHereSql("c")}`);
    expect(seen.sql.replace(blastedHereSql("c"), "")).not.toMatch(
      /NOT EXISTS\s*\(\s*SELECT 1 FROM yuplink\.beta_raid_ship/,
    );
    expect(seen.sql).toMatch(/ORDER BY \(SELECT count\(\*\) FROM yuplink\.beta_raid_ship/);
  });

  it("малому кораблю океан по-прежнему закрыт", async () => {
    await freeWaterAround("map_1", 5, 5, false, "small");
    expect(seen.sql).toContain("AND NOT");
    const big = seen.sql;
    await freeWaterAround("map_1", 5, 5, false, "big");
    expect(seen.sql.length).toBeLessThan(big.length);
  });
});
