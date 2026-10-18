// Источники очков турнира и призы: что считается доходом ресурса, что — топор,
// сколько снимков фарма положено, какой приз годен и как он подписан.
import { describe, expect, it } from "vitest";
import {
  TOUR_SOURCE,
  TOUR_DAY_MS,
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

  it("снимки фарма: каждый день в 23:59 UTC, последний — до конца; неделя = 7", () => {
    const s = Date.UTC(2026, 9, 5, 0, 0); // ПН 05.10 00:00
    const e = Date.UTC(2026, 9, 11, 23, 59); // ВС 11.10 23:59
    const due = (now: number, ends = e) =>
      farmSnapshotsDue({ startedMs: s, endsMs: ends, nowMs: now });
    expect(due(s)).toBe(0);
    expect(due(Date.UTC(2026, 9, 5, 23, 58))).toBe(0);
    expect(due(Date.UTC(2026, 9, 5, 23, 59))).toBe(1);
    expect(due(Date.UTC(2026, 9, 8, 12, 0))).toBe(3);
    expect(due(e)).toBe(7);
    expect(due(e + 30 * TOUR_DAY_MS)).toBe(7);
    // Остановили в среду днём — снимков столько, сколько 23:59 успело наступить.
    expect(due(e, Date.UTC(2026, 9, 7, 12, 0))).toBe(2);
    // Старт после 23:59 — первый снимок на следующий день.
    const late = Date.UTC(2026, 9, 5, 23, 59, 30);
    expect(
      farmSnapshotsDue({ startedMs: late, endsMs: e, nowMs: Date.UTC(2026, 9, 6, 23, 59) }),
    ).toBe(1);
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
