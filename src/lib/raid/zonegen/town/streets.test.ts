// Цена дороги, улицы по требованию и петли. `bun run test`.
//
// Спецификация (docs/town-generation-algorithm.json): готовая дорога стоит 0.2
// против 1.0 у свободной клетки (шаг 6) — поэтому путь ложится на дорогу
// карты даже в обход; улица растёт к цели не длиннее 3/5, ответвляется под
// 60°/120°, не липнет к соседней улице и не уходит от построек (шаг 10);
// соединитель кладёт перемычку только при длинном обходе (шаг 12).
import { describe, expect, it } from "vitest";
import { buildFields } from "@/lib/raid/zonegen/town/fields";
import {
  DIRS,
  dirIndex,
  disk,
  hexDist,
  key,
  keyOf,
  neighborKeys,
  parseKey,
  turnSteps,
} from "@/lib/raid/zonegen/town/hex";
import { route, type RoadNet } from "@/lib/raid/zonegen/town/roads";
import { connectLoops, growStreet, type StreetNet } from "@/lib/raid/zonegen/town/streets";
import type { TownFields, TownForm, TownSkeleton } from "@/lib/raid/zonegen/town/types";
import { build, disc, FORM_CASES, skelInput } from "@/test/townSkeletonFixture";

/** Дорога карты с большим крюком: A(−4,0) → на юг 3 → на восток 8 → на север 3 → B(4,0). */
function bow(): Set<string> {
  const out = new Set<string>(["-4,0"]);
  for (let r = 1; r <= 3; r++) out.add(key(-4, r));
  for (let q = -3; q <= 4; q++) out.add(key(q, 3));
  for (let r = 2; r >= 0; r--) out.add(key(4, r));
  return out;
}

const netOn = (fields: TownFields, roads = new Map<string, number>()): RoadNet => ({
  fields,
  roads,
  reserved: new Set(),
  cuttable: new Set(),
  seed: 1,
  center: { q: 0, r: 0 },
  radius: 4,
});

describe("цена шага (шаг 6)", () => {
  it("путь идёт по дороге карты в обход, а не напрямик: 0.2 против 1.0", () => {
    const roads = bow();
    const fields = buildFields(skelInput(disc(10), { mapRoads: roads }));
    const path = route(netOn(fields), ["-4,0"], new Set(["4,0"]));
    expect(path).not.toBeNull();
    for (const k of path as string[]) expect(roads.has(k), `${k} мимо дороги`).toBe(true);
    // Контроль: без дороги карты тот же путь — прямой, 8 шагов.
    const bare = route(netOn(buildFields(skelInput(disc(10)))), ["-4,0"], new Set(["4,0"]));
    expect(bare).toHaveLength(9);
  });

  it("вода и чужое непроходимы", () => {
    const water = new Set(
      disc(10)
        .filter((c) => c.q === 0 && c.r > -6)
        .map(keyOf),
    );
    const fields = buildFields(skelInput(disc(10), { water, occupied: new Set(["0,-6"]) }));
    const path = route(netOn(fields, new Map()), ["-3,0"], new Set(["3,0"]));
    expect(path).not.toBeNull();
    for (const k of path as string[]) expect(fields.land.has(k), k).toBe(true);
  });
});

const town = FORM_CASES.find((c) => c.form === "town") as (typeof FORM_CASES)[number];

/** Свежая сеть из скелета городка: growStreet меняет roads, тесты не делят её. */
function freshNet(form: TownForm = "town", built: Set<string> = new Set()): StreetNet {
  const sk = build(town.input, town.comp, town.n);
  const skeleton: TownSkeleton = { ...sk, form, roads: new Map(sk.roads) };
  return { fields: buildFields(town.input), skeleton, seed: 3, built };
}

const roadDist = (roads: ReadonlyMap<string, number>, c: { q: number; r: number }): number =>
  Math.min(...[...roads.keys()].map((k) => hexDist(parseKey(k), c)));

/** Клетка суши у города (Rb + 4) на расстоянии ровно d от сети (первая по (q, r)). */
function targetAt(net: StreetNet, d: number) {
  const sk = net.skeleton;
  const cells = disk(sk.center, sk.radius + 4)
    .filter((c) => net.fields.land.has(keyOf(c)) && roadDist(sk.roads, c) === d)
    .sort((a, b) => a.q - b.q || a.r - b.r);
  expect(cells.length, `нет цели на расстоянии ${d}`).toBeGreaterThan(0);
  return cells[0];
}

describe("улица по требованию (шаг 10)", () => {
  it("дорастает до цели: цель становится лотом, клетки — суша, ранг улицы", () => {
    const net = freshNet();
    const before = new Set(net.skeleton.roads.keys());
    const target = targetAt(net, 3);
    const added = growStreet(net, target);
    expect(added.length).toBeGreaterThan(0);
    expect(added.length).toBeLessThanOrEqual(5);
    for (const c of added) {
      expect(before.has(keyOf(c))).toBe(false);
      expect(net.fields.land.has(keyOf(c))).toBe(true);
      expect(net.skeleton.roads.get(keyOf(c))).toBe(0.5);
    }
    expect(roadDist(net.skeleton.roads, target)).toBe(1);
    // Вторая просьба к той же цели ничего не добавляет: она уже у дороги.
    expect(growStreet(net, target)).toHaveLength(0);
  });

  it("ответвление 60°/120°, дальше первой клетки — не вплотную к чужой улице", () => {
    const net = freshNet();
    const before = new Set(net.skeleton.roads.keys());
    const added = growStreet(net, targetAt(net, 4));
    expect(added.length).toBeGreaterThan(1);
    const first = added[0];
    const parents = neighborKeys(keyOf(first)).filter((k) => before.has(k));
    expect(parents.length).toBeGreaterThan(0);
    // Хотя бы один родитель, от которого ветка не продолжает его ось навылет.
    const ok = parents.some((p) => {
      const pc = parseKey(p);
      const axes = DIRS.map((_, i) => i).filter((i) =>
        before.has(key(pc.q + DIRS[i][0], pc.r + DIRS[i][1])),
      );
      const out = dirIndex(pc, first);
      return axes.length <= 1 || axes.every((a) => turnSteps(a, out) !== 3);
    });
    expect(ok).toBe(true);
    for (const c of added.slice(1, -1)) {
      expect(
        neighborKeys(keyOf(c)).some((n) => before.has(n)),
        keyOf(c),
      ).toBe(false);
    }
  });

  it("в деревне улица не длиннее 3 клеток (остаток обрезан), в городе — 5", () => {
    // До соседа цели на расстоянии 5 нужно ≥ 4 новых клеток.
    const village = freshNet("cluster");
    expect(growStreet(village, targetAt(village, 5))).toHaveLength(3);
    const city = freshNet("town");
    const len = growStreet(city, targetAt(city, 5)).length;
    expect(len).toBeGreaterThanOrEqual(4);
    expect(len).toBeLessThanOrEqual(5);
  });

  it("не дальше 2 клеток от стоящих построек", () => {
    const probe = freshNet();
    const target = targetAt(probe, 2);
    const house = disk(target, 1).find(
      (c) => keyOf(c) !== keyOf(target) && roadDist(probe.skeleton.roads, c) === 3,
    );
    expect(house).toBeDefined();
    const near = freshNet("town", new Set([keyOf(house as { q: number; r: number })]));
    const added = growStreet(near, target);
    for (const c of added)
      expect(hexDist(c, house as { q: number; r: number })).toBeLessThanOrEqual(2);
    // Постройки далеко от сети — улице к ним не дотянуться, ничего не кладём.
    const far = freshNet("town", new Set(["-12,6"]));
    expect(growStreet(far, targetAt(far, 4))).toHaveLength(0);
  });
});

/** Сеть-подкова: два рукава по 7 клеток в 4 клетках друг от друга, дно внизу. */
function horseshoe(form: TownForm): StreetNet {
  const roads = new Map<string, number>();
  for (let r = 0; r <= 6; r++) {
    roads.set(key(0, r), 1);
    roads.set(key(4, r), 1);
  }
  for (let q = 0; q <= 4; q++) roads.set(key(q, 6), 1);
  const skeleton: TownSkeleton = {
    form,
    radius: 5,
    center: { q: 2, r: 3 },
    plaza: [],
    green: [],
    gates: [],
    roads,
  };
  return { fields: buildFields(skelInput(disc(10))), skeleton, seed: 1, built: new Set() };
}

describe("петли (шаг 12)", () => {
  it("город (k = 2.5): длинный обход получает перемычку ≤ 4 клеток между рукавами", () => {
    const net = horseshoe("town");
    const before = new Set(net.skeleton.roads.keys());
    const link = connectLoops(net);
    expect(link.length).toBeGreaterThan(0);
    expect(link.length).toBeLessThanOrEqual(4);
    const keys = link.map(keyOf);
    const touches = (q: number) =>
      keys.some((k) => neighborKeys(k).some((n) => before.has(n) && parseKey(n).q === q));
    expect(touches(0) && touches(4)).toBe(true);
    for (const k of keys) expect(net.skeleton.roads.has(k)).toBe(true);
  });

  it("кучевая (k = 4) оставляет тупики, хутор и лагерь петель не знают", () => {
    for (const form of ["cluster", "hamlet", "camp", "round"] as TownForm[]) {
      const net = horseshoe(form);
      const size = net.skeleton.roads.size;
      expect(connectLoops(net), form).toHaveLength(0);
      expect(net.skeleton.roads.size).toBe(size);
    }
  });
});
