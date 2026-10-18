// Тесты раскладки местности генератора зон: `bun run test`.
//
// Проверяем не «красиво ли», а инварианты, на которых держится «полу-ИИ»:
// один сид → одна зона; доли зоны = доли рецепта; занятые клетки нетронуты;
// вода всегда в низине. Декор — в generate.decor.test.ts.
import { describe, expect, it } from "vitest";
import { generateZone } from "@/lib/raid/zonegen/generate";
import { normalizeWeights } from "@/lib/raid/zonegen/recipe";
import { args, near, ok, recipe, rect } from "@/test/zonegenFixture";

describe("generateZone — раскладка", () => {
  it("один сид → тот же результат, другой сид → другой", () => {
    const a = generateZone(args());
    const b = generateZone(args());
    expect(a).toEqual(b);
    const c = generateZone(args({ recipe: recipe({ seed: 4243 }) }));
    const same = a.patches.filter((p, i) => p.terrainId === c.patches[i].terrainId).length;
    ok(
      same < a.patches.length * 0.9,
      `сиды 4242 и 4243 почти совпали: ${same} из ${a.patches.length}`,
    );
  });

  it("порядок клеток на входе не влияет на ответ", () => {
    const shuffled = [...rect(50, 40)].reverse();
    expect(generateZone(args({ cells: shuffled })).patches).toEqual(generateZone(args()).patches);
  });

  it("доли зоны совпадают с рецептом (±3 % на 2000 клетках)", () => {
    const { report } = generateZone(args());
    expect(report.cells).toBe(2000);
    expect(report.single).toBe(false);
    near(report.byTerrain.grass / 2000, 0.5, 0.03, "трава");
    near(report.byTerrain.sand / 2000, 0.3, 0.03, "песок");
    near(report.byTerrain.water / 2000, 0.2, 0.03, "вода");
  });

  it("слой с весом 0 не получает ни клетки", () => {
    const r = recipe({
      layers: [
        { terrainId: "grass", weight: 100 },
        { terrainId: "sand", weight: 0 },
      ],
    });
    const { report } = generateZone(args({ recipe: r }));
    expect(report.byTerrain.sand ?? 0).toBe(0);
    expect(report.byTerrain.grass).toBe(2000);
  });

  it("маленькая зона — один тип местности из слоёв с ненулевым весом", () => {
    const r = recipe({
      layers: [
        { terrainId: "grass", weight: 0 },
        { terrainId: "sand", weight: 100 },
      ],
    });
    const { patches, report } = generateZone(args({ cells: rect(3, 3), recipe: r }));
    expect(report.single).toBe(true);
    expect(patches.length).toBe(9);
    ok(
      patches.every((p) => p.terrainId === "sand"),
      "в маленькой зоне должен быть только песок",
    );
  });

  it("занятые клетки пропущены и патча по ним нет", () => {
    const occupied = new Set(["0,0", "5,5", "49,39", "10,10"]);
    const { patches, report } = generateZone(args({ occupied }));
    expect(report.skipped).toBe(4);
    expect(report.cells).toBe(1996);
    ok(
      patches.every((p) => !occupied.has(`${p.q},${p.r}`)),
      "патч лёг на занятую клетку",
    );
  });

  it("вода уходит в нижний слой независимо от порядка в рецепте", () => {
    const grassFirst = recipe({
      layers: [
        { terrainId: "grass", weight: 50 },
        { terrainId: "water", weight: 50 },
      ],
    });
    const waterFirst = recipe({
      layers: [
        { terrainId: "water", weight: 50 },
        { terrainId: "grass", weight: 50 },
      ],
    });
    const a = generateZone(args({ recipe: grassFirst }));
    const b = generateZone(args({ recipe: waterFirst }));
    expect(a.patches).toEqual(b.patches);
  });

  it("крупный масштаб даёт меньше границ между местностями, чем мелкий", () => {
    const edges = (scale: number) => {
      const { patches } = generateZone(args({ recipe: recipe({ scale }) }));
      const at = new Map(patches.map((p) => [`${p.q},${p.r}`, p.terrainId]));
      let n = 0;
      for (const p of patches) {
        for (const [dq, dr] of [
          [1, 0],
          [0, 1],
          [1, -1],
        ] as const) {
          const t = at.get(`${p.q + dq},${p.r + dr}`);
          if (t !== undefined && t !== p.terrainId) n++;
        }
      }
      return n;
    };
    ok(edges(30) < edges(3), `границ при scale 30: ${edges(30)}, при scale 3: ${edges(3)}`);
  });

  it("варп меняет форму пятен, но не доли рецепта", () => {
    const plain = generateZone(args({ recipe: recipe({ warp: 0 }) }));
    const wavy = generateZone(args({ recipe: recipe({ warp: 0.8 }) }));
    const same = plain.patches.filter((p, i) => p.terrainId === wavy.patches[i].terrainId).length;
    ok(same < plain.patches.length * 0.95, `варп ничего не изменил: ${same}`);
    near(wavy.report.byTerrain.water / 2000, 0.2, 0.03, "доля воды при варпе");
    near(wavy.report.byTerrain.grass / 2000, 0.5, 0.03, "доля травы при варпе");
    // warp = 0 — прежний генератор: те же клетки от прогона к прогону.
    expect(generateZone(args({ recipe: recipe({ warp: 0 }) })).patches).toEqual(plain.patches);
  });

  it("пустое выделение и полностью занятое — пустой ответ без падения", () => {
    expect(generateZone(args({ cells: [] })).patches).toEqual([]);
    const cells = rect(2, 2);
    const { patches, report } = generateZone(
      args({ cells, occupied: new Set(cells.map((c) => `${c.q},${c.r}`)) }),
    );
    expect(patches).toEqual([]);
    expect(report.skipped).toBe(4);
  });
});

describe("normalizeWeights", () => {
  it("нормирует по сумме, нулевая сумма — поровну, отрицательное — ноль", () => {
    expect(
      normalizeWeights([
        { terrainId: "a", weight: 60 },
        { terrainId: "b", weight: 20 },
      ]),
    ).toEqual([0.75, 0.25]);
    expect(
      normalizeWeights([
        { terrainId: "a", weight: 0 },
        { terrainId: "b", weight: 0 },
      ]),
    ).toEqual([0.5, 0.5]);
    expect(
      normalizeWeights([
        { terrainId: "a", weight: -5 },
        { terrainId: "b", weight: 5 },
      ]),
    ).toEqual([0, 1]);
  });
});
