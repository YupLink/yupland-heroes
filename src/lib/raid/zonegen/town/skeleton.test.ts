// Скелет органического поселения: форма, ворота, магистрали. `bun run test`.
//
// Проверяем законы спецификации (docs/town-generation-algorithm.json), а не
// «красиво ли»: форма выводится из местности, а не задаётся (шаг 3); ворота —
// на краю и разнесены (шаг 4); магистрали связны и ведут к площади или лугу
// (шаги 5–6, 15). Местность, дорога карты и детерминизм —
// skeleton.terrain.test.ts.
import { describe, expect, it } from "vitest";
import { buildFields, dist } from "@/lib/raid/zonegen/town/fields";
import { gateSpacing } from "@/lib/raid/zonegen/town/gates";
import { angleAt, hexDist, keyOf, parseKey } from "@/lib/raid/zonegen/town/hex";
import type { TownForm, TownSkeleton } from "@/lib/raid/zonegen/town/types";
import {
  build,
  disc,
  FORM_CASES,
  hubRoads,
  roadAlongQ,
  roadReach,
  seedWith,
  skelInput,
  VILLAGE,
} from "@/test/townSkeletonFixture";

const built = FORM_CASES.map((c) => ({ ...c, sk: build(c.input, c.comp, c.n) }));
const rows = built.map((b) => [b.form, b] as const);
const of = (f: TownForm): TownSkeleton => built.find((b) => b.form === f)?.sk as TownSkeleton;

describe("форма выводится из ограничений (шаг 3)", () => {
  it.each(rows)("%s распознаётся на своём поле", (form, b) => {
    expect(b.sk.form).toBe(form);
  });

  it("лагерь тесный (Rb = 2), городок и порт — от Rb 4", () => {
    expect(of("camp").radius).toBe(2);
    expect(of("town").radius).toBeGreaterThanOrEqual(4);
    expect(of("port").radius).toBeGreaterThanOrEqual(4);
  });

  it("тупик дороги карты даёт круглую деревню, луг не ложится на дорогу", () => {
    const roads = roadAlongQ(0, 3, 20);
    const sk = build(skelInput(disc(12), { seed: 3, mapRoads: roads }), VILLAGE, 10);
    expect(sk.form).toBe("round");
    expect(sk.green).toHaveLength(7);
    expect(sk.green.some((c) => roads.has(keyOf(c)))).toBe(false);
    expect(sk.gates).toHaveLength(1);
    expect(roads.has(keyOf(sk.gates[0]))).toBe(true);
  });

  it("чаща в круге Rb (> 20 %) — не круглая, а кучевая деревня", () => {
    const trees = new Set(
      disc(5)
        .filter((c) => (c.q * 7 + c.r * 13) % 3 === 0 && keyOf(c) !== "0,0")
        .map(keyOf),
    );
    const input = skelInput(disc(12), { seed: seedWith(3, 1), decorBlocked: trees });
    expect(build(input, VILLAGE, 10).form).toBe("cluster");
    // Контроль: без чащи то же поле и тот же сид — круглая.
    expect(build({ ...input, decorBlocked: new Set() }, VILLAGE, 10).form).toBe("round");
  });

  it("деревня с ратушей становится городком: ратуше нужна площадь", () => {
    const input = skelInput(disc(12), { seed: seedWith(3, 1) });
    const sk = build(input, { ...VILLAGE, hall: true }, 10);
    expect(sk.form).toBe("town");
    expect(sk.plaza.length).toBeGreaterThanOrEqual(4);
  });

  it("мало построек без центральных функций — хутор даже у тракта", () => {
    const input = skelInput(disc(12), { seed: 3, mapRoads: roadAlongQ(1, -20, 20) });
    expect(build(input, { hall: false, temple: false, tavern: false }, 7).form).toBe("hamlet");
  });
});

describe("въезды на краю и разнесены (шаг 4)", () => {
  const COUNT: Record<TownForm, [number, number]> = {
    camp: [1, 1],
    round: [1, 1],
    hamlet: [1, 2],
    street: [2, 2],
    green: [2, 2],
    cluster: [2, 3],
    town: [2, 4],
    port: [2, 4],
  };

  it.each(rows)("%s: число ворот по форме, на контуре, с разносом", (form, b) => {
    const { sk } = b;
    const fields = buildFields(b.input);
    const [lo, hi] = COUNT[form];
    expect(sk.gates.length).toBeGreaterThanOrEqual(lo);
    expect(sk.gates.length).toBeLessThanOrEqual(hi);
    for (const g of sk.gates) {
      expect(fields.land.has(keyOf(g))).toBe(true);
      // Центр мог сдвинуться на ≤ 2 (площадь, луг, ось) — ворота на контуре исходного.
      const edge = fields.dEdge.get(keyOf(g)) === 0;
      expect(edge || Math.abs(hexDist(g, sk.center) - sk.radius) <= 2).toBe(true);
    }
    for (let i = 0; i < sk.gates.length; i++) {
      for (let j = i + 1; j < sk.gates.length; j++) {
        expect(hexDist(sk.gates[i], sk.gates[j])).toBeGreaterThanOrEqual(gateSpacing(sk.radius));
      }
    }
  });

  it("луговая деревня: два въезда напротив (≥ 120° от центра)", () => {
    const sk = of("green");
    expect(angleAt(sk.center, sk.gates[0], sk.gates[1])).toBeGreaterThanOrEqual(120);
  });

  it("у порта ворота со стороны суши, к воде ведёт отдельная улица-причал", () => {
    const b = built.find((x) => x.form === "port") as (typeof built)[number];
    const fields = buildFields(b.input);
    for (const g of b.sk.gates) expect(dist(fields.dWater, keyOf(g))).toBeGreaterThan(1);
    const pier = [...b.sk.roads].filter(
      ([k, rank]) => rank === 0.5 && dist(fields.dWater, k) === 1,
    );
    expect(pier.length).toBeGreaterThan(0);
  });
});

describe("магистрали (шаг 6) и связность (шаг 15)", () => {
  it.each(rows)("%s: каждые ворота связаны с ядром по дорогам", (_f, b) => {
    const reach = roadReach(b.sk.roads, hubRoads(b.sk));
    expect(reach.size).toBeGreaterThan(0);
    for (const g of b.sk.gates) expect(reach.has(keyOf(g)), `ворота ${keyOf(g)}`).toBe(true);
  });

  it.each(rows)("%s: дороги только по суше зоны", (_f, b) => {
    const fields = buildFields(b.input);
    for (const k of b.sk.roads.keys()) expect(fields.land.has(k), k).toBe(true);
  });

  it("городок: площадь — кольцо 1 из дороги, ратуша (центр) — не дорога", () => {
    const sk = of("town");
    expect(sk.plaza).toHaveLength(6);
    for (const c of sk.plaza) {
      expect(hexDist(c, sk.center)).toBe(1);
      expect(sk.roads.get(keyOf(c))).toBe(1);
    }
    expect(sk.roads.has(keyOf(sk.center))).toBe(false);
  });

  it("спицы сходятся к площади: у каждой клетки площади путь к любым воротам", () => {
    const sk = of("town");
    for (const c of sk.plaza) {
      const reach = roadReach(sk.roads, [keyOf(c)]);
      for (const g of sk.gates) expect(reach.has(keyOf(g))).toBe(true);
    }
  });

  it("в луг дорога не пишется, у лагеря костёр свободен", () => {
    for (const f of ["round", "green", "camp"] as TownForm[]) {
      const sk = of(f);
      expect(sk.green.length, f).toBeGreaterThan(0);
      for (const c of sk.green) expect(sk.roads.has(keyOf(c)), `${f} ${keyOf(c)}`).toBe(false);
    }
  });

  it("круглая деревня: спица кончается на кольце дворов (кольцо 2)", () => {
    const sk = of("round");
    const inner = [...sk.roads.keys()].filter((k) => hexDist(parseKey(k), sk.center) < 2);
    expect(inner).toHaveLength(0);
  });
});
