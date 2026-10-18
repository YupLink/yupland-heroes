// Тесты старого биом-генератора гекс-редактора: `bun run test`.
//
// Повод: лес выходил из одного клона — findDecoration брал первое «дерево»
// из справочника. Генератор сидом не управляется (Math.random по замыслу),
// поэтому проверяем не точные позиции, а состав пула: при трёх деревьях на
// 500 клетках лес из одного вида невозможен (вероятность (1/3)^150).
import { describe, expect, it } from "vitest";
import { generateBiome, type Cell, type Decoration, type Terrain } from "@/lib/biomeGenerators";

const cells: Cell[] = [];
for (let q = 0; q < 25; q++) for (let r = 0; r < 20; r++) cells.push({ q, r });

const terrains: Terrain[] = [
  { id: "water", name: "Вода" },
  { id: "sand", name: "Песок" },
  { id: "grass", name: "Трава" },
  { id: "forest", name: "Лес" },
];
const trees: Decoration[] = [
  { id: "t1", name: "Дерево" },
  { id: "t2", name: "Ель" },
  { id: "t3", name: "Дуб" },
];
const bushes: Decoration[] = [
  { id: "b1", name: "Куст" },
  { id: "b2", name: "Куст сухой" },
];
/** Похожи на деревья подстрокой, но деревьями не являются. */
const decoys: Decoration[] = [
  { id: "x1", name: "Мель" },
  { id: "x2", name: "Дубина" },
  { id: "x3", name: "Деревня" },
];

const usedDecor = (out: Map<string, { decorationId?: string | null }>): Set<string> => {
  const ids = new Set<string>();
  for (const p of out.values()) if (p.decorationId) ids.add(p.decorationId);
  return ids;
};

describe("generateBiome — пулы декора", () => {
  it("лес на 500 клетках при 3 деревьях использует не меньше 2 видов", () => {
    const out = generateBiome("forest", cells, { terrains, decorations: [...trees, ...bushes] });
    expect(out.size).toBe(500);
    const ids = usedDecor(out);
    expect(ids.size, `видов декора: ${[...ids].join(", ")}`).toBeGreaterThanOrEqual(2);
    for (const id of ids) expect(["t1", "t2", "t3"]).toContain(id);
    for (const p of out.values()) expect(p.terrainId).toBe("forest");
  });

  it("«Мель», «Дубина», «Деревня» деревьями не считаются", () => {
    const out = generateBiome("forest", cells, { terrains, decorations: [...trees, ...decoys] });
    for (const id of usedDecor(out)) expect(["t1", "t2", "t3"]).toContain(id);
  });

  it("без деревьев в справочнике лес засаживается кустами", () => {
    const out = generateBiome("forest", cells, { terrains, decorations: bushes });
    const ids = usedDecor(out);
    expect(ids.size).toBeGreaterThanOrEqual(1);
    for (const id of ids) expect(["b1", "b2"]).toContain(id);
  });

  it("равнина мешает деревья и кусты", () => {
    const out = generateBiome("plain", cells, { terrains, decorations: [...trees, ...bushes] });
    const ids = usedDecor(out);
    expect(ids.size).toBeGreaterThanOrEqual(2);
    for (const p of out.values()) expect(p.terrainId).toBe("grass");
  });

  it("пустой справочник декора — decorationId null, генератор не молчит", () => {
    const out = generateBiome("forest", cells, { terrains, decorations: [] });
    expect(out.size).toBe(500);
    for (const p of out.values()) expect(p.decorationId).toBeNull();
  });

  it("custom: заливка выбранным типом, декор стирается", () => {
    const out = generateBiome(
      "custom",
      cells,
      { terrains, decorations: trees },
      { customTerrainId: "sand" },
    );
    for (const p of out.values()) expect(p).toEqual({ terrainId: "sand", decorationId: null });
  });
});
