// Урок у столба на копии образца (11.11.2026): озеро перерисовано — переправа
// засчитывается у ближайшей воды, куда доходит лодка; целое озеро не трогаем.
import { describe, expect, it } from "vitest";
import type { WorldCell } from "@/lib/raid/worldgen/spec";
import { fitShortLesson, masterPillar, sailCells } from "./shortLessonFit";
import type { ShortLesson } from "./shortTutorial";

const W = "water";
const YARD = "yard";
const dist = (q: number, r: number) => Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r));
const ring = (n: number) => {
  const out: Array<{ q: number; r: number }> = [];
  for (let q = -n; q <= n; q++) for (let r = -n; r <= n; r++) if (dist(q, r) === n) out.push({ q, r });
  return out;
};
/** Карта радиуса 7: `wet(q, r)` — вода ли клетка; верфь — на (0,6). */
function map(wet: (q: number, r: number) => boolean): WorldCell[] {
  const cells: WorldCell[] = [];
  for (let q = -7; q <= 7; q++)
    for (let r = -7; r <= 7; r++) {
      if (dist(q, r) > 7) continue;
      cells.push({ q, r, terrainId: wet(q, r) ? W : "grass", buildingId: q === 0 && r === 6 ? YARD : null } as WorldCell);
    }
  return cells;
}
const lesson: ShortLesson = {
  version: 1,
  water: [...ring(2), ...ring(3)],
  shore: { q: -1, r: 0 },
  pillar: { q: 0, r: 0 },
  islet: [{ q: 0, r: 0 }, ...ring(1)],
};
const isWater = (t: string | null) => t === W;

describe("fitShortLesson", () => {
  it("целое озеро (кольца 2–3 — вода, верфь у воды) — урок как был", () => {
    const cells = map((q, r) => dist(q, r) >= 2 && dist(q, r) <= 5 && !(q === 0 && r === 6));
    expect(fitShortLesson(cells, lesson, isWater, YARD)).toBe(lesson);
  });

  it("озеро засыпано, вода только с юга от кольца 3 — цель переправы там", () => {
    const cells = map((q, r) => dist(q, r) >= 3 && r > 0 && !(q === 0 && r === 6));
    const fit = fitShortLesson(cells, lesson, isWater, YARD);
    const targets = sailCells(fit);
    expect(targets.length).toBeGreaterThan(0);
    expect(targets.every((c) => dist(c.q, c.r) === 3 && c.r > 0)).toBe(true);
    expect(fit.islet!.every((c) => dist(c.q, c.r) <= 2)).toBe(true);
    // Цель переправы — клетка воды у островка (тап ведёт кораблём, не пешком).
    expect(dist(fit.shore.q, fit.shore.r)).toBe(3);
    expect(targets).toContainEqual(fit.shore);
    expect(fit.pillar).toEqual(lesson.pillar);
  });

  it("лодке некуда доплыть — урок как был (останется «Пропустить шаг»)", () => {
    const cells = map(() => false);
    expect(fitShortLesson(cells, lesson, isWater, YARD)).toBe(lesson);
  });
});

describe("masterPillar", () => {
  const cell = (cfg: unknown) =>
    [{ q: 0, r: 0, terrainId: "grass", buildingId: "pillar", buildingSkinId: "skin", tier: 1, buildingConfig: cfg } as WorldCell];
  const book = { effect: "spellbook", spellbook: { spells: ["sp"], learnPrices: [{ resource: "diamonds", amount: 10 }], forgetPrices: [] } };

  it("столб образца — его заклинание и цена (их и оплатит сундук)", () => {
    expect(masterPillar(cell(book), { q: 0, r: 0 })).toEqual({
      buildingId: "pillar", buildingSkinId: "skin", tier: 1,
      spellbook: { spells: ["sp"], learnPrices: [{ resource: "diamonds", amount: 10 }], forgetPrices: [] },
    });
  });

  it("не столб, без заклинаний или цену не оплатить — null (подберётся из мира)", () => {
    expect(masterPillar(cell({ effect: "mine" }), { q: 0, r: 0 })).toBeNull();
    expect(masterPillar(cell({ ...book, spellbook: { ...book.spellbook, spells: [] } }), { q: 0, r: 0 })).toBeNull();
    expect(masterPillar(cell({ ...book, spellbook: { ...book.spellbook, learnPrices: [{ resource: "item", amount: 1 }] } }), { q: 0, r: 0 })).toBeNull();
    expect(masterPillar(cell(book), undefined)).toBeNull();
  });
});

describe("подогнанный урок переживает чтение из базы", () => {
  it("parsePlaces оставляет урок с островком и водой любых размеров", async () => {
    const { parsePlaces } = await import("./parsePlaces");
    const cells = map((q, r) => dist(q, r) >= 3 && r > 0 && !(q === 0 && r === 6));
    const fit = fitShortLesson(cells, lesson, isWater, YARD);
    const at = { q: 0, r: 0 };
    const p = parsePlaces({ spawn: at, chest: at, workshop: at, mine: at, treasure: at, portal: at, lesson: fit });
    expect(p?.lesson).toEqual(fit);
  });
});
