// Свечи курса для игроков: открытие — закрытие прошлой свечи, пустая корзина —
// черта на прежнем курсе, пул старше окна — курс переносится на его начало, моложе —
// с первой корзины; 4ч — ровно четыре часовые; границы — по местному времени.
import { describe, expect, it } from "vitest";
import { allCandles, bucketStart, candles, RATE_STEPS, type Candle } from "./bankRate";

const MIN = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 23, 12, 20);
const H12 = Date.UTC(2026, 9, 23, 12);

describe("свечи курса", () => {
  it("событий нет — свечей нет на всех шагах", () => {
    expect(allCandles([], NOW)).toEqual({ "1h": [], "4h": [], "1d": [] });
  });

  it("одно событие — одна свеча с начала его часа", () => {
    expect(candles([{ t: NOW - 5 * MIN, p: 200 }], NOW, RATE_STEPS["1h"])).toEqual([
      { t: H12, o: 200, h: 200, l: 200, c: 200 },
    ]);
  });

  it("пул старше окна: курс на начало окна переносится, пустые часы — черта на прежнем курсе", () => {
    const out = candles(
      [
        { t: NOW - 5 * DAY, p: 200 },
        { t: H12 - 30 * MIN, p: 150 }, // 11:30
        { t: H12 + 5 * MIN, p: 170 },
        { t: H12 + 10 * MIN, p: 140 },
        { t: H12 + 15 * MIN, p: 160 },
      ],
      NOW,
      RATE_STEPS["1h"],
    );
    expect(out).toHaveLength(48);
    expect(out[0]).toEqual({ t: H12 - 47 * HOUR, o: 200, h: 200, l: 200, c: 200 });
    expect(out[45]).toEqual({ t: H12 - 2 * HOUR, o: 200, h: 200, l: 200, c: 200 });
    expect(out[46]).toEqual({ t: H12 - HOUR, o: 200, h: 200, l: 150, c: 150 });
    expect(out[47]).toEqual({ t: H12, o: 150, h: 170, l: 140, c: 160 });
  });

  it("пустая корзина между событиями берёт закрытие прошлой", () => {
    const out = candles(
      [
        { t: H12 - 3 * HOUR, p: 100 },
        { t: H12 - 3 * HOUR + MIN, p: 110 },
        { t: H12 + MIN, p: 90 },
      ],
      NOW,
      RATE_STEPS["1h"],
    );
    expect(out.map((c) => [c.o, c.c])).toEqual([
      [100, 110],
      [110, 110],
      [110, 110],
      [110, 90],
    ]);
  });

  it("истории меньше окна — с корзины первого события", () => {
    const out = candles([{ t: NOW - 3 * DAY - 2 * HOUR, p: 200 }], NOW, RATE_STEPS["1d"]);
    expect(out).toHaveLength(4);
    expect(out[0].t).toBe(Date.UTC(2026, 9, 20));
    expect(out.every((c) => c.o === 200 && c.c === 200)).toBe(true);
  });

  it("шаг 4ч — это четыре часовые свечи: открытие первой, закрытие последней, крайние макс и мин", () => {
    const pts = Array.from({ length: 60 }, (_, k) => ({
      t: NOW - 20 * HOUR + k * 17 * MIN,
      p: 100 + ((k * 37) % 23),
    }));
    const hours = candles(pts, NOW, RATE_STEPS["1h"]);
    const fours = candles(pts, NOW, RATE_STEPS["4h"]);
    expect(fours).toHaveLength(6); // с 16:00 вчера по текущую 12:00
    for (const f of fours) {
      const inside = hours.filter((h) => h.t >= f.t && h.t < f.t + 4 * HOUR);
      expect(inside).toHaveLength(f.t === H12 ? 1 : 4); // текущая — только идущий час
      const merged: Candle = {
        t: f.t,
        o: inside[0].o,
        h: Math.max(...inside.map((h) => h.h)),
        l: Math.min(...inside.map((h) => h.l)),
        c: inside[inside.length - 1].c,
      };
      expect(f).toEqual(merged);
    }
  });

  it("сутки — по местному времени: у Москвы (+3 ч) день начинается в 21:00 UTC", () => {
    const tz = 3 * HOUR;
    expect(bucketStart(NOW, DAY, tz)).toBe(Date.UTC(2026, 9, 22, 21));
    const out = candles([{ t: Date.UTC(2026, 9, 22, 22), p: 5 }], NOW, RATE_STEPS["1d"], tz);
    expect(out).toEqual([{ t: Date.UTC(2026, 9, 22, 21), o: 5, h: 5, l: 5, c: 5 }]);
  });

  it("часы базы впереди на секунду — свежий обмен всё равно в последней свече; курс — 7 знаков", () => {
    const out = candles(
      [
        { t: NOW - HOUR, p: 147.876543219 },
        { t: NOW + 1000, p: 1 / 3 },
      ],
      NOW,
      RATE_STEPS["1h"],
    );
    expect(out.at(-1)).toEqual({ t: H12, o: 147.8765, h: 147.8765, l: 0.3333333, c: 0.3333333 });
  });
});
