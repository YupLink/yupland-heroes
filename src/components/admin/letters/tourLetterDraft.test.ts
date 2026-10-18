// Генератор письма о турнирах: что отмечено сразу, до какого времени письмо
// показывать и что уходит в черновик.
import { describe, expect, it } from "vitest";
import type { TourLetterSource, TourLetterSourceRow } from "@/lib/tourLetter";
import { defaultPicked, generateTourLetter, latestEnd } from "./tourLetterDraft";

const row = (id: string, over: Partial<TourLetterSourceRow> = {}): TourLetterSourceRow => ({
  id,
  status: "draft",
  name: "Урон",
  metric: "damage",
  startAt: "2026-10-05T00:00:00.000Z",
  endAt: "2026-10-11T23:59:00.000Z",
  days: 7,
  fundDarai: 0,
  bands: [{ places: "1", prizes: [{ kind: "resource", amount: 100, refId: "gold" }] }],
  entryPrice: [{ resource: "gold", amount: 5 }],
  ...over,
});

describe("генератор письма о турнирах", () => {
  it("сразу отмечены только запланированные", () => {
    const rows = [row("a"), row("b", { status: "running" }), row("c")];
    expect([...defaultPicked(rows)]).toEqual(["a", "c"]);
  });

  it("показывать до — самый поздний конец; без конца — начало + дни", () => {
    expect(
      latestEnd([
        row("a"),
        row("b", { startAt: "2026-10-10T00:00:00.000Z", endAt: null, days: 3 }),
      ]),
    ).toBe("2026-10-13T00:00:00.000Z");
    expect(latestEnd([row("a", { startAt: null, endAt: null })])).toBeNull();
    expect(latestEnd([])).toBeNull();
  });

  it("письмо — только по отмеченным, ru и en сразу, серия из поля", () => {
    const src: TourLetterSource = {
      tours: [row("a"), row("b", { name: "Шаги", metric: "steps" })],
      arenas: ["Арена"],
    };
    const g = generateTourLetter(src, new Set(["b"]), "  9 королей ");
    expect(g.title).toBe("Объявлен турнир «9 королей»");
    expect(g.body).toContain("• Шаги — кто пройдёт больше шагов");
    expect(g.body).not.toContain("Урон");
    // Серия по-русски в английский заголовок не идёт — там имя турнира.
    expect(g.titleEn).toBe("Tournament “Steps” announced");
    expect(g.bodyEn).toContain("• Steps — who takes the most steps");
    expect(g.showUntil).toBe("2026-10-11T23:59:00.000Z");
    expect(generateTourLetter(src, new Set(["a", "b"]), "").title).toBe("Объявлены турниры");
  });
});
