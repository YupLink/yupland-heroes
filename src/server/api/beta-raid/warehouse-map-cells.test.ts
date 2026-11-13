// Склады карты: один запрос на 30 с, сброс по тиру, сбой не кэшируется.
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ calls: 0, fail: false }));
vi.mock("../../db/mcpClient", () => ({
  mcpExec: async () => {
    db.calls++;
    if (db.fail) throw new Error("bridge timeout");
    return [{ q: 1, r: 2 }];
  },
}));

const { warehouseCells, forgetWarehouseCells, WAREHOUSE_CELLS_TTL_MS } =
  await import("./warehouse-map-cells");

beforeEach(() => {
  db.calls = 0;
  db.fail = false;
  forgetWarehouseCells("m");
});

describe("кэш складов карты", () => {
  it("в пределах 30 с — один запрос к базе", async () => {
    expect(await warehouseCells("m", 1000)).toEqual([{ q: 1, r: 2 }]);
    await warehouseCells("m", 1000 + WAREHOUSE_CELLS_TTL_MS - 1);
    expect(db.calls).toBe(1);
    await warehouseCells("m", 1000 + WAREHOUSE_CELLS_TTL_MS);
    expect(db.calls).toBe(2);
  });

  it("новый тир постройки сбрасывает кэш", async () => {
    await warehouseCells("m", 1000);
    forgetWarehouseCells("m");
    await warehouseCells("m", 1001);
    expect(db.calls).toBe(2);
  });

  it("сбой — пустой список и следующий вызов идёт в базу", async () => {
    db.fail = true;
    expect(await warehouseCells("m", 1000)).toEqual([]);
    db.fail = false;
    expect(await warehouseCells("m", 1001)).toEqual([{ q: 1, r: 2 }]);
    expect(db.calls).toBe(2);
  });
});
