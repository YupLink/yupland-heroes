// Аукционный дом в турнире рыбаков (ревью 14.10.2026): залог и выигрыш журнал
// не пишет, подтяжка дописывает их строками «мешочка лота» (tour-own-auction.ts).
// Зелье или рыба, купленные на аукционе у другого аккаунта, — не свои.
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/db/mcpClient", () => ({ mcpExec: vi.fn() }));
vi.mock("@/server/api/beta-raid/econ/canon-key", () => ({
  marketKeysCanon: async (items: Array<{ name: string }>) =>
    items.map((i) => `custom:name:${i.name.toLowerCase()}`),
}));

import { mcpExec } from "@/server/db/mcpClient";
import { auctionRows, auctionSql } from "@/server/api/tournament/tour-own-auction";
import { ownPoints, syncOwnPieces, type OwnHist } from "@/server/api/tournament/tour-own";

const exec = vi.mocked(mcpExec);
afterEach(() => exec.mockReset());

const POTION = "custom:name:дурман зелье";
const FISH = "custom:name:обычная рыба";
const h = (o: Partial<OwnHist> & Pick<OwnHist, "id" | "side" | "source" | "qty">): OwnHist => ({
  account_id: "acc_a",
  item_key: POTION,
  at_ms: Number(o.id) * 1000,
  total: 0,
  price_cur: "gold",
  place: null,
  counterparty: null,
  ref: null,
  hit: true,
  ...o,
});

/** Лот твина acc_b: выставил в 2 с; забрал acc_a в 3 с или вернулся продавцу. */
const lot = (o: { winner?: string | null; back?: number | null; item?: string } = {}) => ({
  id: "gaucp_1",
  seller: "acc_b",
  qty: 2,
  item_id: o.item ?? "cst_d",
  name: o.item === "cst_f" ? "Обычная рыба" : "Дурман зелье",
  put_ms: 2000,
  back_ms: o.back ?? null,
  winner: o.winner === undefined ? "acc_a" : o.winner,
  win_qty: 2,
  win_ms: 3000,
});
const KEYS = new Map([
  ["cst_d", POTION],
  ["cst_f", FISH],
]);
const W = {
  start: 0,
  since: 0,
  till: 100_000,
  joined: new Map([
    ["acc_a", 0],
    ["acc_b", 0],
  ]),
};

const drunk = (rows: OwnHist[], acc: string) =>
  ownPoints("potion_drink", rows, W)
    .filter((p) => p.account === acc)
    .reduce((s, p) => s + p.qty, 0);

describe("аукционный дом — чужое остаётся чужим", () => {
  const twinBuys = h({ id: "1", source: "market", side: "buy", qty: 2, account_id: "acc_b" });

  it("зелье твина, выигранное на аукционе и выпитое, — без очков", () => {
    const drink = h({ id: "4", source: "drink", side: "use", qty: 2 });
    // Без строк аукциона выпитое — «сверх журнала», своё (так было до 14.10).
    expect(drunk([twinBuys, drink], "acc_a")).toBe(2);
    const auc = auctionRows([lot()], KEYS, new Set([POTION]), W.till);
    expect(drunk([twinBuys, ...auc, drink], "acc_a")).toBe(0);
  });

  it("лот не продан — залог вернулся продавцу: его зелье снова своё", () => {
    const auc = auctionRows([lot({ winner: null, back: 3000 })], KEYS, new Set([POTION]), W.till);
    const drink = h({ id: "4", source: "drink", side: "use", qty: 2, account_id: "acc_b" });
    expect(drunk([twinBuys, ...auc, drink], "acc_b")).toBe(2);
  });

  it("рыба продавца у победителя — не его улов", () => {
    const f = { item_key: FISH };
    const rows = [
      h({ id: "1", ...f, source: "fish", side: "take", qty: 2, account_id: "acc_b" }),
      ...auctionRows([lot({ item: "cst_f" })], KEYS, new Set([FISH]), W.till),
      h({ id: "4", ...f, source: "town", side: "sell", qty: 2, total: 2 }),
    ];
    expect(ownPoints("fish_sell", rows, W)).toEqual([]);
  });

  it("строки — только по товарам истории и до конца окна", () => {
    expect(auctionRows([lot()], KEYS, new Set([FISH]), W.till)).toEqual([]);
    const early = auctionRows([lot({ back: 5000 })], KEYS, new Set([POTION]), 2500);
    expect(early.map((r) => r.id)).toEqual(["gaucp_1:put"]);
  });

  it("залог — по ключу списания, выигрыш — по забранному подарку", () => {
    const sql = auctionSql(1000);
    expect(sql).toContain("o.op = 'pay:gauclot:' || a.id");
    expect(sql).toContain("split_part(g.source_ref, ':', 2) = a.id");
    expect(sql).toContain("g.status = 'claimed'");
  });

  it("подтяжка дописывает аукцион в историю; сбой чтения аукциона её не роняет", async () => {
    const hist = [twinBuys, h({ id: "4", source: "drink", side: "use", qty: 2 })];
    const run = async (auction: () => unknown[]) => {
      exec.mockImplementation(async (sql: string) => {
        if (sql.includes("AS since_ms")) return [{ since_ms: 0, till_ms: 100_000, start_ms: 0 }];
        if (sql.includes("FROM yuplink.auction a")) return auction();
        if (sql.includes("JOIN yuplink.raid_custom_item ci ON"))
          return [{ id: "cst_d", name: "Дурман зелье" }];
        if (sql.includes("JOIN items i ON")) return hist;
        if (sql.includes("AS joined_ms")) return [{ account_id: "acc_a", joined_ms: 0 }];
        return [];
      });
      await syncOwnPieces("tour_potion", "potion_drink");
      return String(exec.mock.calls.at(-1)?.[0] ?? "");
    };
    expect(await run(() => [lot()])).not.toContain("'drink:4'");
    exec.mockReset();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const failed = await run(() => {
      throw new Error("нет таблицы");
    });
    expect(failed).toContain("'drink:4', 'acc_a', 2::numeric");
    warn.mockRestore();
  });
});
