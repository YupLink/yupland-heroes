// Правило рыбалки (§8.35): настройка (интервал по умолчанию 10 минут, улов —
// свои товары), сколько поимок созрело, какой товар у поимки (равновероятно и
// одинаково на повторе), соседи берега, какие траты энергии кончают рыбалку и
// отсчёт до поимки.
import { describe, expect, it } from "vitest";
import {
  FISH_INTERVAL_DEFAULT,
  FISH_INTERVAL_MAX,
  FISH_ITEMS_MAX,
  catchItemOf,
  catchesOf,
  chanceOf,
  dueCount,
  fishHit,
  fishStopsOn,
  hitOffsets,
  intervalOf,
  leftClock,
  neighborsOf,
  parseFishingConfig,
} from "./fishing";
import { hexDistance } from "./hex";

const MIN = 60_000;

describe("настройка", () => {
  it("по умолчанию — попытка раз в минуту, шанс 10 %, улова нет; строка settings — JSON", () => {
    expect(FISH_INTERVAL_DEFAULT).toBe(1);
    expect(parseFishingConfig(null)).toEqual({ intervalMin: 1, chancePct: 10, items: [] });
    expect(parseFishingConfig("не json")).toEqual({ intervalMin: 1, chancePct: 10, items: [] });
    expect(parseFishingConfig('{"intervalMin":3,"chancePct":25,"items":["cst_fish"]}')).toEqual({
      intervalMin: 3,
      chancePct: 25,
      items: [{ id: "cst_fish", pct: 100 }],
    });
  });

  it("шанс — целые проценты 1…100; мусор — по умолчанию 10", () => {
    expect([chanceOf(7.4), chanceOf("50"), chanceOf(250)]).toEqual([7, 50, 100]);
    expect([chanceOf(0), chanceOf(-3), chanceOf("abc"), chanceOf(null)]).toEqual([10, 10, 10, 10]);
  });

  it("рыба — примерно в 10 % попыток, исход попытки один и тот же при повторе", () => {
    const hits = hitOffsets("op_test", 1, 10_000, 10).length;
    expect(hits).toBeGreaterThan(900);
    expect(hits).toBeLessThan(1100);
    expect(hitOffsets("op_test", 1, 200, 10)).toEqual(hitOffsets("op_test", 1, 200, 10));
    expect(hitOffsets("op_test", 1, 50, 100)).toHaveLength(50);
    // Номера внутри захвата — с 1: попытка from+i-1 ↔ номер i.
    const all = hitOffsets("op_test", 1, 300, 10);
    const tail = hitOffsets("op_test", 101, 200, 10).map((i) => i + 100);
    expect(all.filter((i) => i > 100)).toEqual(tail);
    expect(fishHit("op_test", 7, 100)).toBe(true);
  });

  it("интервал — целые минуты в границах; мусор — по умолчанию", () => {
    expect(intervalOf(7.4)).toBe(7);
    expect(intervalOf("15")).toBe(15);
    expect(intervalOf(0)).toBe(1);
    expect(intervalOf(-3)).toBe(1);
    expect(intervalOf("abc")).toBe(1);
    expect(intervalOf(10 ** 9)).toBe(FISH_INTERVAL_MAX);
  });

  it("улов — только id своих товаров, без повторов и не больше предела", () => {
    const items = ["cst_a", "cst_a", " cst_b ", "pack_x", "", null, "cst_c; DROP"];
    expect(parseFishingConfig({ items }).items.map((it) => it.id)).toEqual(["cst_a", "cst_b"]);
    const many = Array.from({ length: 40 }, (_, i) => `cst_${i}`);
    expect(parseFishingConfig({ items: many }).items).toHaveLength(FISH_ITEMS_MAX);
  });
});

describe("сколько поимок созрело", () => {
  it("до срока — ноль; в срок — одна; дальше — по одной на интервал", () => {
    expect(dueCount(10 * MIN, 9 * MIN, 10 * MIN, 50)).toBe(0);
    expect(dueCount(10 * MIN, 10 * MIN, 10 * MIN, 50)).toBe(1);
    expect(dueCount(10 * MIN, 29 * MIN, 10 * MIN, 50)).toBe(2);
    expect(dueCount(10 * MIN, 30 * MIN, 10 * MIN, 50)).toBe(3);
  });

  it("за раз — не больше предела; кривые числа — ноль", () => {
    expect(dueCount(0, 1000 * MIN, MIN, 50)).toBe(50);
    expect(dueCount(0, 10 * MIN, 0, 50)).toBe(0);
    expect(dueCount(Number.NaN, 10 * MIN, MIN, 50)).toBe(0);
  });
});

describe("какой товар у поимки", () => {
  it("один из списка; тот же номер — тот же товар; пустой список — ничего", () => {
    const items = [
      { id: "cst_a", pct: 40 },
      { id: "cst_b", pct: 35 },
      { id: "cst_c", pct: 25 },
    ];
    for (let n = 1; n <= 50; n++) {
      const id = catchItemOf(items, "sid", n);
      expect(items.map((it) => it.id)).toContain(id);
      expect(catchItemOf(items, "sid", n)).toBe(id);
    }
    expect(catchItemOf([], "sid", 1)).toBeNull();
  });

  it("виды выпадают по своим долям (90 / 7 / 2,5 / 0,5 на 20 000 поимках)", () => {
    const items = [
      { id: "cst_pike", pct: 90 },
      { id: "cst_carp", pct: 7 },
      { id: "cst_sturgeon", pct: 2.5 },
      { id: "cst_gold", pct: 0.5 },
    ];
    const n = 20_000;
    const got = catchesOf(items, "press-1-x", 1, n);
    expect([...got.values()].reduce((a, b) => a + b, 0)).toBe(n);
    for (const it of items) {
      const share = (got.get(it.id) ?? 0) / n;
      // Бросок детерминированный, но не идеально равномерный: допуск — четверть
      // доли (у 0,5 % это 0,375…0,625 %), чего хватает поймать перекос вдвое.
      expect(share).toBeGreaterThan((it.pct / 100) * 0.75);
      expect(share).toBeLessThan((it.pct / 100) * 1.25);
    }
  });

  it("улов поимок from…: по одной штуке за поимку", () => {
    const got = catchesOf([{ id: "cst_fish", pct: 100 }], "s", 4, 3);
    expect([...got]).toEqual([["cst_fish", 3]]);
    expect(catchesOf([{ id: "cst_fish", pct: 100 }], "s", 4, 0).size).toBe(0);
  });
});

describe("берег, трата энергии, отсчёт", () => {
  it("соседи — шесть клеток на расстоянии 1", () => {
    const list = neighborsOf(3, -2);
    expect(new Set(list.map((c) => `${c.q},${c.r}`)).size).toBe(6);
    for (const c of list) expect(hexDistance(3, -2, c.q, c.r)).toBe(1);
  });

  it("другое действие — любая трата энергии, кроме покупки за энергию и стейкинга", () => {
    for (const r of ["step", "fight", "decor", "dig", "bag_open", "spell", "portal", "build"]) {
      expect(fishStopsOn(r)).toBe(true);
    }
    expect(fishStopsOn("market")).toBe(false);
    expect(fishStopsOn("stake")).toBe(false);
  });

  it("отсчёт: м:сс, от часа — ч:мм:сс, без минуса", () => {
    expect(leftClock(9 * MIN + 5_000)).toBe("9:05");
    expect(leftClock(999)).toBe("0:01");
    expect(leftClock(0)).toBe("0:00");
    expect(leftClock(-5)).toBe("0:00");
    expect(leftClock(61 * MIN)).toBe("1:01:00");
  });
});
