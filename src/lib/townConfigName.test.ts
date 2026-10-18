// Название города в пульте ратуши (владелец, 05.10.2026: «задавать название,
// например Город Вихоток, — по нему и различать привязку к лавкам»).
import { describe, expect, it } from "vitest";
import {
  cleanTownName,
  emptyTownConfig,
  parseTownConfig,
  safeParseTownConfig,
  TOWN_NAME_MAX,
} from "./townConfig";

describe("название города", () => {
  it("хранится чистым: пробелы схлопнуты, края обрезаны, длина в пределе", () => {
    expect(cleanTownName("  Город   Вихоток  ")).toBe("Город Вихоток");
    expect(cleanTownName("x".repeat(100))).toHaveLength(TOWN_NAME_MAX);
    expect(cleanTownName(42)).toBe("");
    expect(cleanTownName(undefined)).toBe("");
  });

  it("едет в конфиге ратуши и читается из jsonb", () => {
    const cfg = parseTownConfig({ name: " Город Вихоток ", residents: 30, goods: [] });
    expect(cfg.name).toBe("Город Вихоток");
    expect(safeParseTownConfig(JSON.parse(JSON.stringify(cfg))).name).toBe("Город Вихоток");
  });

  it("старая запись без названия и новая ратуша — пустое имя, не падение", () => {
    expect(safeParseTownConfig({ residents: 10, goods: [] }).name).toBe("");
    expect(emptyTownConfig().name).toBe("");
  });
});
