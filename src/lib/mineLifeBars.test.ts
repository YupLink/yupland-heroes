// Полосы службы шахт v2: провод туда-обратно, доля как mineLifeNow, сдвиг
// часов телефона, сломанная — пустая, чужая форма ответа — без падения.
import { describe, expect, it } from "vitest";
import {
  decodeMineLife,
  encodeMineLife,
  mineBarFrac,
  mineBarsAlive,
  mineBarWrecked,
  type MineLifeRow,
} from "./mineLifeBars";
import { mineLifeNow, type MineMode } from "./mineV2";

const H = 3_600_000;
const NOW = Date.parse("2026-10-21T12:00:00Z");

const row = (
  q: number,
  r: number,
  mode: MineMode,
  lifeLeft: number,
  agoH: number,
): MineLifeRow => ({
  q,
  r,
  life: { mode, lifeLeft, lifeAt: NOW - agoH * H },
});

describe("encodeMineLife / decodeMineLife", () => {
  it("строка: режим номером, запас 4 знака, возраст секундами, уровень; ничья — q,r,уровень", () => {
    const wire = encodeMineLife(
      [row(3, -4, "max", 0.123456, 2), { q: -7, r: 9, life: null, level: 3 }],
      NOW,
    );
    expect(wire).toBe("3,-4,2,0.1235,7200,1;-7,9,3");
  });

  it("уровень туда-обратно: 0 (остров) — 0, старая запись без уровня — 1", () => {
    const wire = encodeMineLife([{ ...row(1, 1, "base", 1, 0), level: 4 }, { ...row(2, 2, "base", 1, 0), level: 0 }], NOW);
    const { bars } = decodeMineLife({ bars: `${wire};3,3,0,1,0;4,4`, serverNow: NOW });
    expect([1, 2, 3, 4].map((i) => bars.get(`${i},${i}`)?.lvl)).toEqual([4, 0, 1, 1]);
  });

  it("ничья после поломки — «q,r,lvl,w», ничья с рождения — «q,r,lvl»; руины только у первой", () => {
    const wire = encodeMineLife(
      [
        { q: 1, r: 1, life: null, wrecked: true },
        { q: 2, r: 2, life: null },
        row(3, 3, "max", 0.01, 1),
        row(4, 4, "base", 1, 0),
      ],
      NOW,
    );
    expect(wire).toBe("1,1,1,w;2,2,1;3,3,2,0.01,3600,1;4,4,0,1,0,1");
    const { bars } = decodeMineLife({ bars: wire, serverNow: NOW });
    expect(bars.get("1,1")?.left).toBe(0);
    expect(bars.get("2,2")?.left).toBe(0);
    expect(mineBarWrecked(bars.get("1,1")!, NOW)).toBe(true);
    expect(mineBarWrecked(bars.get("2,2")!, NOW)).toBe(false); // остров до починки
    expect(mineBarWrecked(bars.get("3,3")!, NOW)).toBe(true); // срок вышел по часам
    expect(mineBarWrecked(bars.get("4,4")!, NOW)).toBe(false); // работает
  });

  it("туда-обратно: запас и момент записи на часах сервера", () => {
    const wire = encodeMineLife([row(1, 2, "mid", 0.5, 10)], NOW);
    const { bars, skew } = decodeMineLife({ bars: wire, serverNow: NOW });
    expect(skew).toBe(0);
    expect(bars.get("1,2")).toEqual({ left: 0.5, at: NOW - 10 * H, span: 72 * H, lvl: 1 });
  });

  it("битые координаты и незнакомый режим: пропуск и «База»", () => {
    const rows = [
      { q: Number.NaN, r: 1, life: null },
      { q: 1.5, r: 1, life: null },
      { q: 0, r: 0, life: { mode: "turbo", lifeLeft: 2, lifeAt: Number.NaN } },
    ];
    const wire = encodeMineLife(rows, NOW);
    expect(wire).toBe("0,0,0,1,0,1");
    expect(decodeMineLife({ bars: wire, serverNow: NOW }).bars.get("0,0")?.span).toBe(168 * H);
  });

  it("сдвиг часов телефона: clientAt − serverNow", () => {
    const { skew } = decodeMineLife({ bars: "", serverNow: NOW }, NOW + 600_000);
    expect(skew).toBe(600_000);
  });

  it("чужая форма (старый кэш, ошибка) — пусто, без падения", () => {
    for (const w of [null, undefined, 5, "x", { bars: 1, serverNow: NOW }, { bars: "1,2" }]) {
      expect(decodeMineLife(w).bars.size).toBe(0);
    }
    expect(decodeMineLife({ bars: "a,b;;1;2,3,9,x,y", serverNow: NOW }).bars.get("2,3")).toEqual({
      left: 0,
      at: NOW,
      span: 168 * H,
      lvl: 1,
    });
  });
});

describe("mineBarFrac", () => {
  it("совпадает с mineLifeNow во всех режимах и на всём сроке", () => {
    for (const mode of ["base", "mid", "max"] as const) {
      for (const [left, agoH] of [
        [1, 0],
        [1, 12],
        [0.7, 30],
        [0.2, 100],
        [0.05, 200],
      ]) {
        const wire = encodeMineLife([row(0, 0, mode, left, agoH)], NOW);
        const bar = decodeMineLife({ bars: wire, serverNow: NOW }).bars.get("0,0")!;
        for (const later of [0, H, 13 * H, 50 * H]) {
          const want = mineLifeNow(
            { mode, lifeLeft: left, lifeAt: new Date(NOW - agoH * H).toISOString() },
            NOW + later,
          );
          expect(mineBarFrac(bar, NOW + later)).toBeCloseTo(want, 9);
        }
      }
    }
  });

  it("тает: «Максимум» с полной тратит половину за 12 часов и пуст к суткам", () => {
    const bar = { left: 1, at: NOW, span: 24 * H };
    expect(mineBarFrac(bar, NOW)).toBe(1);
    expect(mineBarFrac(bar, NOW + 12 * H)).toBeCloseTo(0.5, 9);
    expect(mineBarFrac(bar, NOW + 24 * H)).toBe(0);
    expect(mineBarFrac(bar, NOW + 99 * H)).toBe(0);
  });

  it("часы раньше записи — запас не растёт выше записанного", () => {
    expect(mineBarFrac({ left: 0.4, at: NOW, span: 24 * H }, NOW - H)).toBe(0.4);
  });

  it("сломанная (ничья) — ноль при любом «сейчас»", () => {
    const { bars } = decodeMineLife({ bars: "5,5", serverNow: NOW });
    expect(mineBarFrac(bars.get("5,5")!, NOW)).toBe(0);
    expect(mineBarFrac(bars.get("5,5")!, 0)).toBe(0);
  });

  it("mineBarsAlive: есть ли что подтаивать", () => {
    const { bars } = decodeMineLife({ bars: "5,5;1,1,2,0.5,0", serverNow: NOW });
    expect(mineBarsAlive(bars, NOW)).toBe(true);
    expect(mineBarsAlive(bars, NOW + 13 * H)).toBe(false);
    expect(mineBarsAlive(new Map(), NOW)).toBe(false);
  });
});
