// Креатор: карта работы по id, название шаблона, голая карта.
import { describe, expect, it } from "vitest";
import {
  CREATOR_PREFIX,
  cleanWorkName,
  defaultWorldName,
  isCreatorMapId,
} from "@/lib/raid/creator/ids";
import { CREATOR_MAP_SIZE, blankMapCells } from "@/lib/raid/creator/blankMap";
import { isIslandMapId } from "@/lib/raid/island/ids";

describe("карта работы", () => {
  it("isle_cw_… — работа креатора и остров по id; остров новичка — не работа", () => {
    expect(isCreatorMapId(`${CREATOR_PREFIX}abc`)).toBe(true);
    expect(isIslandMapId(`${CREATOR_PREFIX}abc`)).toBe(true);
    expect(isCreatorMapId("isle_abc")).toBe(false);
    expect(isCreatorMapId("rmap_UthOURxc")).toBe(false);
    expect(isCreatorMapId(null)).toBe(false);
  });
});

describe("название шаблона", () => {
  it("пробелы схлопнуты, 1…60 знаков", () => {
    expect(cleanWorkName("  Деревня   эльфов ")).toBe("Деревня эльфов");
    expect(cleanWorkName("   ")).toBeNull();
    expect(cleanWorkName("я".repeat(60))).toBe("я".repeat(60));
    expect(cleanWorkName("я".repeat(61))).toBeNull();
    expect(cleanWorkName(5)).toBeNull();
  });

  it("новый мир по умолчанию — «Мир N» по числу своих", () => {
    expect(defaultWorldName(0, "ru")).toBe("Мир 1");
    expect(defaultWorldName(2, "en")).toBe("World 3");
  });
});

describe("голая карта", () => {
  it("рамка 64×64 из пустых клеток, старт — центр, клетки не повторяются", () => {
    const { cells, spawn } = blankMapCells();
    expect(cells).toHaveLength(CREATOR_MAP_SIZE * CREATOR_MAP_SIZE);
    expect(cells.every((c) => Object.keys(c).join() === "q,r")).toBe(true);
    expect(cells.some((c) => c.q === spawn.q && c.r === spawn.r)).toBe(true);
    expect(new Set(cells.map((c) => `${c.q},${c.r}`)).size).toBe(cells.length);
  });
});

describe("расширение мира", () => {
  it("рамка растёт вокруг того же центра: старая целиком внутри, новые — только снаружи", async () => {
    const { frameCells, frameCenter, growCells } = await import("@/lib/raid/creator/blankMap");
    const key = (c: { q: number; r: number }) => `${c.q},${c.r}`;
    const f64 = frameCells(64);
    const f128 = new Set(frameCells(128).map(key));
    expect(f128.size).toBe(128 * 128);
    expect(f64.every((c) => f128.has(key(c)))).toBe(true);
    const add = growCells(64, 128);
    expect(add).toHaveLength(128 * 128 - 64 * 64);
    const old = new Set(f64.map(key));
    expect(add.some((c) => old.has(key(c)))).toBe(false);
    expect(f128.has(key(frameCenter()))).toBe(true);
    expect(growCells(256, 512)).toHaveLength(512 * 512 - 256 * 256);
  });

  it("размеры — только больше нынешнего; править — автор, «править» или админ", async () => {
    const { growSizes, canEditWork } = await import("@/lib/raid/creator/ids");
    expect(growSizes(64)).toEqual([128, 256, 512]);
    expect(growSizes(256)).toEqual([512]);
    expect(growSizes(512)).toEqual([]);
    expect(canEditWork({ role: "view" }, false)).toBe(false);
    expect(canEditWork({ role: "edit" }, false)).toBe(true);
    expect(canEditWork({ role: null }, true)).toBe(true);
  });
});
