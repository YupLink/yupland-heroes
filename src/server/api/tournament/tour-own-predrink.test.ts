// «Зелья скорости»: выпитое до журнала (аудит 14.10.2026, tour-own-predrink.ts).
// Без него учёт считал выпитое до 12.10 лежащим у игрока своим, и этот
// несуществующий запас прикрывал чужие зелья (acc_1-AzQ…: 180 очков за зелья из
// вёдер твина).
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/db/mcpClient", () => ({ mcpExec: vi.fn() }));
vi.mock("@/server/api/beta-raid/econ/canon-key", () => ({
  marketKeysCanon: async (items: Array<{ name: string }>) =>
    items.map((i) => `custom:name:${i.name.toLowerCase()}`),
}));

import { mcpExec } from "@/server/db/mcpClient";
import {
  BOOST_UNIT_BEFORE,
  DRINK_JOURNAL_FROM,
  boostUnit,
  preDrinkRows,
  preDrinkSql,
  type BoostOpRow,
} from "@/server/api/tournament/tour-own-predrink";
import { syncOwnPieces, type OwnHist } from "@/server/api/tournament/tour-own";

const exec = vi.mocked(mcpExec);
afterEach(() => exec.mockReset());

const POT = "custom:name:дурман зелье";
const CANON = "cst_qq4aygtvckaa";
const KEYS = new Map([[CANON, POT]]);
const BOOST = [{ stat: "spd", value: "8", minutes: "30" }];
const op = (o: Partial<BoostOpRow>): BoostOpRow => ({
  account_id: "acc_a",
  op: "k1",
  canon: CANON,
  boost: BOOST,
  at_ms: DRINK_JOURNAL_FROM - 1000,
  amount: 80,
  ...o,
});

describe("выпитое до журнала — из бустов героя", () => {
  it("SQL: только до журнала, без строки «выпил», аккаунт — хозяин героя", () => {
    const sql = preDrinkSql([CANON]);
    expect(sql).toContain(`IN ('item:${CANON}')`);
    expect(sql).toContain(`o.created_at < to_timestamp(${DRINK_JOURNAL_FROM} / 1000.0)`);
    expect(sql).toContain("j.ref = 'drink:' || h.account_id || ':' || o.op");
    expect(sql).toContain("JOIN yuplink.hero_instance h ON h.id = o.hero_id");
  });

  it("штук = пункты / сила штуки; прежняя сила — до смены", () => {
    expect(boostUnit(BOOST)).toBe(8);
    expect(boostUnit([{ stat: "spd", value: "1-10", minutes: "5" }])).toBe(5.5);
    expect(
      boostUnit([
        { stat: "spd", value: "10" },
        { stat: "satiety", value: "100" },
      ]),
    ).toBe(110);
    const was = BOOST_UNIT_BEFORE[CANON];
    const rows = preDrinkRows(
      [op({ op: "old", at_ms: was.until - 1, amount: 380 }), op({ op: "new", amount: 296 })],
      KEYS,
    );
    expect(rows.map((r) => [r.id, r.qty, r.side, r.source])).toEqual([
      ["pre:old", 38, "use", "drink"],
      ["pre:new", 37, "use", "drink"],
    ]);
    expect(rows[0].ref).toBe("drink:acc_a:old");
    // Чужой товар, буст без хозяина или без пунктов — мимо.
    const skip = [op({ canon: "cst_x" }), op({ account_id: "" }), op({ amount: 0 })];
    expect(preDrinkRows(skip, KEYS)).toEqual([]);
  });

  it("несуществующий запас больше не прикрывает зелья твина", async () => {
    const T = DRINK_JOURNAL_FROM;
    let n = 0;
    const h = (o: Partial<OwnHist> & Pick<OwnHist, "side" | "source" | "qty">): OwnHist => {
      n += 1;
      const at_ms = o.at_ms ?? T + n * 1000;
      return {
        id: String(n),
        account_id: "acc_a",
        item_key: POT,
        total: 10,
        price_cur: "gold",
        place: null,
        counterparty: null,
        ref: null,
        hit: true,
        ...o,
        at_ms,
      };
    };
    // До журнала купил 100 и все выпил (журнал выпитого не видит), потом твин
    // отдал 50 через полку — выпиты в турнире.
    const rows = [
      h({ source: "market", side: "buy", qty: 100, at_ms: T - 10_000 }),
      h({ source: "market", side: "buy", qty: 50, account_id: "acc_b" }),
      h({ source: "wh_put", side: "put", qty: 50, account_id: "acc_b", place: "m:45,52" }),
      h({ source: "wh_take", side: "take", qty: 50, place: "m:45,52" }),
      h({ source: "drink", side: "use", qty: 50, ref: "drink:acc_a:k9" }),
    ];
    const drink = rows[4].id;
    const sync = async (ops: BoostOpRow[]): Promise<string> => {
      exec.mockImplementation(async (sql: string) => {
        if (sql.includes("AS since_ms")) return [{ since_ms: T, till_ms: T + 1e8, start_ms: T }];
        if (sql.includes("JOIN yuplink.raid_custom_item ci ON"))
          return [{ id: CANON, name: "Дурман зелье" }];
        if (sql.includes("JOIN items i ON")) return rows;
        if (sql.includes("AS joined_ms")) return [{ account_id: "acc_a", joined_ms: T }];
        if (sql.includes("FROM yuplink.hero_boost_op o")) return ops;
        return [];
      });
      await syncOwnPieces("tour_potion_drink", "potion_drink");
      return String(exec.mock.calls.at(-1)?.[0] ?? "");
    };
    // Без бустов до журнала 100 «своих» ещё «лежат» — зелья твина засчитаны.
    expect(await sync([])).toContain(`'drink:${drink}', 'acc_a', 50::numeric`);
    exec.mockReset();
    // С ними — свои выпиты до журнала, выпитое в турнире — твина: очков нет.
    const pre = await sync([op({ at_ms: T - 5000, amount: 800 })]);
    expect(exec.mock.calls.some((c) => String(c[0]).includes("hero_boost_op"))).toBe(true);
    expect(pre).not.toContain(`'drink:${drink}'`);
  });
});
