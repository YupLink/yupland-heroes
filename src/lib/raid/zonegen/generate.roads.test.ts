// Дороги и генератор зон: `bun run test`.
//
// «Дорога по воде» в игре не бывает (владелец, 21.09): водные слои обходят
// клетки с дорогой, а декор на дорогу не ставится — он бы её перегородил.
import { describe, expect, it } from "vitest";
import { generateZone } from "@/lib/raid/zonegen/generate";
import { AFF, args, near, ok, recipe, rect } from "@/test/zonegenFixture";

const key = (c: { q: number; r: number }) => `${c.q},${c.r}`;

describe("generateZone — дороги", () => {
  it("вода не ложится под дорогу, доли суши не плывут", () => {
    const cells = rect(50, 40);
    // Дорога — каждая пятая клетка, по всему полю (в низинах тоже).
    const roads = new Set(cells.filter((_, i) => i % 5 === 0).map(key));
    const { patches, report } = generateZone(
      args({
        cells,
        roads,
        recipe: recipe({
          layers: [
            { terrainId: "water", weight: 30 },
            { terrainId: "grass", weight: 70 },
          ],
        }),
      }),
    );
    ok(
      patches.every((p) => !(roads.has(key(p)) && p.terrainId === "water")),
      "вода под дорогой",
    );
    expect(report.cells).toBe(cells.length);
    near(report.byTerrain.water / report.cells, 0.3, 0.02, "доля воды уплыла");
  });

  it("клетка с дорогой получает сушу того же ряда шума, а не случайную", () => {
    const cells = rect(40, 40);
    const roads = new Set(cells.filter((c) => c.r === 7).map(key));
    const { patches } = generateZone(args({ cells, roads }));
    const onRoad = patches.filter((p) => roads.has(key(p)));
    expect(onRoad.length).toBe(40);
    ok(
      onRoad.every((p) => p.terrainId !== "water"),
      "дорога под водой",
    );
  });

  it("декор на дорогу не ставится, даже с опытом карты", () => {
    const cells = rect(40, 40);
    const roads = new Set(cells.filter((c) => c.q % 3 === 0).map(key));
    const { patches } = generateZone(
      args({ cells, roads, affinity: AFF, recipe: recipe({ decorRate: 3 }) }),
    );
    ok(
      patches.filter((p) => roads.has(key(p))).every((p) => p.decorationId === null),
      "декор на дороге",
    );
    ok(
      patches.some((p) => p.decorationId !== null),
      "декора нет вовсе — тест бессмыслен",
    );
  });

  it("малая зона, выпала вода — клетки с дорогой остаются как были", () => {
    const cells = rect(3, 3);
    const roads = new Set([key(cells[4])]);
    const { patches, report } = generateZone(
      args({
        cells,
        roads,
        recipe: recipe({ smallSingle: 50, layers: [{ terrainId: "water", weight: 100 }] }),
      }),
    );
    expect(report.single).toBe(true);
    expect(patches.some((p) => key(p) === key(cells[4]))).toBe(false);
    expect(report.skipped).toBe(1);
    expect(report.cells).toBe(8);
  });

  it("без дорог результат тот же, что и раньше (roads не задан)", () => {
    const cells = rect(30, 30);
    const a = generateZone(args({ cells }));
    const b = generateZone(args({ cells, roads: new Set() }));
    expect(a).toEqual(b);
  });
});
