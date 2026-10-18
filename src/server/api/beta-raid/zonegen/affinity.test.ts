// Опыт карты: правило «мёртвый декор не учится» живёт в SQL — проверяем текст
// запроса, как warehouse-badges.test; сборку из строк — на данных.
import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/db/mcpClient", () => ({ mcpExec: vi.fn() }));

import { affinitySql, buildAffinity } from "./affinity";

describe("affinitySql", () => {
  const sql = affinitySql("rmap_x");

  it("считает только по своей карте и только клетки с местностью", () => {
    expect(sql).toContain("c.map_id = 'rmap_x'");
    expect(sql).toContain("c.terrain_id IS NOT NULL");
  });

  it("декор засчитывается только с живым активным шаблоном", () => {
    expect(sql).toContain("d.kind = 'decoration'");
    expect(sql).toContain("COALESCE(d.active, true)");
    expect(sql).toMatch(/LEFT JOIN yuplink\.mystic_item_template d/);
  });

  it("кавычка в id карты экранируется", () => {
    expect(affinitySql("a'b")).toContain("'a''b'");
  });
});

describe("buildAffinity", () => {
  it("доля с декором, пул по убыванию, общий пул по сумме", () => {
    const a = buildAffinity([
      { terrain_id: "forest", decoration_id: null, n: 60 },
      { terrain_id: "forest", decoration_id: "fir", n: 30 },
      { terrain_id: "forest", decoration_id: "oak", n: "10" },
      { terrain_id: "sand", decoration_id: null, n: 100 },
      { terrain_id: "swamp", decoration_id: "fir", n: 5 },
    ]);
    expect(a.byTerrain.forest).toEqual({
      total: 100,
      decorated: 40,
      pool: [
        { decorationId: "fir", n: 30 },
        { decorationId: "oak", n: 10 },
      ],
    });
    expect(a.byTerrain.sand).toEqual({ total: 100, decorated: 0, pool: [] });
    expect(a.global).toEqual([
      { decorationId: "fir", n: 35 },
      { decorationId: "oak", n: 10 },
    ]);
  });

  it("пустая карта — пустой опыт, без исключений", () => {
    expect(buildAffinity([])).toEqual({ byTerrain: {}, global: [] });
  });
});
