// Источники очков турнира и призы: что считается доходом ресурса, что — топор,
// сколько снимков фарма положено, какой приз годен и как он подписан.
import { describe, expect, it } from "vitest";
import {
  TOUR_SOURCE,
  TOUR_DAY_MS,
  farmPlanEndMs,
  farmSnapClock,
  farmSnapshotsDue,
  isAxeTool,
  isLogItem,
  isStoneItem,
  isTourIncome,
} from "@/lib/tournament/metricSources";
import { prizeError, prizeLine, prizesNote } from "@/lib/tournament/prizeText";
import { TOUR_METRICS } from "@/lib/tournament/types";

describe("источники очков", () => {
  it("у каждой категории свой путь", () => {
    for (const m of TOUR_METRICS) expect(TOUR_SOURCE[m]).toBeTruthy();
    expect(TOUR_SOURCE.damage).toBe("run");
    // Золото — прибыль с продаж (владелец, 03.10); дерево и камень — доход ресурса.
    expect(TOUR_SOURCE.gold).toBe("trade");
    expect(TOUR_SOURCE.wood).toBe("res");
    expect(TOUR_SOURCE.stone).toBe("res");
    expect(TOUR_SOURCE.steps).toBe("live");
    expect(TOUR_SOURCE.farm).toBe("farm");
  });

  it("доход ресурса — добыча, а не покупки и перекладывания", () => {
    expect(isTourIncome("mine", "mine:rmap:1:2", 5)).toBe(true);
    expect(isTourIncome("mob", "raidtour:x", 5)).toBe(true);
    expect(isTourIncome("field", "field-leave:x", 1)).toBe(true);
    expect(isTourIncome("reward", "raidtour:x", 1)).toBe(true);
    // Открытие купленного мистического пака — покупка.
    expect(isTourIncome("reward", "mystic:cpg_1", 1)).toBe(false);
    for (const k of ["market_buy", "market_sell", "gift", "wh_take", "portal_refund", "transfer"]) {
      expect(isTourIncome(k, "x", 10)).toBe(false);
    }
    expect(isTourIncome("mine", "x", -3)).toBe(false);
    expect(isTourIncome("mine", "x", 0)).toBe(false);
  });

  it("топор узнаём по имени инструмента (на проде — «Каменный Топор»)", () => {
    expect(isAxeTool("Каменный Топор")).toBe(true);
    expect(isAxeTool("Golden Axe")).toBe(true);
    expect(isAxeTool("Каменная Кирка")).toBe(false);
    expect(isAxeTool(null)).toBe(false);
  });

  it("снимки фарма: каждый день за минуту до конца по UTC; последний — в 09:59 дня конца", () => {
    // «Король Шахт» на проде: 07.11 18:00 → 10.11 10:00 — снимки 08, 09, 10.11 в 09:59.
    const s = Date.UTC(2026, 10, 7, 18, 0);
    const e = Date.UTC(2026, 10, 10, 10, 0);
    const due = (now: number, ends = e) =>
      farmSnapshotsDue({ startedMs: s, endsMs: ends, nowMs: now, planEndMs: e });
    expect(due(s)).toBe(0);
    expect(due(Date.UTC(2026, 10, 7, 23, 59))).toBe(0); // старое время — уже не снимок
    expect(due(Date.UTC(2026, 10, 8, 9, 58, 59))).toBe(0);
    expect(due(Date.UTC(2026, 10, 8, 9, 59))).toBe(1);
    expect(due(Date.UTC(2026, 10, 9, 12, 0))).toBe(2);
    expect(due(Date.UTC(2026, 10, 10, 9, 59))).toBe(3);
    expect(due(e)).toBe(3);
    expect(due(e + 30 * TOUR_DAY_MS)).toBe(3);
    // Остановили 09.11 в 08:00 — время снимков не сдвинулось: только 08.11.
    const stop = Date.UTC(2026, 10, 9, 8, 0);
    expect(due(stop, stop)).toBe(1);
    // Без назначенного конца — от ends_at; неделя ПН 00:00 → ПН 00:00 = 7 снимков в 23:59.
    const w0 = Date.UTC(2026, 9, 5, 0, 0);
    const w1 = w0 + 7 * TOUR_DAY_MS;
    const week = (now: number) => farmSnapshotsDue({ startedMs: w0, endsMs: w1, nowMs: now });
    expect(week(Date.UTC(2026, 9, 5, 23, 58))).toBe(0);
    expect(week(Date.UTC(2026, 9, 5, 23, 59))).toBe(1);
    expect(week(w1)).toBe(7);
    // Турнир короче минуты — снимков нет.
    expect(farmSnapshotsDue({ startedMs: s, endsMs: s + 30_000, nowMs: s + 60_000 })).toBe(0);
  });

  it("назначенный конец: end_at позже начала, иначе начало + дни", () => {
    const s = Date.UTC(2026, 10, 7, 18, 0);
    const e = Date.UTC(2026, 10, 10, 10, 0);
    expect(farmPlanEndMs({ startedMs: s, endAtMs: e, days: 3 })).toBe(e);
    expect(farmPlanEndMs({ startedMs: s, endAtMs: null, days: 3 })).toBe(s + 3 * TOUR_DAY_MS);
    expect(farmPlanEndMs({ startedMs: s, endAtMs: s - 1, days: 2 })).toBe(s + 2 * TOUR_DAY_MS);
  });

  it("время снимка на плашке: конец − 1 мин, UTC", () => {
    const at = (startAt: string | null, endAt: string | null, startedAt: string | null = null) =>
      farmSnapClock({ startAt, endAt, startedAt });
    expect(at("2026-11-07T18:00:00.000Z", "2026-11-10T10:00:00.000Z")).toBe("09:59");
    // Конца нет — начало + N дней: то же время суток, что у начала.
    expect(at("2026-11-07T18:00:00.000Z", null)).toBe("17:59");
    expect(at(null, null, "2026-10-05T00:00:00.000Z")).toBe("23:59");
    // Ручной старт позже назначенного конца — конец = начало + дни.
    expect(at(null, "2026-11-01T10:00:00.000Z", "2026-11-07T12:30:00.000Z")).toBe("12:29");
    expect(at(null, null)).toBeNull();
  });
});

describe("призы", () => {
  it("годный приз — без ошибки; битый — ключом tour.err.*", () => {
    expect(prizeError({ kind: "token", amount: 1000, refId: "Darai" })).toBeNull();
    expect(prizeError({ kind: "energy", amount: 2.5 })).toBeNull();
    expect(prizeError({ kind: "resource", amount: 50, refId: "gold" })).toBeNull();
    expect(prizeError({ kind: "resource", amount: 50, refId: "mana" })).toBe("tour.err.prize");
    expect(prizeError({ kind: "pack", amount: 1, refId: "" })).toBe("tour.err.prize");
    expect(prizeError({ kind: "pack", amount: 1.5, refId: "pk_1" })).toBe("tour.err.amount");
    expect(prizeError({ kind: "token", amount: 0, refId: "Darai" })).toBe("tour.err.amount");
  });

  it("подпись подарка — все награды места", () => {
    expect(prizeLine({ kind: "token", amount: 1000, refId: "Darai" })).toBe("1 000 Darai");
    expect(prizeLine({ kind: "resource", amount: 5, refId: "wood" })).toBe("5 дерево");
    expect(prizeLine({ kind: "pack", amount: 2, refId: "pk_1", title: "Лесной" })).toBe(
      "Лесной ×2",
    );
    const note = prizesNote([
      { kind: "token", amount: 10, refId: "Darai" },
      { kind: "energy", amount: 3 },
    ]);
    expect(note).toBe("Награды места: 10 Darai · 3 энергии");
  });

  it("из рубки в дерево — только брёвна, в камень — только камни", () => {
    for (const n of ["Бревна Дуба", "Брёвна Баобаба", "Бревна Радужные"])
      expect(isLogItem(n)).toBe(true);
    for (const n of [
      "Банан",
      "Еловая Шишка",
      "Монетки с дерева Изобилия",
      "Яблоко",
      "Пальмовое масло",
    ])
      expect(isLogItem(n)).toBe(false);
    expect(isStoneItem("Горная Руда")).toBe(true);
    for (const n of ["Слиток золота", "Пустынный Песок", "Магическая пыльца"])
      expect(isStoneItem(n)).toBe(false);
  });
});
