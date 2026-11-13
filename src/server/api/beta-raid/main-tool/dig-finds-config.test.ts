// Запись настройки находок (§8.24 п. 6б) — по частям JSON одним оператором:
// общий список, свой у местности, снять свой. Соседние части не трогаются.
import { describe, expect, it } from "vitest";
import { digSetExpr } from "./dig-finds-config";

const items = [{ id: "none", pct: 100 }];

describe("выражение записи настройки находок", () => {
  it("общий — только ключ items", () => {
    expect(digSetExpr("B", null, items)).toBe(
      `jsonb_set(B, '{items}', '[{"id":"none","pct":100}]'::jsonb)`,
    );
  });

  it("свой у местности — terrains создаётся при нужде, ключ — путь массивом", () => {
    const sql = digSetExpr("B", "terrain_sand", items);
    expect(sql).toContain("COALESCE(B->'terrains', '{}'::jsonb)");
    expect(sql).toContain("ARRAY['terrains', 'terrain_sand']");
  });

  it("снять свой — удаление пути, остальное как было", () => {
    expect(digSetExpr("B", "terrain_sand", null)).toBe("(B #- ARRAY['terrains', 'terrain_sand'])");
  });
});
