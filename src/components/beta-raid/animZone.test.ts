// Анимации карты — только во втором обзоре и ближе (владелец, 09.11.2026): в тёмном
// тумане шаман стоит первым кадром, кадр не будится, листы анимации не качаются.
import { describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({ enchanter: 0 }));
vi.mock("./mapEnchanter", () => ({
  drawMapEnchanter: () => (s.enchanter++, true),
  enchanterImageKey: (base: string, kind: string) => `map-enchanter:${base}:${kind}`,
}));

const { animatesAt } = await import("./animZone");
const { drawBuilding } = await import("./drawBuilding");

const set = (...xs: number[]) => new Set(xs);
const scene = (over: Record<string, unknown> = {}) =>
  ({
    revealAll: false,
    visible: set(1),
    fogZones: { active: set(1, 2), bright: set(3) },
    ...over,
  }) as never;

describe("animatesAt", () => {
  it("свой радиус, второй обзор, подсветка шахт — да; тёмный туман — нет", () => {
    const sc = scene();
    expect([1, 2, 3, 4].map((i) => animatesAt(sc, i))).toEqual([true, true, true, false]);
  });

  it("зон нет — только свой радиус; открытая админом карта — везде", () => {
    expect(animatesAt(scene({ fogZones: undefined }), 2)).toBe(false);
    expect(animatesAt(scene({ revealAll: true }), 99)).toBe(true);
  });
});

describe("шаман в тумане", () => {
  const img = { complete: true, naturalWidth: 200, naturalHeight: 200 };
  const drawn: unknown[] = [];
  const g = { drawImage: (...a: unknown[]) => void drawn.push(a) };
  const base = {
    g,
    images: new Map([
      ["b:shaman:0", img],
      ["map-enchanter:b:shaman:0:idle", img],
    ]),
    buildingTiers: {},
    bucket: 99,
    mineFlags: {},
    mineGuards: {},
    fieldSlots: {},
  };
  const cell = (i: number) => ({ i, key: `${i},0`, x: 0, y: 0 }) as never;

  it("во втором обзоре — анимация; в тёмном тумане — обычная картинка", () => {
    drawBuilding(scene(base), cell(2), "shaman");
    expect(s.enchanter).toBe(1);
    drawBuilding(scene(base), cell(4), "shaman");
    expect(s.enchanter).toBe(1);
    expect(drawn.length).toBe(1);
  });
});
