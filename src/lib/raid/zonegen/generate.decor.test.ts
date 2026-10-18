// Тесты декора генератора зон: `bun run test`.
//
// Декор — «рука админа»: только то, что он уже ставил на этой местности, с той
// же частотой; на воде — никогда. Раскладка местности — в generate.test.ts.
import { describe, expect, it } from "vitest";
import { generateZone } from "@/lib/raid/zonegen/generate";
import { AFF, args, near, ok, recipe } from "@/test/zonegenFixture";

describe("generateZone — декор", () => {
  it("на воде декора нет никогда, даже если опыт карты его «помнит»", () => {
    const { patches } = generateZone(args({ affinity: AFF, recipe: recipe({ decorRate: 3 }) }));
    const water = patches.filter((p) => p.terrainId === "water");
    ok(water.length > 0, "воды нет — тест бессмыслен");
    ok(
      water.every((p) => p.decorationId === null),
      "декор на воде",
    );
  });

  it("decorStrict: местность без опыта — decorationId null", () => {
    const { patches, report } = generateZone(args({ affinity: AFF }));
    ok(
      patches.filter((p) => p.terrainId === "sand").every((p) => p.decorationId === null),
      "декор на песке без опыта",
    );
    expect(report.decor).toBe(patches.filter((p) => p.decorationId !== null).length);
  });

  it("нестрогий режим: местность без опыта берёт из общего пула по 10 %", () => {
    const { patches } = generateZone(
      args({ affinity: AFF, recipe: recipe({ decorStrict: false }) }),
    );
    const sand = patches.filter((p) => p.terrainId === "sand");
    const decorated = sand.filter((p) => p.decorationId !== null);
    near(decorated.length / sand.length, 0.1, 0.04, "доля декора на песке из общего пула");
    ok(
      decorated.every((p) => p.decorationId === "tree" || p.decorationId === "rock"),
      "декор не из общего пула",
    );
  });

  it("частота декора = опыт карты × decorRate, выбор только из пула местности", () => {
    const { patches } = generateZone(args({ affinity: AFF }));
    const grass = patches.filter((p) => p.terrainId === "grass");
    const decorated = grass.filter((p) => p.decorationId !== null);
    near(decorated.length / grass.length, 0.5, 0.05, "доля декора на траве");
    ok(
      decorated.every((p) => p.decorationId === "tree" || p.decorationId === "bush"),
      "декор не из пула травы",
    );
    const trees = decorated.filter((p) => p.decorationId === "tree").length;
    near(trees / decorated.length, 0.8, 0.08, "доля ёлок среди декора (вес 80/20)");
  });

  it("decorRate 2 удваивает частоту, потолок 0.9", () => {
    const twice = generateZone(args({ affinity: AFF, recipe: recipe({ decorRate: 2 }) }));
    const grass = twice.patches.filter((p) => p.terrainId === "grass");
    const decorated = grass.filter((p) => p.decorationId !== null).length;
    near(decorated / grass.length, 0.9, 0.05, "0.5 × 2 = 1 → зажато до 0.9");
  });

  it("decorRate 0 — декора нет вовсе", () => {
    const { report } = generateZone(
      args({ affinity: AFF, recipe: recipe({ decorRate: 0, decorStrict: false }) }),
    );
    expect(report.decor).toBe(0);
  });

  it("правка decorRate не двигает пятна местности", () => {
    const a = generateZone(args({ affinity: AFF, recipe: recipe({ decorRate: 0.2 }) }));
    const b = generateZone(args({ affinity: AFF, recipe: recipe({ decorRate: 1.5 }) }));
    expect(a.patches.map((p) => p.terrainId)).toEqual(b.patches.map((p) => p.terrainId));
  });
});
