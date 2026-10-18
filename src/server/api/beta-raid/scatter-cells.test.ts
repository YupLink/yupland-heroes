// Подбор клеток под раскладку. База поддельная: «карта» — двадцать клеток в
// массиве, запросы разбираются по тексту.
//
// Проверяем три обещания подбора: заявка получает своё, одна клетка не уходит
// двоим, а недостача возвращается ЧИСЛОМ, а не молчанием. Последнее держит весь
// отчёт: «создано + не влезло» обязано сходиться с заказанным.
import { beforeEach, describe, expect, it, vi } from "vitest";

type Cell = { q: number; r: number; terrain: string };

/** Карта: горы (5), болото (2), трава (10) — суша; вода (3) в котёл не идёт. */
const MAP: Cell[] = [
  ...Array.from({ length: 5 }, (_, i) => ({ q: i, r: 0, terrain: "mount" })),
  ...Array.from({ length: 2 }, (_, i) => ({ q: i, r: 1, terrain: "swamp" })),
  ...Array.from({ length: 10 }, (_, i) => ({ q: i, r: 2, terrain: "grass" })),
  ...Array.from({ length: 3 }, (_, i) => ({ q: i, r: 3, terrain: "water" })),
];
const DRY = MAP.filter((c) => c.terrain !== "water");

const db = vi.hoisted(() => ({ calls: [] as string[] }));

/**
 * Поддельный мост. Котёл суши намеренно отдаёт клетки В ТОМ ЖЕ порядке, в каком
 * их разбирают заявки по местности: это худший случай, ради которого подбор и
 * вычитает уже отданное на своей стороне.
 */
vi.mock("../../db/mcpClient", () => ({
  mcpExec: (sql: string) => {
    db.calls.push(sql);
    if (sql.includes("WITH need(tid, n)")) {
      const out: Array<{ tid: string; q: number; r: number }> = [];
      for (const m of sql.matchAll(/\('([^']*)'::text, (\d+)::int\)/g)) {
        const [, tid, n] = m;
        for (const c of MAP.filter((x) => x.terrain === tid).slice(0, Number(n))) {
          out.push({ tid, q: c.q, r: c.r });
        }
      }
      return Promise.resolve(out);
    }
    const limit = Number(/LIMIT (\d+)/.exec(sql)?.[1] ?? 0);
    // «Только эти местности» (уровень местности): котёл режется по списку.
    const only = /c\.terrain_id IN \(([^)]*)\)/.exec(sql)?.[1];
    const allowed = only ? [...only.matchAll(/'([^']*)'/g)].map((m) => m[1]) : null;
    const pool = allowed ? DRY.filter((c) => allowed.includes(c.terrain)) : DRY;
    return Promise.resolve(pool.slice(0, limit).map((c) => ({ q: c.q, r: c.r })));
  },
  mcpSession: () => {
    throw new Error("тесты не открывают сессию к базе");
  },
}));

const { pickCells } = await import("./scatter-cells");
type Request = { terrainId: string | null; count: number; terrains?: string[] | null };

const key = (c: { q: number; r: number }) => `${c.q},${c.r}`;
const terrainOf = (c: { q: number; r: number }) =>
  MAP.find((x) => x.q === c.q && x.r === c.r)?.terrain ?? "?";

/** Главный инвариант: выдано + не нашлось = заказано. На нём стоит отчёт. */
async function grantsFor(requests: Request[]) {
  const grants = await pickCells("map-1", requests);
  grants.forEach((g, i) => {
    const want = Math.max(0, Math.floor(requests[i].count) || 0);
    expect(g.cells.length + g.short, `заявка ${i}: выдано+недостача ≠ заказано`).toBe(want);
  });
  const all = grants.flatMap((g) => g.cells).map(key);
  expect(new Set(all).size, `одна клетка ушла двум заявкам: ${all.join(" ")}`).toBe(all.length);
  return grants;
}

beforeEach(() => {
  db.calls = [];
});

describe("pickCells", () => {
  it("каждому своё, когда места хватает", async () => {
    const grants = await grantsFor([
      { terrainId: "mount", count: 3 },
      { terrainId: "swamp", count: 2 },
    ]);
    expect(grants[0].cells.every((c) => terrainOf(c) === "mount")).toBe(true);
    expect(grants[1].cells.every((c) => terrainOf(c) === "swamp")).toBe(true);
    expect(grants.every((g) => g.short === 0 && g.fallback === 0)).toBe(true);
    // Котёл суши не тревожим вовсе: всем хватило своей местности.
    expect(db.calls).toHaveLength(1);
  });

  it("своей местности не хватило — добор с любой суши", async () => {
    const [grant] = await grantsFor([{ terrainId: "mount", count: 8 }]);
    expect(grant.cells).toHaveLength(8);
    expect(grant.fallback).toBe(3);
    expect(grant.short).toBe(0);
    expect(grant.cells.filter((c) => terrainOf(c) === "mount")).toHaveLength(5);
  });

  it("клетки не пересекаются даже когда котёл отдаёт уже отданное", async () => {
    const grants = await grantsFor([
      { terrainId: "mount", count: 4 },
      { terrainId: null, count: 10 },
      { terrainId: "swamp", count: 2 },
    ]);
    expect(grants[0].cells).toHaveLength(4);
    expect(grants[1].cells).toHaveLength(10);
    expect(grants[2].cells).toHaveLength(2);
    // Заявка без местности обслуживается ПОСЛЕ именных: иначе «куда угодно»
    // разобрало бы редкие клетки, на которых обязан стоять свой босс.
    expect(grants[2].cells.every((c) => terrainOf(c) === "swamp")).toBe(true);
  });

  it("одну местность заявки делят по очереди, а не поровну", async () => {
    const grants = await grantsFor([
      { terrainId: "swamp", count: 2 },
      { terrainId: "swamp", count: 2 },
    ]);
    expect(grants[0].cells.filter((c) => terrainOf(c) === "swamp")).toHaveLength(2);
    expect(grants[1].cells.filter((c) => terrainOf(c) === "swamp")).toHaveLength(0);
    // Второму досталась суша из котла — это не ошибка, но и не «как просили».
    expect(grants[1].fallback).toBe(2);
  });

  it("вода в общий котёл не идёт, а недостача возвращается числом", async () => {
    const [grant] = await grantsFor([{ terrainId: null, count: 20 }]);
    expect(grant.cells).toHaveLength(DRY.length);
    expect(grant.short).toBe(20 - DRY.length);
    expect(grant.cells.some((c) => terrainOf(c) === "water")).toBe(false);
  });

  it("места нет вовсе — молчать нельзя", async () => {
    const grants = await grantsFor([
      { terrainId: "grass", count: 10 },
      { terrainId: "grass", count: 9 },
    ]);
    expect(grants[0].cells).toHaveLength(10);
    // Второму осталась только чужая суша: гор и болота семь клеток.
    expect(grants[1].cells).toHaveLength(7);
    expect(grants[1].short).toBe(2);
  });

  it("мусор в количестве не роняет подбор", async () => {
    const grants = await grantsFor([
      { terrainId: "mount", count: -5 },
      { terrainId: "swamp", count: Number.NaN },
      { terrainId: "grass", count: 2.7 },
    ]);
    expect(grants[0].cells).toHaveLength(0);
    expect(grants[1].cells).toHaveLength(0);
    expect(grants[2].cells).toHaveLength(2);
  });

  it("пустой список заявок базу не тревожит", async () => {
    expect(await pickCells("map-1", [])).toEqual([]);
    expect(db.calls).toHaveLength(0);
  });
});

describe("pickCells — только эти местности (уровень местности)", () => {
  it("добор недостачи не выходит за разрешённые местности", async () => {
    // Болото — две клетки; разрешены болото и горы: добор только из гор.
    const grants = await grantsFor([
      { terrainId: "swamp", count: 4, terrains: ["swamp", "mount"] },
    ]);
    expect(grants[0].cells.every((c) => ["swamp", "mount"].includes(terrainOf(c)))).toBe(true);
    expect(grants[0].short).toBe(0);
  });

  it("разрешённых клеток не хватает — недостача, а не чужая суша", async () => {
    const grants = await grantsFor([{ terrainId: null, count: 4, terrains: ["swamp"] }]);
    expect(grants[0].cells).toHaveLength(2);
    expect(grants[0].short).toBe(2);
    expect(grants[0].cells.every((c) => terrainOf(c) === "swamp")).toBe(true);
  });

  it("уровня нет ни у одной местности — ни одного места", async () => {
    const grants = await grantsFor([{ terrainId: null, count: 3, terrains: [] }]);
    expect(grants[0].cells).toHaveLength(0);
    expect(grants[0].short).toBe(3);
  });
});
