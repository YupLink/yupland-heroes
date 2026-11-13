// Отнятые шахты — строками общего списка шахт «Добычи»: только незабранные с
// несобранным, сумма с хвостом часа, без выхода в час; чужая карта подписана
// этажом или картой. Кто отнял — не читаем.
import { describe, expect, it, vi } from "vitest";

vi.mock("../../../db/mcpClient", () => ({
  mcpExec: async () => [
    {
      id: "a",
      map_id: "here",
      map_name: "Тут",
      q: 1,
      r: 2,
      resource: "wood",
      token: null,
      amount: "40",
    },
    {
      id: "b",
      map_id: "alpha",
      map_name: "Альфа",
      q: 3,
      r: 4,
      resource: "token",
      token: "Darai",
      amount: 30000,
    },
    {
      id: "c",
      map_id: "isle_x",
      map_name: null,
      q: 5,
      r: 6,
      resource: "stone",
      token: null,
      amount: 2,
    },
  ],
}));

const { lostMineRows, lostMinesSql } = await import("../mine-capture-log");

describe("отнятые шахты в списке шахт «Добычи»", () => {
  it("SQL: свои незабранные с несобранным, без нового хозяина", () => {
    const q = lostMinesSql("acc_'x");
    expect(q).toContain("WHERE l.old_account = 'acc_''x'");
    expect(q).toContain("AND l.claimed_at IS NULL");
    expect(q).toContain("AND l.amount + l.tail > 0");
    expect(q).toContain("l.amount + l.tail AS amount");
    expect(q).not.toMatch(/new_account|seen_at/);
  });

  it("строки шахт: ресурс, клетка, готово (lost), выхода нет; этаж/карта подписаны", async () => {
    const rows = await lostMineRows("acc", "here", [
      { id: "here", floor: null },
      { id: "alpha", floor: "Мир Альфа" },
    ]);
    expect(
      rows.map((x) => [x.lost?.id, x.floor, x.resource, x.token, x.lost?.amount, x.yield]),
    ).toEqual([
      ["a", null, "wood", null, 40, 0],
      ["b", "Мир Альфа", "token", "Darai", 30000, 0],
      ["c", "—", "stone", null, 2, 0],
    ]);
    expect(Object.keys(rows[0])).not.toContain("newAccount");
  });
});
