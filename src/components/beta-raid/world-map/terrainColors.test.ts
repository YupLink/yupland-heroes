// Раскраска местности карты мира: средний цвет плитки и запасной по имени.
import { describe, expect, it } from "vitest";
import { averageColor, buildPalette, fallbackTerrainColor, paletteCss } from "./terrainColors";

describe("terrainColors", () => {
  it("средний цвет считает только непрозрачное и с весом альфы", () => {
    const red = [200, 0, 0, 255];
    const blue = [0, 0, 200, 255];
    const clear = [0, 255, 0, 0]; // прозрачный — не в счёт
    const px = Uint8ClampedArray.from([...red, ...blue, ...clear]);
    expect(averageColor(px)).toEqual([100, 0, 100]);
    expect(averageColor(new Uint8ClampedArray([9, 9, 9, 0]))).toBeNull();
  });

  it("по имени: вода синяя, снег светлый, лава красная; «Адские земли» — не земля", () => {
    const [or, og, ob] = fallbackTerrainColor("Океан");
    expect(ob).toBeGreaterThan(or + 50);
    expect(ob).toBeGreaterThan(og);
    expect(fallbackTerrainColor("Снег")[0]).toBeGreaterThan(180);
    expect(fallbackTerrainColor("Адские земли")).toEqual(fallbackTerrainColor("Лава"));
    expect(fallbackTerrainColor("Подземелье Дракона")).not.toEqual(fallbackTerrainColor("Земля"));
  });

  it("неизвестное имя — всегда один и тот же цвет, разные имена — разные", () => {
    expect(fallbackTerrainColor("Соты")).toEqual(fallbackTerrainColor("Соты"));
    expect(fallbackTerrainColor("Соты")).not.toEqual(fallbackTerrainColor("Радуга"));
  });

  it("палитра: три байта на значение, нулевое (пусто) не занято", () => {
    const terrains = [
      { id: "a", name: "A", img: null },
      { id: "b", name: "B", img: null },
    ];
    const pal = buildPalette(terrains, (t) => (t.id === "a" ? [1, 2, 3] : [4, 5, 6]));
    expect(Array.from(pal)).toEqual([0, 0, 0, 1, 2, 3, 4, 5, 6]);
    expect(paletteCss(pal, 2)).toBe("rgb(4,5,6)");
  });
});
