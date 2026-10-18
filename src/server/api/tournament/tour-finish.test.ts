// Финиш турнира: места, подарки призовым местам, DARAI незанятых мест в пул.
// Главное — повтор: второй финиш и доделка упавшего не дарят дважды, сгоревший
// приз не выдаётся заново, возврат в пул — один раз. Ничья — одно место на
// всех равных и призы их мест поровну. База — фейк по тексту SQL.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TourBand } from "@/lib/tournament/types";

const db = vi.hoisted(() => ({
  status: "running" as string,
  name: "Лесорубы",
  bands: [] as unknown[],
  scores: [] as Array<{ account: string; score: number; last: number }>,
  places: [] as Array<{ place: number; account_id: string }>,
  gifts: new Map<string, { accountId: string; amount: number; kind: string }>(),
  moves: new Map<string, number>(),
  failGiftsOnce: false,
  /** Проверка (TOUR_LIVE = false): места есть, призов и пула нет. */
  dry: false,
}));

vi.mock("../../db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    const s = sql.replace(/\s+/g, " ");
    if (s.includes("SET status = 'paying'")) {
      if (db.status !== "running") return [];
      db.status = "paying";
      return [{ id: "t1" }];
    }
    if (s.includes("SELECT status FROM yuplink.tournament")) return [{ status: db.status }];
    if (s.includes("INSERT INTO yuplink.tournament_place")) {
      if (db.places.length > 0) return [];
      // Как PLACE_RANK: 1 + сколько набрали больше; равные — на одном месте.
      const live = db.scores.filter((x) => x.score > 0);
      db.places = live
        .map((x) => ({
          place: 1 + live.filter((o) => o.score > x.score).length,
          account_id: x.account,
        }))
        .sort((a, b) => a.place - b.place || a.account_id.localeCompare(b.account_id));
      return [];
    }
    if (s.includes("SELECT name, bands")) return [{ name: db.name, bands: db.bands, dry: db.dry }];
    if (s.includes("SELECT place, account_id FROM yuplink.tournament_place")) {
      const max = Number(/place <= (\d+)/.exec(s)?.[1] ?? 0);
      return db.places.filter((p) => p.place <= max);
    }
    if (s.includes("SELECT source_ref FROM yuplink.player_gift")) {
      return [...db.gifts.keys()].map((source_ref) => ({ source_ref }));
    }
    if (s.includes("SET status = 'done'")) {
      if (db.status === "paying") db.status = "done";
      return [];
    }
    throw new Error(`неожиданный SQL: ${s.slice(0, 80)}`);
  },
}));
vi.mock("./tour-sync", () => ({ loadTourWork: async () => null, syncTournament: async () => {} }));
vi.mock("./tour-note", () => ({ dropTourCache: () => {} }));
vi.mock("../gifts-create", () => ({
  createGifts: async (
    list: Array<{ sourceRef: string; accountId: string; amount: number; kind: string }>,
  ) => {
    if (db.failGiftsOnce) {
      db.failGiftsOnce = false;
      // Половина пачки легла, дальше база упала.
      for (const g of list.slice(0, 1)) db.gifts.set(g.sourceRef, g);
      throw new Error("pool is closed");
    }
    for (const g of list) if (!db.gifts.has(g.sourceRef)) db.gifts.set(g.sourceRef, g);
    return list.map((g) => g.accountId);
  },
}));
vi.mock("../darai-pools-move", () => ({
  insertPoolMove: async (o: { ref: string; amount: number }) => {
    const inserted = !db.moves.has(o.ref);
    if (inserted) db.moves.set(o.ref, o.amount);
    return { inserted, opId: "op" };
  },
}));

const { finishTournament, buildGifts, leftDarai } = await import("./tour-finish");

const D = (amount: number) => ({ kind: "token" as const, amount, refId: "Darai" });
const bands: TourBand[] = [
  { places: "1", prizes: [D(1000), { kind: "resource", amount: 50, refId: "gold" }] },
  { places: "2-3", prizes: [D(300)] },
  { places: "4-5", prizes: [D(100)] },
];

beforeEach(() => {
  db.status = "running";
  db.dry = false;
  db.bands = bands;
  db.scores = [
    { account: "acc_a", score: 40, last: 2 },
    { account: "acc_b", score: 70, last: 5 },
    { account: "acc_c", score: 50, last: 1 },
    { account: "acc_z", score: 0, last: 0 },
  ];
  db.places = [];
  db.gifts = new Map();
  db.moves = new Map();
  db.failGiftsOnce = false;
});

describe("финиш", () => {
  it("места по очкам, подарок на каждый приз, незанятое — в пул", async () => {
    const res = await finishTournament("t1");
    expect(res.ok).toBe(true);
    expect(db.places.map((p) => p.account_id)).toEqual(["acc_b", "acc_c", "acc_a"]);
    expect([...db.gifts.keys()].sort()).toEqual([
      "tour:t1:1:0",
      "tour:t1:1:1",
      "tour:t1:2:0",
      "tour:t1:3:0",
    ]);
    expect(db.gifts.get("tour:t1:1:0")?.accountId).toBe("acc_b");
    // Места 4 и 5 никто не занял: их DARAI назад в пул.
    expect(db.moves.get("tour-left:t1")).toBe(200);
    expect(db.status).toBe("done");
  });

  it("повтор финиша не дарит дважды и не возвращает в пул второй раз", async () => {
    await finishTournament("t1");
    const again = await finishTournament("t1");
    expect(again.ok).toBe(false);
    // Даже подхват «зависшей» выплаты по готовому турниру ничего не делает.
    expect((await finishTournament("t1", { takeOver: true })).ok).toBe(false);
    expect(db.gifts.size).toBe(4);
    expect(db.moves.size).toBe(1);
  });

  it("упал на середине — тикер доделывает без задвоений", async () => {
    db.failGiftsOnce = true;
    await expect(finishTournament("t1")).rejects.toThrow("pool is closed");
    expect(db.status).toBe("paying");
    // Без подхвата чужую выплату не трогаем.
    expect((await finishTournament("t1")).ok).toBe(false);
    const res = await finishTournament("t1", { takeOver: true });
    expect(res.ok).toBe(true);
    expect(db.gifts.size).toBe(4);
    expect(db.moves.get("tour-left:t1")).toBe(200);
    expect(db.status).toBe("done");
  });

  it("сгоревший приз (ключ с хвостом :x:) заново не выдаётся", async () => {
    db.status = "paying";
    db.places = [{ place: 1, account_id: "acc_b" }];
    db.gifts.set("tour:t1:1:0:x:gft_old", { accountId: "acc_b", amount: 1000, kind: "token" });
    await finishTournament("t1", { takeOver: true });
    expect(db.gifts.has("tour:t1:1:0")).toBe(false);
    expect(db.gifts.has("tour:t1:1:1")).toBe(true);
  });

  it("проверка: места записаны, подарков нет, пул не тронут", async () => {
    db.dry = true;
    db.bands = [{ places: "1", prizes: [D(100)] }];
    db.scores = [{ account: "a", score: 5, last: 1 }];
    const r = await finishTournament("t1");
    expect(r).toEqual({ ok: true, gifts: 0, leftDarai: 0 });
    expect(db.places).toEqual([{ place: 1, account_id: "a" }]);
    expect(db.gifts.size).toBe(0);
    expect(db.moves.size).toBe(0);
    expect(db.status).toBe("done");
  });

  it("ничья на 1–3: одно место, доли поровну, остаток DARAI в пул; нулевые — без мест", async () => {
    db.scores = [
      { account: "acc_c", score: 70, last: 1 },
      { account: "acc_a", score: 70, last: 9 },
      { account: "acc_b", score: 70, last: 5 },
      { account: "acc_y", score: 0, last: 0 },
      { account: "acc_z", score: 0, last: 0 },
    ];
    const res = await finishTournament("t1");
    expect(db.places.map((p) => [p.place, p.account_id])).toEqual([
      [1, "acc_a"],
      [1, "acc_b"],
      [1, "acc_c"],
    ]);
    // Места 1–3: DARAI 1000 + 300 + 300 = 1600 → по 533; золото 50 → по 16.
    for (const acc of ["acc_a", "acc_b", "acc_c"]) {
      expect(db.gifts.get(`tour:t1:1:0:${acc}`)).toMatchObject({ accountId: acc, amount: 533 });
      expect(db.gifts.get(`tour:t1:1:1:${acc}`)).toMatchObject({ accountId: acc, amount: 16 });
    }
    expect(res.gifts).toBe(6);
    // Места 4–5 никто не занял (200) + остаток деления 1600 − 3 × 533 = 1.
    expect(db.moves.get("tour-left:t1")).toBe(201);
    await finishTournament("t1", { takeOver: true });
    expect(db.gifts.size).toBe(6);
  });

  it("ничья на 2–3 внутри полосы: каждому как за место, ключ с аккаунтом", async () => {
    db.scores = [
      { account: "acc_a", score: 70, last: 1 },
      { account: "acc_b", score: 50, last: 2 },
      { account: "acc_c", score: 50, last: 3 },
      { account: "acc_d", score: 10, last: 4 },
    ];
    await finishTournament("t1");
    expect(db.places.map((p) => p.place)).toEqual([1, 2, 2, 4]);
    expect(db.gifts.get("tour:t1:2:0:acc_b")?.amount).toBe(300);
    expect(db.gifts.get("tour:t1:2:0:acc_c")?.amount).toBe(300);
    expect(db.gifts.get("tour:t1:4:0")).toMatchObject({ accountId: "acc_d", amount: 100 });
    expect(db.moves.get("tour-left:t1")).toBe(100);
  });

  it("никто не набрал очков — весь фонд назад в пул, подарков нет", async () => {
    db.scores = [];
    await finishTournament("t1");
    expect(db.gifts.size).toBe(0);
    expect(db.moves.get("tour-left:t1")).toBe(1000 + 600 + 200);
  });
});

describe("чистые части финиша", () => {
  it("подарок: заголовок с местом, подпись — все награды, ключ повтора", () => {
    const gifts = buildGifts({
      id: "t9",
      name: "Шаги",
      bands,
      winners: [{ place: 2, account_id: "acc_x" }],
      given: new Set(),
    });
    expect(gifts).toHaveLength(1);
    expect(gifts[0]).toMatchObject({
      accountId: "acc_x",
      kind: "token",
      amount: 300,
      refId: "Darai",
      title: "Турнир «Шаги»: 2 место",
      sourceRef: "tour:t9:2:0",
    });
    expect(gifts[0]?.note).toContain("300 Darai");
  });

  it("DARAI незанятых мест; группа равных занимает места k..k+n−1", () => {
    const g = (place: number, ...accounts: string[]) => ({ place, accounts });
    expect(leftDarai(bands, [g(1, "a"), g(2, "b"), g(3, "c"), g(4, "d"), g(5, "e")])).toBe(0);
    expect(leftDarai(bands, [g(1, "a")])).toBe(600 + 200);
    // Трое на 3-м занимают места 3–5: 300 + 100 + 100 = 500 → по 166, 2 DARAI в пул.
    expect(leftDarai(bands, [g(1, "a"), g(2, "b"), g(3, "c", "d", "e")])).toBe(2);
  });
});
