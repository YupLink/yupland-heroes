// Лестница (§8.121) на сервере: над чем перелезть, куда встать, SQL шага.
import { describe, expect, it } from "vitest";
import { ladderLandRefusal, ladderOver } from "./move-step-ladder";
import { stepSql } from "./move-step-sql";
import type { StepFacts } from "./step-facts";

const f = (o: Partial<StepFacts> = {}): StepFacts => ({
  terrainId: "g",
  decorationId: null,
  decorationBlocks: false,
  objectId: null,
  objectKnown: false,
  voidFog: false,
  hpFound: false,
  hpValue: null,
  water: false,
  ocean: false,
  cost: 1,
  mine: false,
  berth: null,
  gate: null,
  ...o,
});

describe("ladderOver", () => {
  it("вода и преграда — да", () => {
    expect(ladderOver(f({ water: true }))).toBe(true);
    expect(ladderOver(f({ decorationBlocks: true, decorationId: "d" }))).toBe(true);
  });
  it("проходимое, мост, моб, постройка, шахта, купол, пустота — нет", () => {
    expect(ladderOver(f())).toBe(false);
    expect(ladderOver(f({ water: true, bridge: { a: true } as never }))).toBe(false);
    expect(ladderOver(f({ water: true, objectId: "boss:x", objectKnown: true }))).toBe(false);
    expect(ladderOver(f({ decorationBlocks: true, building: true }))).toBe(false);
    expect(ladderOver(f({ decorationBlocks: true, mine: true }))).toBe(false);
    expect(ladderOver(f({ water: true, voidFog: true }))).toBe(false);
    expect(ladderOver(null)).toBe(false);
  });
  it("добитый моб не держит — над ним можно, если клетка непроходима", () => {
    expect(
      ladderOver(
        f({ water: true, objectId: "boss:x", objectKnown: true, hpFound: true, hpValue: 0 }),
      ),
    ).toBe(true);
  });
});

describe("ladderLandRefusal", () => {
  it("вода, постройка, дверь — отказ; суша — можно", () => {
    expect(ladderLandRefusal(f({ water: true }))).toBe("braid.ladder_bad");
    expect(ladderLandRefusal(f({ building: true }))).toBe("braid.ladder_bad");
    expect(ladderLandRefusal(f({ gate: { config: {} as never, name: "Дверь" } }))).toBe(
      "braid.ladder_bad",
    );
    expect(ladderLandRefusal(f())).toBeNull();
  });
});

describe("stepSql с лестницей", () => {
  const sql = stepSql({
    acc: "'acc1'",
    mapId: "m",
    q: 2,
    r: 0,
    mode: "walk",
    guard: { from: { q: 0, r: 0 }, wallet: "w", cost: 1.5, op: "op1", ladder: { heroId: "h1" } },
  });
  it("лок рюкзака до WITH, строка лестницы под замком", () => {
    expect(sql.indexOf("pg_advisory_xact_lock(hashtext('bp:h1'))")).toBeLessThan(
      sql.indexOf("WITH"),
    );
    expect(sql).toContain("ci.is_ladder");
    expect(sql).toContain("FOR UPDATE OF h");
  });
  it("каждое использование — ещё 10 золота, только за применённый шаг (§8.121, 08.11)", () => {
    expect(sql).toContain(
      "FROM pos\n              CROSS JOIN LATERAL yuplink.res_move('acc1', 'gold', -10, 'ladder',",
    );
    expect(sql).toContain("'ladder:op1'");
    // CTE с золотом обязан стоять в итоговом SELECT — иначе Postgres его не выполнит.
    expect(sql).toContain("(SELECT count(*) FROM lgold)::int AS gold;");
  });
  it("шаг пишется только при лестнице, тратится одна и только за применённый шаг", () => {
    expect(sql).toContain("WHERE EXISTS (SELECT 1 FROM lsrc)");
    expect(sql).toContain("SET count = (s.count - 1)");
    expect(sql.match(/AND EXISTS \(SELECT 1 FROM pos\)/g)?.length).toBe(2);
  });
  it("обычный шаг — прежний текст", () => {
    const plain = stepSql({
      acc: "'acc1'",
      mapId: "m",
      q: 1,
      r: 0,
      mode: "walk",
      guard: { from: { q: 0, r: 0 }, wallet: "w", cost: 1, op: "op2" },
    });
    expect(plain).toContain("VALUES ('acc1', 1, 0, now(), 'm')");
    expect(plain).not.toContain("lsrc");
    expect(plain).not.toContain("pg_advisory_xact_lock");
  });
});
