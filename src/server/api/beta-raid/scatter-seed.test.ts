// Сид раздачи: тот же сид — та же раскладка, без сида — всё как было.
//
// Проверяем ровно две вещи, за которые сид и заведён: порядок клеток в SQL
// повторяется от сида (а не от настроения базы) и без сида остаётся прежним
// `random()` — прошлое поведение трогать было нельзя.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyPlan } from "@/test/scatterFixtures";

const db = vi.hoisted(() => ({ calls: [] as string[] }));

vi.mock("../../db/mcpClient", () => ({
  mcpExec: (sql: string) => {
    db.calls.push(sql);
    return Promise.resolve([]);
  },
  mcpSession: () => {
    throw new Error("тесты не открывают сессию к базе");
  },
}));

const { cellOrder, pickCells } = await import("./scatter-cells");
const { pick, scatterRnd } = await import("./scatter-parts");

beforeEach(() => {
  db.calls = [];
});

describe("cellOrder", () => {
  it("без сида — прежний random()", () => {
    expect(cellOrder(null, "c")).toBe("random()");
    expect(cellOrder(undefined, "f")).toBe("random()");
  });

  it("с сидом — порядок от клетки и сида, под нужным алиасом", () => {
    expect(cellOrder(42, "c")).toBe("md5(42::text || ':' || c.q::text || ',' || c.r::text)");
    expect(cellOrder(42, "f")).toContain("f.q::text");
  });

  it("мусор в сиде — это «сида нет», а не битый SQL", () => {
    expect(cellOrder(Number.NaN, "c")).toBe("random()");
    expect(cellOrder(-1, "c")).toBe("random()");
    expect(cellOrder(7.9, "c")).toContain("md5(7::text");
  });
});

describe("pickCells", () => {
  const requests = [
    { terrainId: "mount", count: 3 },
    { terrainId: null, count: 2 },
  ];

  it("тот же сид → тот же порядок клеток в SQL", async () => {
    await pickCells("map-1", requests, 12345);
    const first = [...db.calls];
    db.calls = [];
    await pickCells("map-1", requests, 12345);
    expect(db.calls).toEqual(first);
    expect(first.join("\n")).toContain("md5(12345::text");
    expect(first.join("\n")).not.toContain("random()");
  });

  it("другой сид → другой порядок", async () => {
    await pickCells("map-1", requests, 1);
    const first = [...db.calls];
    db.calls = [];
    await pickCells("map-1", requests, 2);
    expect(db.calls).not.toEqual(first);
  });

  it("без сида SQL прежний — ORDER BY random()", async () => {
    await pickCells("map-1", requests);
    const sql = db.calls.join("\n");
    expect(sql).toContain("ORDER BY random()");
    expect(sql).not.toContain("md5(");
  });
});

describe("scatterRnd", () => {
  it("сид задан — жребий повторяется", () => {
    const list = ["a", "b", "c", "d", "e"];
    const roll = (seed: number) =>
      Array.from({ length: 10 }, () => pick(list, scatterRnd(seed))).join("");
    expect(roll(777)).toBe(roll(777));
    expect(roll(777)).not.toBe(roll(778));
  });

  it("сида нет — обычный Math.random, прежнее поведение", () => {
    expect(scatterRnd(null)).toBe(Math.random);
    expect(scatterRnd(undefined)).toBe(Math.random);
  });

  it("кривой генератор не выдаёт undefined вместо шаблона", () => {
    expect(pick(["a", "b"], () => 1)).toBe("b");
    expect(pick(["a", "b"], () => -5)).toBe("a");
  });
});

describe("схема плана", () => {
  it("план без сида проходит как раньше — сид просто null", async () => {
    const { parseScatterPlan } = await import("./scatter-schema");
    expect(parseScatterPlan(emptyPlan()).seed).toBeNull();
    expect(parseScatterPlan({ ...emptyPlan(), seed: 12345 }).seed).toBe(12345);
  });

  it("сид не из Int32 не проходит: в базу и в md5 он не влезет", async () => {
    const { parseScatterPlan } = await import("./scatter-schema");
    expect(() => parseScatterPlan({ ...emptyPlan(), seed: -1 })).toThrow();
    expect(() => parseScatterPlan({ ...emptyPlan(), seed: 2_147_483_648 })).toThrow();
  });
});
