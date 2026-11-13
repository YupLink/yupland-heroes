// Раскладка склада по плиткам: дробный стек не должен рассыпаться в
// float-мусор — подпись плитки и qty запроса «забрать» берутся отсюда.
import { describe, it, expect } from "vitest";
import { buildCells, ownCellItems } from "./warehouseGrid";
import { CELL_SIZE } from "@/lib/warehouseCells";

describe("buildCells", () => {
  it("ячейка и 0,79 → две плитки: полная и 0,79, без хвоста", () => {
    const cells = buildCells(
      [{ stackKey: "custom:x", name: "Огурцы", image: null, count: CELL_SIZE + 0.79, cells: 2 }],
      2,
    );
    expect(cells.map((c) => c?.units)).toEqual([CELL_SIZE, 0.79]);
  });

  it("крошка 0,000455 — не «0/N»: плитка несёт настоящее количество", () => {
    const tiny = Number("0.000454660540250266");
    const [c] = buildCells(
      [{ stackKey: "custom:soda", name: "Газировка", image: null, count: tiny, cells: 1 }],
      1,
    );
    expect(c?.units).toBe(0.000454661);
  });

  it("длинная дробь с наград: последняя плитка — точный хвост, а не тысячные", () => {
    const cells = buildCells(
      [
        {
          stackKey: "custom:soda",
          name: "Газировка",
          image: null,
          count: CELL_SIZE + 7.738083231472352,
          cells: 2,
        },
      ],
      2,
    );
    expect(cells.map((c) => c?.units)).toEqual([CELL_SIZE, 7.738083231]);
  });

  it("добивает пустыми до ёмкости", () => {
    const cells = buildCells([], 3);
    expect(cells).toEqual([null, null, null]);
  });
});

describe("ownCellItems", () => {
  it("ячейка и 0,79 на полке → [полная, 0,79]; «зреет» только на последней", () => {
    const out = ownCellItems([{ stackKey: "custom:x", whole: CELL_SIZE + 0.79, frac: 0.3 }]);
    expect(out.map((c) => c.whole)).toEqual([CELL_SIZE, 0.79]);
    expect(out.map((c) => c.frac)).toEqual([0, 0.3]);
  });

  it("крошка на полке забирается: whole не округляется в ноль", () => {
    const out = ownCellItems([{ stackKey: "custom:soda", whole: 0.000454661, frac: 0 }]);
    expect(out.map((c) => c.whole)).toEqual([0.000454661]);
  });

  it("на полке пусто, зреет 0,3 — одна плитка с нулём на полке", () => {
    const out = ownCellItems([{ stackKey: "custom:x", whole: 0, frac: 0.3 }]);
    expect(out).toHaveLength(1);
    expect(out[0].whole).toBe(0);
    expect(out[0].frac).toBe(0.3);
  });
});
