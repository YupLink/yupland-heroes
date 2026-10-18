// Правило пары «уровень + минуты» у «Забвения» (владелец, 28.09.2026): что
// даёт пара, что невалидно, как проверяются списки эффектов и конфиг клетки.
import { describe, expect, it } from "vitest";
import {
  OBLIVION_SETUP_ERR,
  boostList,
  oblivionEffectsOk,
  oblivionGuard,
  oblivionLevelOf,
  oblivionMinutesOf,
  oblivionMode,
  oblivionRollMode,
} from "./oblivionRule";
import { oblivionCellOk } from "@/lib/oblivionConfig";

describe("oblivionMode — таблица владельца", () => {
  it("N ≥ 1 без минут — заряды без срока", () => {
    expect(oblivionMode("3", "")).toBe("lv");
    expect(oblivionMode("1-3", "")).toBe("lv");
    expect(oblivionMode(2, undefined)).toBe("lv");
  });

  it("N ≥ 1 с минутами — заряды со сроком", () => {
    expect(oblivionMode("3", "30")).toBe("lvt");
    expect(oblivionMode("1-3", "10-20")).toBe("lvt");
  });

  it("ровно «0» с минутами — без счёта на время", () => {
    expect(oblivionMode("0", "30")).toBe("time");
    expect(oblivionMode(" 0 ", "10-20")).toBe("time");
    expect(oblivionMode(0, 45)).toBe("time");
  });

  it("«0» или пусто без минут — невалидно", () => {
    expect(oblivionMode("0", "")).toBeNull();
    expect(oblivionMode("", "")).toBeNull();
    expect(oblivionMode(undefined, undefined)).toBeNull();
    // Минуты «0» и мусор — это «минут нет».
    expect(oblivionMode("0", "0")).toBeNull();
    expect(oblivionMode("0", "полчаса")).toBeNull();
  });

  it("диапазон с нулём невалиден — «0» только точным значением", () => {
    expect(oblivionMode("0-3", "30")).toBeNull();
    expect(oblivionMode("0-3", "")).toBeNull();
    expect(oblivionMode("3-0", "30")).toBeNull();
    expect(oblivionMode("0-0", "30")).toBeNull();
  });

  it("бесконечно только «0»: пустой уровень и мусор при минутах — тоже ошибка", () => {
    expect(oblivionMode("", "30")).toBeNull();
    expect(oblivionMode("много", "30")).toBeNull();
    expect(oblivionMode("-1", "30")).toBeNull();
    expect(oblivionMode("1.5", "30")).toBeNull();
  });
});

describe("разбор полей", () => {
  it("уровень: «03» → «3», диапазон как задан, мусор — пусто", () => {
    expect(oblivionLevelOf("03")).toBe("3");
    expect(oblivionLevelOf("1-3")).toBe("1-3");
    expect(oblivionLevelOf("0")).toBe("0");
    expect(oblivionLevelOf("0-3")).toBe("");
    expect(oblivionLevelOf(null)).toBe("");
  });

  it("минуты: верх диапазона от 1, иначе срока нет", () => {
    expect(oblivionMinutesOf("30")).toBe("30");
    expect(oblivionMinutesOf("10-20")).toBe("10-20");
    expect(oblivionMinutesOf(15)).toBe("15");
    expect(oblivionMinutesOf("0")).toBe("");
    expect(oblivionMinutesOf("")).toBe("");
  });

  it("вид выпавшего броска", () => {
    expect(oblivionRollMode(3, 0)).toBe("lv");
    expect(oblivionRollMode(2, 30)).toBe("lvt");
    expect(oblivionRollMode(0, 30)).toBe("time");
    expect(oblivionRollMode(0, 0)).toBeNull();
  });
});

describe("списки эффектов и конфиг клетки", () => {
  const ok = { stat: "oblivion", value: "0", minutes: "30" };
  const bad = { stat: "oblivion", value: "0", minutes: "" };

  it("список: чужие эффекты правило не трогает, неверное забвение — отказ", () => {
    expect(oblivionEffectsOk([{ stat: "spd", value: "0", minutes: "" }, ok])).toBe(true);
    expect(oblivionEffectsOk([ok, bad])).toBe(false);
    expect(oblivionEffectsOk({ effects: [bad], prices: [] })).toBe(false);
    expect(oblivionEffectsOk(null)).toBe(true);
    expect(boostList({ stat: "spd" })).toEqual([{ stat: "spd" }]);
  });

  it("конфиг клетки: алтарь и храм", () => {
    expect(oblivionCellOk({ boost: { effects: [ok], prices: [] } })).toBe(true);
    expect(oblivionCellOk({ boost: { effects: [bad], prices: [] } })).toBe(false);
    expect(oblivionCellOk({ oblivion: { prices: [], level: "0", minutes: "" } })).toBe(false);
    expect(oblivionCellOk({ oblivion: { prices: [], level: "", minutes: "" } })).toBe(false);
    expect(oblivionCellOk({ oblivion: { prices: [], level: "0", minutes: "30" } })).toBe(true);
    // Поля уровня нет — форма показывает 1, так и считаем.
    expect(oblivionCellOk({ oblivion: { prices: [] } })).toBe(true);
    expect(oblivionCellOk({ text: "табличка" })).toBe(true);
    expect(oblivionCellOk(null)).toBe(true);
  });

  it("проверка для zod бросает ключ словаря, а не JSON", () => {
    const guard = oblivionGuard(oblivionEffectsOk);
    expect(guard([ok])).toBe(true);
    expect(() => guard([bad])).toThrow(new Error(OBLIVION_SETUP_ERR));
  });
});
