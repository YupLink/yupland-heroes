// Окно турниров: подпись «осталось», строка статуса, склейка страниц таблицы, призы.
import { describe, expect, it } from "vitest";
import type { TourLeaderPage, TourLeaderRow, TourPlate } from "@/lib/tournament/types";
import {
  bandsByPlace,
  formatScore,
  mergeTourPages,
  nextTourOffset,
  placesText,
  plateLeftLabel,
  pointsKey,
  prizeText,
  statusLine,
  tourLeftLabel,
} from "./tourView";

const NOW = Date.parse("2026-10-03T12:00:00Z");
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const at = (ms: number) => new Date(NOW + ms).toISOString();

describe("осталось N д N ч", () => {
  it("дни и часы, затем часы и минуты, затем минуты", () => {
    expect(tourLeftLabel(at(6 * DAY + 23 * HOUR + 59 * MIN), NOW)).toEqual({
      key: "tour.left_dh",
      params: { d: 6, h: 23 },
    });
    expect(tourLeftLabel(at(DAY), NOW)).toEqual({ key: "tour.left_dh", params: { d: 1, h: 0 } });
    expect(tourLeftLabel(at(5 * HOUR + 7 * MIN + 30_000), NOW)).toEqual({
      key: "tour.left_hm",
      params: { h: 5, m: 7 },
    });
    expect(tourLeftLabel(at(42 * MIN), NOW)).toEqual({ key: "tour.left_m", params: { m: 42 } });
  });

  it("последние секунды — «1 мин», конец прошёл — «подводим итоги»", () => {
    expect(tourLeftLabel(at(20_000), NOW)).toEqual({ key: "tour.left_m", params: { m: 1 } });
    expect(tourLeftLabel(at(0), NOW)).toEqual({ key: "tour.finishing" });
    expect(tourLeftLabel(at(-HOUR), NOW)).toEqual({ key: "tour.finishing" });
  });

  it("нет даты или мусор — без подписи", () => {
    expect(tourLeftLabel(null, NOW)).toBeNull();
    expect(tourLeftLabel("не дата", NOW)).toBeNull();
  });

  it("плашка: идёт — «осталось», paying — итоги, завершён — без подписи", () => {
    const base: TourPlate = {
      id: "1",
      name: "Неделя урона",
      metric: "damage",
      status: "running",
      startedAt: at(-DAY),
      endsAt: at(2 * DAY + 3 * HOUR),
      finishedAt: null,
      players: 5,
      myPlace: null,
      myScore: null,
      bands: [],
      startAt: null,
      endAt: null,
      joined: false,
      entryPrice: [{ resource: "gold", amount: 5 }],
    };
    expect(plateLeftLabel(base, NOW)).toEqual({ key: "tour.left_dh", params: { d: 2, h: 3 } });
    expect(plateLeftLabel({ ...base, status: "paying" }, NOW)).toEqual({ key: "tour.finishing" });
    expect(plateLeftLabel({ ...base, status: "done" }, NOW)).toBeNull();
  });
});

const row = (place: number, mine = false): TourLeaderRow => ({
  place,
  name: `p${place}`,
  score: 1000 - place,
  mine,
});
const page = (from: number, n: number, total: number, mine: TourLeaderRow | null = null) => ({
  rows: Array.from({ length: n }, (_, i) => row(from + i, mine?.place === from + i)),
  mine,
  total,
});

describe("склейка страниц таблицы", () => {
  it("следующее смещение — по 20, пока не кончилась таблица", () => {
    expect(nextTourOffset([])).toBe(0);
    expect(nextTourOffset([page(1, 20, 55)])).toBe(20);
    expect(nextTourOffset([page(1, 20, 55), page(21, 20, 55)])).toBe(40);
    expect(nextTourOffset([page(1, 20, 55), page(21, 20, 55), page(41, 15, 55)])).toBeUndefined();
    expect(nextTourOffset([page(1, 20, 20)])).toBeUndefined();
    expect(nextTourOffset([page(1, 12, 30)])).toBeUndefined();
  });

  it("страницы идут подряд в порядке сервера", () => {
    const v = mergeTourPages([page(1, 20, 45), page(21, 20, 45)]);
    expect(v.rows.map((r) => r.place)).toEqual(Array.from({ length: 40 }, (_, i) => i + 1));
    expect(v.total).toBe(45);
    expect(v.hasMore).toBe(true);
  });

  it("с очками → без очков: места, за ними записавшиеся без места", () => {
    const none = (name: string, mine = false): TourLeaderRow => ({
      place: null,
      name,
      score: 0,
      mine,
    });
    const tail: TourLeaderPage = {
      rows: [row(21), row(22), none("a"), none("b", true), none("c")],
      mine: null,
      total: 25,
    };
    const v = mergeTourPages([page(1, 20, 25), tail]);
    expect(v.rows.slice(18).map((r) => r.place)).toEqual([19, 20, 21, 22, null, null, null]);
    expect(v.rows.map((r) => r.name).slice(-3)).toEqual(["a", "b", "c"]);
    expect(v.rows.slice(-3).every((r) => r.score === 0)).toBe(true);
    expect(v.mine).toBeNull();
    expect(v.hasMore).toBe(false);
    // Только записавшиеся без очков — строки без мест, а не «пусто».
    const fresh = mergeTourPages([{ rows: [none("x"), none("y")], mine: null, total: 2 }]);
    expect(fresh.rows.map((r) => r.place)).toEqual([null, null]);
  });

  it("я записан без очков и ниже загруженного — закреплён без места", () => {
    const me: TourLeaderRow = { place: null, name: "me", score: 0, mine: true };
    const v = mergeTourPages([page(1, 20, 60, me)]);
    expect(v.mine).toEqual(me);
  });

  it("я ниже загруженного — строка закреплена; я в списке — не дублируется", () => {
    const me = row(37, true);
    const low = mergeTourPages([page(1, 20, 50, me)]);
    expect(low.mine).toEqual(me);
    const both = mergeTourPages([page(1, 20, 50, me), page(21, 20, 50, me)]);
    expect(both.rows.find((r) => r.mine)?.place).toBe(37);
    expect(both.mine).toBeNull();
  });

  it("моя строка — из самой свежей страницы", () => {
    const v = mergeTourPages([page(1, 20, 90, row(70, true)), page(21, 20, 90, row(66, true))]);
    expect(v.mine?.place).toBe(66);
  });

  it("пусто — ни строк, ни «Ещё»", () => {
    expect(mergeTourPages([])).toEqual({ rows: [], mine: null, total: 0, hasMore: false });
    expect(mergeTourPages([page(1, 0, 0)]).hasMore).toBe(false);
  });
});

describe("строка статуса под заголовком", () => {
  const base: TourPlate = {
    id: "1",
    name: "Шаги",
    metric: "steps",
    status: "running",
    startedAt: at(-DAY),
    endsAt: at(DAY),
    finishedAt: null,
    players: 32,
    myPlace: null,
    myScore: null,
    bands: [],
    startAt: null,
    endAt: null,
    joined: false,
    entryPrice: [{ resource: "gold", amount: 5 }],
  };

  it("не записан и можно — кнопка с ценой; нельзя — ничего", () => {
    expect(statusLine(base, NOW)).toEqual({ kind: "join", price: base.entryPrice });
    expect(statusLine({ ...base, status: "paying" }, NOW)).toBeNull();
    expect(statusLine({ ...base, status: "done" }, NOW)).toBeNull();
  });

  it("записан с местом — место и очки; без очков — «очков пока нет»", () => {
    const ranked = { ...base, joined: true, myPlace: 4, myScore: 1830 };
    expect(statusLine(ranked, NOW)).toEqual({ kind: "ranked", place: 4, score: 1830 });
    expect(statusLine({ ...base, joined: true }, NOW)).toEqual({ kind: "unranked" });
    const soon = { ...base, joined: true, status: "draft" as const, startAt: at(HOUR) };
    expect(statusLine(soon, NOW)).toEqual({ kind: "unranked" });
    expect(statusLine({ ...base, joined: true, status: "paying" }, NOW)).toEqual({
      kind: "unranked",
    });
  });

  it("прошлый: место — с очками; записан без места — без «пока»", () => {
    const done = { ...base, status: "done" as const, finishedAt: at(-HOUR) };
    expect(statusLine({ ...done, joined: true, myPlace: 2, myScore: 50 }, NOW)).toEqual({
      kind: "ranked",
      place: 2,
      score: 50,
    });
    expect(statusLine({ ...done, joined: true }, NOW)).toEqual({ kind: "joined" });
  });

  it("очко / очка / очков; point / points", () => {
    const ru = [1, 2, 4, 5, 11, 12, 21, 22, 25, 101, 111, 0, 2.5].map((n) => pointsKey(n, "ru"));
    expect(ru.map((k) => k.replace("tour.points_", "")).join(" ")).toBe(
      "one few few many many many one few many one many many few",
    );
    expect([1, 21, 0, 2.5].map((n) => pointsKey(n, "en"))).toEqual([
      "tour.points_one",
      "tour.points_many",
      "tour.points_many",
      "tour.points_many",
    ]);
  });

  it("форма — по числу на экране: 27,03 → «27 очков», 21,04 → «21 очко», 1,04 → «1 point»", () => {
    const xs = [27.03, 21.04, 1.03, 20.97, 595.96, 2.04, 2.46];
    const ru = xs.map((n) => `${formatScore(n, "ru")} ${pointsKey(n, "ru").slice(12)}`);
    expect(ru.join(", ")).toBe("27 many, 21 one, 1 one, 21 one, 596 many, 2 few, 2,5 few");
    expect([1.04, 1.5].map((n) => pointsKey(n, "en"))).toEqual([
      "tour.points_one",
      "tour.points_many",
    ]);
  });
});

describe("места и призы", () => {
  const t = (key: string) =>
    ({ "econ.cur.gold": "Золото", "gifts.kind.pack": "Пак", "gifts.kind.energy": "Энергия" })[
      key
    ] ?? key;

  it("места — «1» и «2–3»; строки по порядку мест", () => {
    expect(placesText("1")).toBe("1");
    expect(placesText(" 2 - 3 ")).toBe("2–3");
    const sorted = bandsByPlace([
      { places: "4-10", prizes: [] },
      { places: "1", prizes: [] },
      { places: "2-3", prizes: [] },
    ]);
    expect(sorted.map((b) => b.places)).toEqual(["1", "2-3", "4-10"]);
  });

  it("приз: DARAI, ресурс, пак штуками, энергия числом", () => {
    expect(prizeText({ kind: "token", amount: 1500, refId: "Darai" }, t, "ru")).toBe(
      `DARAI ${(1500).toLocaleString("ru-RU")}`,
    );
    expect(prizeText({ kind: "resource", amount: 50, refId: "gold" }, t, "ru")).toBe("Золото 50");
    expect(prizeText({ kind: "resource", amount: 5, refId: "iron" }, t, "en")).toBe("iron 5");
    expect(prizeText({ kind: "pack", amount: 2, refId: "pk1", title: "Лесной пак" }, t, "ru")).toBe(
      "Лесной пак ×2",
    );
    expect(prizeText({ kind: "pack", amount: 1 }, t, "ru")).toBe("Пак ×1");
    expect(prizeText({ kind: "energy", amount: 2.5 }, t, "en")).toBe("Энергия 2.5");
  });
});
