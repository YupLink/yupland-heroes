// Набор Ангелины для шахт: пути и ключи, вид шахты из события, ход кадров
// взрыва (длительности из GIF, один проход), и что файлы в public лёгкие и
// нарезаны так, как их режет кадр (лист 5×2, кадр той же пропорции, что
// картинки состояний).
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  MINE_ART_KINDS,
  MINE_ART_PRELOAD,
  MINE_BLAST_COLS,
  MINE_BLAST_MS,
  MINE_BLAST_ROWS,
  mineArtKindOf,
  mineArtSrc,
  mineBlastFrameAt,
  mineBlastNextIn,
  mineBlastSrc,
} from "./mineArt";

const PUBLIC = join(process.cwd(), "public");

/** Размер холста webp с альфой (чанк VP8X). */
function webpSize(file: string): { w: number; h: number } {
  const b = readFileSync(file);
  expect(b.toString("ascii", 0, 4)).toBe("RIFF");
  expect(b.toString("ascii", 12, 16)).toBe("VP8X");
  return {
    w: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)),
    h: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)),
  };
}

describe("кадры взрыва", () => {
  it("десять кадров по длительностям GIF, всего 750 мс, потом ничего", () => {
    expect(MINE_BLAST_MS).toBe(750);
    expect(mineBlastFrameAt(0)).toBe(0);
    expect(mineBlastFrameAt(119)).toBe(0);
    expect(mineBlastFrameAt(120)).toBe(1);
    expect(mineBlastFrameAt(749)).toBe(9);
    expect(mineBlastFrameAt(750)).toBe(-1);
    expect(mineBlastFrameAt(-1)).toBe(-1);
    expect(mineBlastFrameAt(Number.NaN)).toBe(-1);
  });

  it("будильник — до смены кадра; после конца — null", () => {
    expect(mineBlastNextIn(0)).toBe(120);
    expect(mineBlastNextIn(130)).toBe(50);
    expect(mineBlastNextIn(749)).toBe(1);
    expect(mineBlastNextIn(750)).toBeNull();
  });
});

describe("вид шахты из события", () => {
  it("ресурс шахты и вид сервера динамита (sawmill); «other» и мусор — null", () => {
    expect(mineArtKindOf("sawmill")).toBe("wood");
    expect(mineArtKindOf("wood")).toBe("wood");
    expect(mineArtKindOf("stone")).toBe("stone");
    expect(mineArtKindOf("gold")).toBe("gold");
    expect(mineArtKindOf("diamonds")).toBe("diamonds");
    expect(mineArtKindOf("diamond-mine")).toBe("diamonds");
    expect(mineArtKindOf("other")).toBeNull();
    expect(mineArtKindOf(5)).toBeNull();
    expect(mineArtKindOf(null)).toBeNull();
  });
});

describe("файлы набора в public/raid/mines", () => {
  it("16 картинок для кэша карты, ключи разные, всё лежит на месте", () => {
    expect(MINE_ART_PRELOAD).toHaveLength(16);
    expect(new Set(MINE_ART_PRELOAD.map((a) => a.key)).size).toBe(16);
    for (const a of MINE_ART_PRELOAD) {
      expect(a.src.startsWith("/raid/mines/")).toBe(true);
      expect(statSync(join(PUBLIC, a.src)).isFile()).toBe(true);
    }
  });

  it("лёгкие: состояния ≤ 30 КБ, лист взрыва ≤ 90 КБ", () => {
    for (const kind of MINE_ART_KINDS) {
      for (const st of ["destroyed", "can-place", "cannot-place"] as const)
        expect(statSync(join(PUBLIC, mineArtSrc(kind, st))).size).toBeLessThanOrEqual(30_000);
      expect(statSync(join(PUBLIC, mineBlastSrc(kind))).size).toBeLessThanOrEqual(90_000);
    }
  });

  it("лист 5×2 ровными кадрами той же пропорции, что картинки состояний", () => {
    for (const kind of MINE_ART_KINDS) {
      const sheet = webpSize(join(PUBLIC, mineBlastSrc(kind)));
      expect(sheet.w % MINE_BLAST_COLS).toBe(0);
      expect(sheet.h % MINE_BLAST_ROWS).toBe(0);
      const frame = sheet.h / MINE_BLAST_ROWS / (sheet.w / MINE_BLAST_COLS);
      for (const st of ["destroyed", "can-place", "cannot-place"] as const) {
        const s = webpSize(join(PUBLIC, mineArtSrc(kind, st)));
        expect(s.w).toBe(256);
        expect(Math.abs(s.h / s.w - frame)).toBeLessThan(0.01);
      }
    }
  });
});
