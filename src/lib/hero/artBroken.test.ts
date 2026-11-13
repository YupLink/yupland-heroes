// Сломанный слетает с героя (§8.63 п.3): правило «надеть нельзя» и разбор
// событий поломки — общие для сервера и клиента.
import { describe, expect, it } from "vitest";
import {
  ART_BREAK_TOAST_MS,
  artLocked,
  artLockedPct,
  mergeArtBreakNotes,
  parseArtBreakNotes,
} from "./artBroken";

describe("надеть нельзя", () => {
  it("только сломанный (износ 100) и только при запущенной механике", () => {
    expect(artLocked(100, true)).toBe(true);
    expect(artLocked("100", true)).toBe(true);
    expect(artLocked(99.5, true)).toBe(false);
    expect(artLocked(0, true)).toBe(false);
    // Механика не запущена — для игроков всё как было.
    expect(artLocked(100, false)).toBe(false);
  });

  it("по прочности из ответа: 0 — сломан; пусто — новый", () => {
    expect(artLockedPct(0, true)).toBe(true);
    expect(artLockedPct(0.5, true)).toBe(false);
    expect(artLockedPct(null, true)).toBe(false);
    expect(artLockedPct(undefined, true)).toBe(false);
    expect(artLockedPct(0, false)).toBe(false);
  });

  it("плашка висит 5 секунд", () => {
    expect(ART_BREAK_TOAST_MS).toBe(5000);
  });
});

describe("события поломки", () => {
  const a = { id: "abn_1", itemId: "u1", name: "Меч", imageUrl: "/m.webp" };
  const b = { id: "abn_2", itemId: "u2", name: "Щит", imageUrl: null };

  it("массив, JSON-строка, колонки базы — одна форма", () => {
    expect(parseArtBreakNotes([a])).toEqual([a]);
    expect(parseArtBreakNotes(JSON.stringify([a, b]))).toEqual([a, b]);
    expect(
      parseArtBreakNotes([{ id: "abn_3", item_id: "u3", name: "Кольцо", image_url: "" }]),
    ).toEqual([{ id: "abn_3", itemId: "u3", name: "Кольцо", imageUrl: null }]);
  });

  it("мусор и строки без id отбрасываются", () => {
    expect(parseArtBreakNotes("не json")).toEqual([]);
    expect(parseArtBreakNotes(null)).toEqual([]);
    expect(parseArtBreakNotes({ id: "x" })).toEqual([]);
    expect(parseArtBreakNotes([null, 5, { name: "без id" }, a])).toEqual([a]);
  });

  it("очередь: новые в конец, без повторов", () => {
    expect(mergeArtBreakNotes([a], [b, a])).toEqual([a, b]);
    expect(mergeArtBreakNotes(undefined, [a, a])).toEqual([a]);
    expect(mergeArtBreakNotes([b], undefined)).toEqual([b]);
  });
});
