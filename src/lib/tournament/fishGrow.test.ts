// «Продажа рыбы»: рыба со своей грядки — своя добыча (владелец, 12.10.2026),
// с чужой — нет. Когда бы ни выросла — своя (владелец, 14.10.2026: «да,
// засчитывай все»): партии до записи и до старта больше не запасы.
import { describe, expect, it } from "vitest";
import type { FlowRow } from "@/lib/tournament/flowAct";
import { FISH_SALE_RULE, pieceFlow, type PieceOpts } from "@/lib/tournament/pieceFlow";

let n = 0;
const row = (o: Partial<FlowRow> & Pick<FlowRow, "side" | "qty">): FlowRow => ({
  id: `r${String(++n).padStart(4, "0")}`,
  at: n * 10,
  account: "A",
  source: "town",
  total: 0,
  cur: "gold",
  place: "m:7,7",
  ...o,
});
const sell = (qty: number, o: Partial<FlowRow> = {}) =>
  row({ side: "sell", qty, total: qty, place: null, ...o });
/** Раскладка урожая с грядки (5,6): в личные ячейки (take) или на общую полку (put). */
const grow = (qty: number, side: "take" | "put" = "take", o: Partial<FlowRow> = {}) =>
  row({
    side,
    source: "field",
    qty,
    ref: `fw:5,6:k${n + 1}:${side === "take" ? "own" : "shared"}`,
    ...o,
  });
const takeShelf = (qty: number, o: Partial<FlowRow> = {}) =>
  row({ side: "take", source: "wh_take", qty, ...o });

const fish = (rows: FlowRow[], acc = "A", o: Partial<PieceOpts> = {}) =>
  pieceFlow(rows, { start: 0, since: 0, till: 1e9, rule: FISH_SALE_RULE, ...o })
    .filter((p) => p.account === acc)
    .reduce((s, p) => s + p.qty, 0);

describe("рыба с грядки", () => {
  it("своя грядка — да: личные ячейки склада и общая полка", () => {
    expect(fish([grow(1), grow(4), sell(5)])).toBe(5);
    expect(fish([grow(1, "put"), grow(6, "put"), takeShelf(7), sell(7)])).toBe(7);
  });

  it("чужая грядка — нет; сам хозяин урожая забрал и продал — его", () => {
    const b = { account: "B" };
    const shared = [grow(1, "put", b), grow(6, "put", b)];
    expect(fish([...shared, takeShelf(7), sell(7)])).toBe(0);
    expect(fish([...shared, takeShelf(7, b), sell(7, b)], "B")).toBe(7);
  });

  it("выросшее до записи и до старта — своё, продажа после записи засчитана", () => {
    const rows = [grow(2), grow(9), grow(3), sell(14)];
    expect(fish(rows, "A", { joined: new Map([["A", rows[1].at + 1]]) })).toBe(14);
    expect(fish(rows, "A", { start: rows[2].at + 1 })).toBe(14);
  });

  it("строки без клетки грядки (до 12.10.2026) — тоже своя грядка", () => {
    expect(fish([row({ side: "take", source: "field", qty: 4, ref: "fw:abc:own" }), sell(4)])).toBe(
      4,
    );
  });
});
