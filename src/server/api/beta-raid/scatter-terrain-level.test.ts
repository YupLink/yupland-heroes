// Уровень местности в автораздаче (владелец, 25.09): мобов — только на
// местности уровня n или n–n. Диапазон одним полем, как везде.
import { describe, expect, it } from "vitest";
import { levelRangeText, parseLevelRange } from "@/lib/raid/levelRange";
import { terrainsAtLevelSql } from "./scatter-terrain-level";
import { toScatterPlan } from "@/components/beta-raid/scatter/scatterDraft";
import { emptyScatterDraft } from "@/components/beta-raid/scatter/scatterDraftEmpty";

describe("диапазон одним полем", () => {
  it("число, диапазон, перевёрнутый, любое тире", () => {
    expect(parseLevelRange("5")).toEqual({ from: 5, to: 5 });
    expect(parseLevelRange("1-10")).toEqual({ from: 1, to: 10 });
    expect(parseLevelRange("10 – 3")).toEqual({ from: 3, to: 10 });
    expect(parseLevelRange("2—4")).toEqual({ from: 2, to: 4 });
  });

  it("пусто и мусор — без ограничения", () => {
    expect(parseLevelRange("")).toBeNull();
    expect(parseLevelRange("abc")).toBeNull();
    expect(parseLevelRange(undefined)).toBeNull();
  });

  it("обратно в поле", () => {
    expect(levelRangeText({ from: 5, to: 5 })).toBe("5");
    expect(levelRangeText({ from: 1, to: 10 })).toBe("1-10");
    expect(levelRangeText(null)).toBe("");
  });
});

describe("уровень местности в плане и в запросе", () => {
  it("черновик → план: поле уровня местности доезжает до боссов", () => {
    const d = emptyScatterDraft();
    expect(toScatterPlan(d).boss.terrainLevel).toBeNull();
    d.boss.terrainLevel = "3-5";
    expect(toScatterPlan(d).boss.terrainLevel).toEqual({ from: 3, to: 5 });
  });

  it("уровень берётся только числом из meta.level и только у живой местности", () => {
    const sql = terrainsAtLevelSql({ from: 3, to: 5 });
    expect(sql).toContain("jsonb_typeof(t.meta->'level') = 'number'");
    expect(sql).toContain("BETWEEN 3 AND 5");
    expect(sql).toContain("t.kind = 'terrain'");
  });
});
