// Закрытая туманом клетка не отличается от пустоты (Архан, 29.10.2026): фон
// холста, неразведанная клетка и пелена тумана — один цвет.
import { describe, expect, it } from "vitest";
import { FOG_DARK, FOG_LIGHT } from "./betaCanvasDraw";
import { COLOR } from "./betaCanvasScene";

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(",");
const rgbOf = (rgba: string) => rgba.replace(/\s/g, "").match(/^rgba\((\d+,\d+,\d+),/)?.[1];

describe("туман не выдаёт клетки", () => {
  it("пелена тумана того же цвета, что неразведанное и фон", () => {
    expect(rgbOf(FOG_LIGHT)).toBe(rgb(COLOR.fogTile));
    expect(rgbOf(FOG_DARK)).toBe(rgb(COLOR.fogTile));
  });
});
