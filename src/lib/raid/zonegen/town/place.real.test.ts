// Рост на ЖИВОМ справочнике (82 шаблона, облики владельца по темам) на поле
// 30×30 с рекой у южного края и дорогой карты насквозь — так, как админ
// выделяет зону на карте. Проверяет то, что обещают готовые шаблоны: заказ
// «Хутор/Лагерь/Порт» даёт свою форму, правила зонирования спецификации
// (docs/town-generation-algorithm.json) не нарушаются, облики — одной темы.
import { describe, expect, it } from "vitest";
import { hexDist, parseKey } from "@/lib/raid/zonegen/town/hex";
import { placeTown } from "@/lib/raid/zonegen/town/place";
import { toRoleOptions } from "@/lib/raid/zonegen/town/roles";
import type { TownInput } from "@/lib/raid/zonegen/town/types";
import { REAL_CATALOG, realField } from "@/test/realCatalog";
import { densityCoreEdge, skinViolations, zoningViolations } from "@/test/townRules";

const OPTIONS = toRoleOptions(REAL_CATALOG);
const FIELD = realField();

const input = (seed: number, buildings: number, kind: TownInput["kind"], roads = true) => ({
  cells: FIELD.cells,
  occupied: new Set<string>(),
  water: FIELD.water,
  decorBlocked: new Set<string>(),
  mapRoads: roads ? FIELD.mapRoads : new Set<string>(),
  seed,
  buildings,
  theme: "",
  kind,
  options: OPTIONS,
  manual: null,
  roadId: "road",
  built: true,
});

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
const CASES = [
  { n: 7, kind: "hamlet", form: "hamlet" },
  { n: 12, kind: "auto", form: "street" },
  { n: 24, kind: "auto", form: "town" },
  { n: 18, kind: "port", form: "port" },
  { n: 5, kind: "camp", form: "camp" },
] as const;

describe("placeTown на живом справочнике", () => {
  it("заказ шаблона даёт свою форму, все постройки встают", { timeout: 30_000 }, () => {
    for (const c of CASES) {
      for (const seed of SEEDS) {
        const res = placeTown(input(seed, c.n, c.kind));
        expect(res.report.form, `${c.kind} ${c.n} сид ${seed}`).toBe(c.form);
        expect(res.report.buildings + res.report.shortfall).toBe(c.n);
      }
    }
  });

  it("правила зонирования и облики: ни одного нарушения", { timeout: 30_000 }, () => {
    for (const c of CASES) {
      for (const seed of SEEDS) {
        for (const roads of [true, false]) {
          const inp = input(seed, c.n, c.kind, roads);
          const res = placeTown(inp);
          const bad = [...zoningViolations(res, inp), ...skinViolations(res, OPTIONS)];
          expect(bad, `${c.kind} ${c.n} сид ${seed} дороги ${roads}`).toEqual([]);
        }
      }
    }
  });

  it("плотность падает к краю (закон Кларка)", () => {
    for (const c of CASES.filter((x) => x.n >= 12)) {
      let core = 0;
      let edge = 0;
      for (const seed of SEEDS) {
        const inp = input(seed, c.n, c.kind);
        const [a, b] = densityCoreEdge(placeTown(inp), inp);
        core += a;
        edge += b;
      }
      expect(core, `${c.kind} ${c.n}`).toBeGreaterThan(edge);
    }
  });

  it("порт: центр в ≤ 3 от воды, верфь на берегу", () => {
    const res = placeTown(input(1, 18, "port"));
    const center = res.skeleton?.center;
    expect(center).toBeDefined();
    const near = [...FIELD.water].some(
      (k) => center !== undefined && hexDist(parseKey(k), center) <= 3,
    );
    expect(near).toBe(true);
    expect(res.placed.some((p) => p.role === "shipyard")).toBe(true);
  });

  it("деревня у реки не получает верфь и ратушу, если место от воды далеко", () => {
    for (const seed of SEEDS) {
      const res = placeTown(input(seed, 12, "auto"));
      expect(res.placed.some((p) => p.role === "shipyard" || p.role === "town_hall")).toBe(false);
      expect(res.report.shortfall).toBe(0);
    }
  });

  it("тот же сид — тот же JSON; разные сиды — разные подборки и темы", () => {
    expect(JSON.stringify(placeTown(input(9, 24, "auto")))).toBe(
      JSON.stringify(placeTown(input(9, 24, "auto"))),
    );
    const runs = SEEDS.map((s) => placeTown(input(s, 24, "auto")).report);
    expect(new Set(runs.map((r) => JSON.stringify(r.byBuilding))).size).toBe(SEEDS.length);
    expect(new Set(runs.map((r) => r.theme)).size).toBeGreaterThanOrEqual(3);
  });
});
