// Подтяжка турнира рыбаков: «Продажа рыбы» и «Зелья скорости» (tour-own.ts) —
// какие товары грузятся, какие очки ложатся и что очки идут через общий
// фильтр записи (scoreSql: только оплатившим и после записи).
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/db/mcpClient", () => ({ mcpExec: vi.fn() }));
vi.mock("@/server/api/beta-raid/econ/canon-key", () => ({
  marketKeysCanon: async (items: Array<{ name: string }>) =>
    items.map((i) => `custom:name:${i.name.toLowerCase()}`),
}));

import { mcpExec } from "@/server/db/mcpClient";
import { cleanTourItems } from "@/server/api/tournament/tour-admin-save";
import {
  FISH_KEYS_SQL,
  ownHistorySql,
  potionsSql,
  syncOwnPieces,
} from "@/server/api/tournament/tour-own";
import { POTION_PICK_SQL } from "@/server/api/tournament/tour-rows";

const exec = vi.mocked(mcpExec);
afterEach(() => exec.mockReset());

type H = { id: string; account_id: string; item_key: string; at_ms: number } & Record<
  string,
  unknown
>;
const h = (o: Partial<H> & Pick<H, "id" | "side" | "source" | "qty">): H => ({
  account_id: "acc_a",
  item_key: "custom:name:обычная рыба",
  at_ms: Number(o.id) * 1000,
  total: 0,
  price_cur: "gold",
  place: "m:1,2",
  counterparty: null,
  ref: null,
  // Товар категории (не только плата за него) — по умолчанию да.
  hit: true,
  ...o,
});

/** Оплаченные записи по умолчанию: acc_a записан с самого старта. */
const JOINED = [{ account_id: "acc_a", joined_ms: 0 }];

/** Подтяжка с историей history; ответ — все SQL по порядку. */
async function run(
  metric: "fish_sell" | "potion_drink",
  history: H[],
  potions = [] as object[],
  joined: object[] = JOINED,
) {
  exec.mockImplementation(async (sql: string) => {
    if (sql.includes("AS since_ms")) return [{ since_ms: 0, till_ms: 100_000, start_ms: 0 }];
    if (sql.includes("JOIN yuplink.raid_custom_item ci ON")) return potions;
    if (sql.includes("JOIN items i ON")) return history;
    if (sql.includes("AS joined_ms")) return joined;
    return [];
  });
  await syncOwnPieces("tour_fish", metric);
  return exec.mock.calls.map((c) => String(c[0]));
}

describe("продажа рыбы", () => {
  it("рыба — всё, что ловилось удочкой; грузятся товары с продажей в окне", () => {
    const sql = ownHistorySql(FISH_KEYS_SQL, "sell", 0, 1000);
    expect(sql).toContain("f.source = 'fish'");
    expect(sql).toContain("e.side = 'sell'");
    // И товары, которыми платили за рыбу (обмен); очки — только у рыбы (hit).
    expect(sql).toContain(":pay[0-9]+:[0-9]+$");
    expect(sql).toContain("j.item_key IN (SELECT item_key FROM hit) AS hit");
  });

  it("купленная самим — только проданная дороже; плата товаром — обмен, мимо", async () => {
    const R = "town:k1";
    const M = "mkt:mkt_f:acc_a:k2";
    const w = { item_key: "custom:name:пшеница", hit: false };
    const calls = await run("fish_sell", [
      h({ id: "1", source: "town", side: "buy", qty: 2, total: 60, ref: R }),
      h({ id: "2", source: "market", side: "buy", qty: 1, total: 10, ref: M }),
      h({ id: "3", ...w, source: "market", side: "pay", qty: 5, ref: `${M}:pay1:0` }),
      h({ id: "4", source: "town", side: "sell", qty: 3, total: 99 }),
      // Пшеница продана в окне, но она не рыба — очков нет.
      h({ id: "5", ...w, source: "town", side: "sell", qty: 1 }),
    ]);
    // 2 по 30 → 33: обе в плюс; третья выменяна на пшеницу — нет.
    expect(calls.at(-1)).toContain("'fsale:4', 'acc_a', 2::numeric");
    expect(calls.at(-1)).not.toContain("'fsale:5'");
  });

  it("свой улов — очко за штуку; купленное и чужое — нет", async () => {
    const calls = await run("fish_sell", [
      h({ id: "1", source: "fish", side: "take", qty: 3 }),
      h({ id: "2", source: "town", side: "buy", qty: 5, total: 50 }),
      h({ id: "3", source: "fish", side: "take", qty: 4, account_id: "acc_b" }),
      h({ id: "4", source: "wh_put", side: "put", qty: 4, account_id: "acc_b" }),
      h({ id: "5", source: "wh_take", side: "take", qty: 4 }),
      h({ id: "6", source: "town", side: "sell", qty: 12, total: 120 }),
    ]);
    const points = calls.at(-1) ?? "";
    expect(points).toContain("'fsale:6', 'acc_a', 3::numeric");
    // Очки — только оплатившим запись и после неё (общий фильтр).
    expect(points).toContain("e.paid AND src.at >= e.joined_at");
    expect(points).toContain("ON CONFLICT (tournament_id, ref) DO NOTHING");
  });

  it("пойманное до записи и проданное после — засчитано (14.10.2026: «засчитывай все»)", async () => {
    const hist = [
      h({ id: "1", source: "fish", side: "take", qty: 30 }),
      h({ id: "3", source: "fish", side: "take", qty: 2 }),
      h({ id: "4", source: "town", side: "sell", qty: 32, total: 320 }),
    ];
    // Записался между уловами (в 2 с): первый улов — тоже свой.
    const calls = await run("fish_sell", hist, [], [{ account_id: "acc_a", joined_ms: 2000 }]);
    expect(calls.at(-1)).toContain("'fsale:4', 'acc_a', 32::numeric");
    expect(calls.some((c) => c.includes("e.paid AND e.joined_at IS NOT NULL"))).toBe(true);
  });

  it("не записан — продажа не засчитывается", async () => {
    const hist = [
      h({ id: "1", source: "fish", side: "take", qty: 3 }),
      h({ id: "2", source: "town", side: "sell", qty: 3 }),
    ];
    expect((await run("fish_sell", hist, [], [])).at(-1)).not.toContain("'fsale:2'");
  });

  it("повтор подтяжки — те же ключи очков (второй раз не засчитается)", async () => {
    const hist = [
      h({ id: "1", source: "fish", side: "take", qty: 2 }),
      h({ id: "2", source: "market_sell", side: "sell", qty: 2 }),
    ];
    const a = (await run("fish_sell", hist)).at(-1);
    exec.mockReset();
    const b = (await run("fish_sell", hist)).at(-1);
    expect(a).toBe(b);
    expect(a).toContain("'fsale:2', 'acc_a', 2::numeric");
  });
});

describe("зелья скорости", () => {
  it("зелья турнира — из списка, пусто — все зелья со скоростью", () => {
    expect(potionsSql("t1")).toContain(POTION_PICK_SQL);
    expect(POTION_PICK_SQL).toContain("jsonb_array_elements_text(t.items)");
    expect(POTION_PICK_SQL).toContain(`ci.is_potion AND ci.boost @> '[{"stat": "spd"}]'`);
  });

  it("выпитое своё — очко; зелье не из списка не грузится вовсе", async () => {
    const potion = "custom:name:дурман зелье";
    const calls = await run(
      "potion_drink",
      [
        h({ id: "1", item_key: potion, source: "market", side: "buy", qty: 5, total: 10 }),
        h({ id: "2", item_key: potion, source: "drink", side: "use", qty: 4 }),
      ],
      [{ id: "cst_d", name: "Дурман зелье" }],
    );
    const hist = calls.find((s) => s.includes("JOIN items i ON")) ?? "";
    expect(hist).toContain(`IN ('${potion}')`);
    expect(hist).not.toContain("газировка");
    expect(hist).toContain("e.side = 'use'");
    expect(calls.at(-1)).toContain("'drink:2', 'acc_a', 4::numeric");
  });

  it("выпитое чужое — без очков", async () => {
    const potion = "custom:name:дурман зелье";
    const calls = await run(
      "potion_drink",
      [
        h({ id: "1", item_key: potion, source: "market", side: "buy", qty: 3, account_id: "b" }),
        h({
          id: "2",
          item_key: potion,
          source: "plain_chest",
          side: "put",
          qty: 3,
          account_id: "b",
        }),
        h({ id: "3", item_key: potion, source: "plain_chest", side: "take", qty: 3 }),
        h({ id: "4", item_key: potion, source: "drink", side: "use", qty: 3 }),
      ],
      [{ id: "cst_d", name: "Дурман зелье" }],
    );
    expect(calls.at(-1)).not.toContain("'drink:4'");
  });

  it("сваренное самим — своё и из рыбы твина; чем платили, не грузится (владелец, 14.10.2026)", async () => {
    const potion = "custom:name:дурман зелье";
    const fish = "custom:name:обычная рыба";
    const R = "mkt:mkt_d:acc_a:k1";
    const f = { item_key: fish, hit: false };
    const brew = [
      h({ id: "1", ...f, source: "fish", side: "take", qty: 2, account_id: "acc_b" }),
      h({ id: "2", ...f, source: "wh_put", side: "put", qty: 2, account_id: "acc_b" }),
      h({ id: "3", ...f, source: "wh_take", side: "take", qty: 2 }),
      h({ id: "5", ...f, source: "market", side: "pay", qty: 2, ref: `${R}:pay0:0` }),
      h({ id: "6", item_key: potion, source: "market", side: "buy", qty: 1, ref: R }),
      h({ id: "7", item_key: potion, source: "drink", side: "use", qty: 1 }),
    ];
    const list = [{ id: "cst_d", name: "Дурман зелье" }];
    const calls = await run("potion_drink", brew, list);
    const hist = calls.find((c) => c.includes("JOIN items")) ?? "";
    expect(hist).toContain(`IN ('${potion}')`);
    expect(hist).not.toContain(":pay[0-9]+:[0-9]+$");
    expect(calls.at(-1)).toContain("'drink:7', 'acc_a', 1::numeric");
  });

  it("зелий у турнира нет — история не грузится, окно отмечается", async () => {
    const calls = await run("potion_drink", []);
    expect(calls.some((s) => s.includes("JOIN items i ON"))).toBe(false);
    expect(calls.at(-1)).toContain("SET synced_at");
  });

  it("список зелий в черновике: только у «Зелий скорости», только cst_, без повторов", () => {
    expect(cleanTourItems("fish_sell", ["cst_a"])).toEqual([]);
    expect(cleanTourItems("potion_drink", ["cst_a", " cst_a ", "mkt_x", "x'; --"])).toEqual([
      "cst_a",
    ]);
  });
});
