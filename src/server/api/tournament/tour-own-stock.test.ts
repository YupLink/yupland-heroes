// «Продажа рыбы»: рыба на счёте до журнала (аудит 14.10.2026, tour-own-stock.ts).
// Улов и урожай до 12.10.2026 журнал не видел: продажа старого запаса уходила
// «сверх журнала» и очков не давала (acc_xwLf…: оплата зелий съела известный
// улов, 23 рыбы старого запаса проданы — 0 очков).
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/db/mcpClient", () => ({ mcpExec: vi.fn() }));
vi.mock("@/server/api/beta-raid/econ/canon-key", () => ({
  marketKeysCanon: async (items: Array<{ name: string }>) =>
    items.map((i) => `custom:name:${i.name.toLowerCase()}`),
}));

import { mcpExec } from "@/server/db/mcpClient";
import { FISH_STOCK, STOCK_AT, stockHist } from "@/server/api/tournament/tour-own-stock";
import { syncOwnPieces, type OwnHist } from "@/server/api/tournament/tour-own";

const exec = vi.mocked(mcpExec);
afterEach(() => exec.mockReset());

const FISH = "custom:name:обычная рыба";
const XWLF = "acc_player18";
/** Запас xwLf до журнала — «Обычная рыба». */
const OLD = FISH_STOCK.find(([a, n]) => a === XWLF && n === "обычная рыба")?.[2] ?? 0;

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
  it("запас заморожен: только своё добытое, целые штуки, у xwLf есть", () => {
    expect(OLD).toBeGreaterThan(20);
    for (const [acc, name, qty] of FISH_STOCK) {
      expect(acc).toMatch(/^acc_/);
      expect(name).toMatch(/рыб/);
      expect(Number.isInteger(qty) && qty > 0).toBe(true);
    }
  });

  it("строки — уловом на счёт в миг STOCK_AT, только по загруженным видам и не позже окна", () => {
    const rows = stockHist(new Set([FISH]), STOCK_AT + 1);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.item_key === FISH && r.at_ms === STOCK_AT)).toBe(true);
    expect(rows.every((r) => r.source === "fish" && r.side === "take")).toBe(true);
    expect(rows.find((r) => r.account_id === XWLF)?.qty).toBe(OLD);
    // Окно до STOCK_AT и чужие виды — ничего.
    expect(stockHist(new Set([FISH]), STOCK_AT)).toEqual([]);
    expect(stockHist(new Set(["custom:name:пшеница"]), STOCK_AT + 1)).toEqual([]);
  });

  it("сценарий xwLf: оплата зелий съела известный улов — продажа старого запаса засчитана", async () => {
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
