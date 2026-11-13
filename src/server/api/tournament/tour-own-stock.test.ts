// «Продажа рыбы»: рыба на счёте до журнала (аудит 14.10.2026, tour-own-stock.ts).
// Улов и урожай до 12.10.2026 журнал не видел: продажа старого запаса уходила
// «сверх журнала» и очков не давала (жалоба игрока: оплата зелий съела известный
// улов, 23 рыбы старого запаса проданы — 0 очков). Сам список — в базе
// (settings 'tour_fish_stock'), здесь — выдуманные аккаунты.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/db/mcpClient", () => ({ mcpExec: vi.fn() }));
vi.mock("@/server/api/beta-raid/econ/canon-key", () => ({
  marketKeysCanon: async (items: Array<{ name: string }>) =>
    items.map((i) => `custom:name:${i.name.toLowerCase()}`),
}));

import { mcpExec } from "@/server/db/mcpClient";
import { STOCK_AT, loadFishStock, stockHist } from "@/server/api/tournament/tour-own-stock";
import { syncOwnPieces, type OwnHist } from "@/server/api/tournament/tour-own";

const exec = vi.mocked(mcpExec);
const FISH = "custom:name:обычная рыба";
const XWLF = "acc_test_fish01";
/** Запас игрока до журнала — «Обычная рыба». */
const OLD = 23;
const STOCK = JSON.stringify([
  [XWLF, "обычная рыба", OLD],
  ["acc_test_fish02", "обычная рыба", 7],
]);
const stockOnly = async (sql: string) =>
  sql.includes("tour_fish_stock") ? [{ value: STOCK }] : [];
beforeEach(() => exec.mockImplementation(stockOnly));
afterEach(() => exec.mockReset());

let n = 0;
const h = (o: Partial<OwnHist> & Pick<OwnHist, "side" | "source" | "qty">): OwnHist => {
  n += 1;
  return {
    id: String(n),
    account_id: XWLF,
    item_key: FISH,
    at_ms: STOCK_AT + n * 1000,
    total: 0,
    price_cur: "gold",
    place: null,
    counterparty: null,
    ref: null,
    hit: true,
    ...o,
  };
};

/** Подтяжка «Продажи рыбы» с историей rows (окно — сутки после STOCK_AT); ответ — SQL очков. */
async function sync(rows: OwnHist[]): Promise<string> {
  exec.mockImplementation(async (sql: string) => {
    if (sql.includes("tour_fish_stock")) return [{ value: STOCK }];
    if (sql.includes("AS since_ms"))
      return [{ since_ms: STOCK_AT, till_ms: STOCK_AT + 86_400_000, start_ms: STOCK_AT }];
    if (sql.includes("JOIN items i ON")) return rows;
    if (sql.includes("AS joined_ms")) return [{ account_id: XWLF, joined_ms: STOCK_AT }];
    return [];
  });
  await syncOwnPieces("tour_fish_sell", "fish_sell");
  return String(exec.mock.calls.at(-1)?.[0] ?? "");
}

describe("рыба до журнала — своя", () => {
  it("запас из базы: только своё добытое, целые штуки", async () => {
    const stock = await loadFishStock();
    expect(stock.length).toBe(2);
    for (const [acc, name, qty] of stock) {
      expect(acc).toMatch(/^acc_/);
      expect(name).toMatch(/рыб/);
      expect(Number.isInteger(qty) && qty > 0).toBe(true);
    }
  });

  it("строки — уловом на счёт в миг STOCK_AT, только по загруженным видам и не позже окна", async () => {
    const rows = await stockHist(new Set([FISH]), STOCK_AT + 1);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.item_key === FISH && r.at_ms === STOCK_AT)).toBe(true);
    expect(rows.every((r) => r.source === "fish" && r.side === "take")).toBe(true);
    expect(rows.find((r) => r.account_id === XWLF)?.qty).toBe(OLD);
    // Окно до STOCK_AT и чужие виды — ничего.
    expect(await stockHist(new Set([FISH]), STOCK_AT)).toEqual([]);
    expect(await stockHist(new Set(["custom:name:пшеница"]), STOCK_AT + 1)).toEqual([]);
  });

  it("сценарий игрока: оплата зелий съела известный улов — продажа старого запаса засчитана", async () => {
    const sale = (qty: number) => h({ source: "town", side: "sell", qty, total: qty * 0.6 });
    const rows = [
      h({ source: "fish", side: "take", qty: 46 }),
      // Отдал за зелья 46 известных журналу (плата — засчитываемое последним).
      h({ source: "market", side: "pay", qty: 46, ref: "mkt:x:pay0:0" }),
    ];
    const s = sale(OLD);
    const points = await sync([...rows, s]);
    expect(points).toContain(`'fsale:${s.id}', '${XWLF}', ${OLD}::numeric`);
    // Сверх запаса до журнала — по-прежнему не своё.
    exec.mockReset();
    const more = sale(OLD + 5);
    expect(await sync([...rows, more])).toContain(`'fsale:${more.id}', '${XWLF}', ${OLD}::numeric`);
  });
});
