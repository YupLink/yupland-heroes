// Улов — в журнал сделок и в турнир «Улов» (fishing-note.ts): строки журнала
// по месту (рюкзак / мешочек у рыбака), одно очко на выдачу с ключом выпадения,
// повтор того же ключа — те же ключи (база второй раз не примет).
import { beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({
  trades: [] as Array<Array<Record<string, unknown>>>,
  points: [] as Array<[string, string, number, string]>,
  times: [] as Array<readonly number[] | undefined>,
  failJournal: false,
}));

vi.mock("@/server/api/beta-raid/econ/trade-journal", () => ({
  noteTrades: async (rows: Array<Record<string, unknown>>) => {
    if (s.failJournal) throw new Error("db down");
    s.trades.push(rows);
  },
}));
vi.mock("@/server/api/tournament/tour-note", () => ({
  noteTournament: async (
    acc: string,
    metric: string,
    qty: number,
    ref: string,
    times?: readonly number[],
  ) => {
    s.points.push([acc, metric, qty, ref]);
    s.times.push(times);
  },
}));

import {
  catchTrades,
  noteCatch,
  type CatchNote,
} from "@/server/api/beta-raid/fishing/fishing-note";

const KEY = "fish:acc1:op1:3";
const note = (items: CatchNote["items"]): CatchNote => ({
  account: "acc1",
  mapId: "map1",
  q: 4,
  r: -2,
  key: KEY,
  items,
});

beforeEach(() => Object.assign(s, { trades: [], points: [], times: [], failJournal: false }));

describe("улов в журнал", () => {
  it("в рюкзак — «take», не влезло — «put» мешочком на клетке рыбака", () => {
    const rows = catchTrades(
      note([
        { itemId: "cst_a", name: "Обычная Рыба", n: 3, dropped: 1 },
        { itemId: "cst_b", name: "Золотая Рыбка", n: 1, dropped: 0 },
      ]),
    );
    expect(rows).toEqual([
      expect.objectContaining({
        source: "fish",
        side: "take",
        itemKey: "custom:name:обычная рыба",
        qty: 2,
        ref: `${KEY}:0`,
        mapId: "map1",
        q: 4,
        r: -2,
      }),
      expect.objectContaining({ side: "put", qty: 1, ref: `${KEY}:0:bag` }),
      expect.objectContaining({ side: "take", itemKey: "custom:name:золотая рыбка", qty: 1 }),
    ]);
  });

  it("всё не влезло — только мешочек; лишнее «упало» обрезается до пойманного", () => {
    const rows = catchTrades(note([{ itemId: "cst_a", name: "Рыба", n: 2, dropped: 5 }]));
    expect(rows.map((r) => [r.side, r.qty])).toEqual([["put", 2]]);
  });
});

describe("турнир «Улов»", () => {
  it("одно очко на выдачу: вся рыба, и в рюкзак, и мешочком; ключ — ключ выпадения", async () => {
    await noteCatch(
      note([
        { itemId: "cst_a", name: "Обычная Рыба", n: 3, dropped: 2 },
        { itemId: "cst_b", name: "Редкая рыба", n: 1, dropped: 0 },
      ]),
    );
    expect(s.points).toEqual([["acc1", "fish_catch", 4, KEY]]);
    expect(s.trades).toHaveLength(1);
  });

  it("повтор той же выдачи — те же ключи: ни очко, ни строка не задвоятся", async () => {
    const o = note([{ itemId: "cst_a", name: "Рыба", n: 1, dropped: 0 }]);
    await noteCatch(o);
    await noteCatch(o);
    expect(s.points[0]).toEqual(s.points[1]);
    expect(s.trades[0]).toEqual(s.trades[1]);
  });

  it("время поимок — в очко «Улова»; строка журнала — временем первой поимки", async () => {
    const items = [{ itemId: "cst_a", name: "Рыба", n: 2, dropped: 1 }];
    await noteCatch({ ...note(items), times: [5_000, 3_000] });
    expect(s.times).toEqual([[5_000, 3_000]]);
    expect(s.trades[0].map((r) => r.at)).toEqual([3_000, 3_000]);
    // Времён не столько, сколько рыбы, — очко «сейчас», без времени.
    await noteCatch({ ...note(items), times: [5_000] });
    expect(s.times[1]).toBeUndefined();
  });

  it("сбой журнала улов не ломает и очко не теряет", async () => {
    s.failJournal = true;
    await expect(
      noteCatch(note([{ itemId: "cst_a", name: "Рыба", n: 1, dropped: 0 }])),
    ).resolves.toBeUndefined();
    expect(s.points).toEqual([["acc1", "fish_catch", 1, KEY]]);
  });
});
