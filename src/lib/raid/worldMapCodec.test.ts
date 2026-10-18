// Бега местности карты мира: туда и обратно без потерь, битое — не читаем.
import { describe, expect, it } from "vitest";
import { decodeRuns, encodeRuns, WORLD_MARK_KINDS } from "./worldMapCodec";

describe("worldMapCodec", () => {
  it("номера видов меток не переезжают: новые виды — только в конце", () => {
    // Номер едет в ответе: сдвиг старых видов перекрасил бы метки у открытых вкладок.
    expect(WORLD_MARK_KINDS.slice(0, 4)).toEqual(["mine", "shop", "town", "treasure"]);
    // 05.10.2026: все поведения построек и «прочие» — следом, тем же порядком.
    expect(WORLD_MARK_KINDS.slice(4)).toEqual([
      "field",
      "warehouse",
      "portal",
      "tavern",
      "watchtower",
      "shipyard",
      "university",
      "museum",
      "chambers",
      "tournament",
      "boost",
      "spellbook",
      "oblivion",
      "leveltree",
      "sign",
      "other",
    ]);
    expect(new Set(WORLD_MARK_KINDS).size).toBe(WORLD_MARK_KINDS.length);
  });

  it("сетка проходит туда и обратно без потерь", () => {
    // Океан полосами, материки пятнами, длинные пустоты по краям рамки.
    const grid = new Uint16Array(5000);
    for (let i = 0; i < grid.length; i++) {
      grid[i] = i % 700 < 80 ? 0 : i % 300 < 150 ? 1 : 2 + ((i >> 5) % 7);
    }
    grid[4999] = 300; // значения больше байта тоже едут
    const back = decodeRuns(encodeRuns(grid), grid.length);
    expect(back).not.toBeNull();
    expect(Array.from(back!)).toEqual(Array.from(grid));
  });

  it("длинные бега занимают байты, а не тысячи чисел", () => {
    const grid = new Uint16Array(150_000).fill(1);
    grid.fill(0, 0, 20_000);
    const b64 = encodeRuns(grid);
    // Два бега: (0, 20000) и (1, 130000) — по 1 + 3 байта.
    expect(atob(b64).length).toBe(8);
    expect(decodeRuns(b64, grid.length)?.[25_000]).toBe(1);
  });

  it("бега, не сошедшиеся с рамкой, — null, а не съехавшая карта", () => {
    const b64 = encodeRuns(new Uint16Array([1, 1, 2]));
    expect(decodeRuns(b64, 3)).not.toBeNull();
    expect(decodeRuns(b64, 4)).toBeNull();
    expect(decodeRuns(b64, 2)).toBeNull();
    expect(decodeRuns("@@не base64@@", 3)).toBeNull();
  });

  it("пустая сетка — пустая строка и пустая сетка обратно", () => {
    expect(encodeRuns(new Uint16Array(0))).toBe("");
    expect(decodeRuns("", 0)?.length).toBe(0);
  });
});
