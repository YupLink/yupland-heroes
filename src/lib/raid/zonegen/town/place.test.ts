// Органический рост целиком: `bun run test`.
//
// Проверяем приёмочные метрики спецификации (шаг 15,
// docs/town-generation-algorithm.json), а не конкретные клетки: «ратуша в
// центре и одна», «храм в двух от ратуши и не на магистрали», «таверна у
// ворот», «кузница у края», «каждая постройка выходит на улицу», «дома реже к
// краю», «ни на дороге, ни на воде, ни на чужом, ни на декоре», тот же сид —
// тот же город, другой сид — другой состав.
import { describe, expect, it } from "vitest";
import type { ZoneStructure } from "@/lib/raid/zonegen/settlement-types";
import { buildFields } from "@/lib/raid/zonegen/town/fields";
import { disk, hexDist, keyOf, neighborKeys } from "@/lib/raid/zonegen/town/hex";
import { placeTown } from "@/lib/raid/zonegen/town/place";
import type {
  RoleOption,
  TownInput,
  TownResult,
  TownSkeleton,
} from "@/lib/raid/zonegen/town/types";
import { OPTIONS, townInput, zone as disc } from "@/test/townFixture";
import { roadAlongQ, shuffled } from "@/test/townSkeletonFixture";

const byId = new Map(OPTIONS.map((o) => [o.id, o]));
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];

const input = (over: Partial<TownInput> = {}): TownInput =>
  townInput({ seed: 1, buildings: 30, ...over });

type Built = { s: ZoneStructure; o: RoleOption; k: string };
const built = (res: TownResult): Built[] =>
  res.structures
    .filter((s) => typeof s.buildingId === "string")
    .map((s) => ({ s, o: byId.get(s.buildingId as string) as RoleOption, k: keyOf(s) }));

const sk = (res: TownResult): TownSkeleton => {
  if (res.skeleton === null) throw new Error("скелета нет");
  return res.skeleton;
};
const roadKeys = (s: TownSkeleton): Set<string> =>
  new Set([...s.roads.keys(), ...s.plaza.map(keyOf)]);
const ofRole = (res: TownResult, role: string) => built(res).filter((b) => b.o.role === role);
const plain = (res: TownResult) =>
  JSON.stringify({ structures: res.structures, report: res.report });

describe("placeTown — город растёт по правилам", () => {
  it("тот же сид — тот же город клетка в клетку; другой сид — другой состав", () => {
    expect(plain(placeTown(input({ seed: 11 })))).toBe(plain(placeTown(input({ seed: 11 }))));
    const sets = new Set(
      SEEDS.map((seed) => JSON.stringify(placeTown(input({ seed })).report.byBuilding)),
    );
    expect(sets.size).toBeGreaterThan(SEEDS.length / 2);
  });

  it("порядок клеток на входе не влияет на город (ничьи — хешем клетки)", () => {
    const sorted = (r: TownResult) =>
      JSON.stringify([...r.structures].sort((a, b) => a.q - b.q || a.r - b.r));
    const a = placeTown(input({ seed: 4 }));
    const b = placeTown(input({ seed: 4, cells: shuffled(disc(10)) }));
    expect(sorted(b)).toBe(sorted(a));
  });

  it("ратуша в центре и одна; вокруг неё — только дома и улицы", () => {
    for (const seed of SEEDS) {
      const res = placeTown(input({ seed }));
      const halls = ofRole(res, "town_hall");
      expect(halls).toHaveLength(1);
      expect(halls[0].k).toBe(keyOf(sk(res).center));
      const bare = res.structures.filter(
        (s) => typeof s.buildingId !== "string" && typeof s.roadId !== "string",
      );
      expect(bare).toEqual([]);
      expect(res.report.form).toBe("town");
    }
  });

  it("храм — в 2 от ратуши и не на магистрали", () => {
    for (const seed of SEEDS) {
      const res = placeTown(input({ seed }));
      const hall = ofRole(res, "town_hall")[0];
      for (const t of ofRole(res, "temple")) {
        expect(hexDist(t.s, hall.s)).toBe(2);
        expect(sk(res).roads.has(t.k)).toBe(false);
      }
    }
  });

  it("таверна — не дальше 2 от ворот; кузница — у края", () => {
    for (const seed of SEEDS) {
      const res = placeTown(input({ seed }));
      const s = sk(res);
      const toGate = (c: { q: number; r: number }) =>
        Math.min(...s.gates.map((g) => hexDist(c, g)));
      const taverns = ofRole(res, "tavern");
      if (taverns.length > 0)
        expect(Math.min(...taverns.map((t) => toGate(t.s)))).toBeLessThanOrEqual(2);
      const zone = buildFields(input({ seed }));
      for (const f of ofRole(res, "forge")) {
        const edge = Math.min(zone.dEdge.get(f.k) ?? 0, s.radius - hexDist(f.s, s.center));
        expect(edge).toBeLessThanOrEqual(2);
      }
    }
  });

  it("каждая постройка выходит на улицу, площадь или луг; второй ряд — только дома и ≤ 30 %", () => {
    for (const n of [6, 12, 30, 40]) {
      for (const seed of SEEDS) {
        const res = placeTown(input({ seed, buildings: n }));
        const s = sk(res);
        const front = new Set([...roadKeys(s), ...s.green.map(keyOf)]);
        const list = built(res);
        const back = list.filter((b) => !neighborKeys(b.k).some((x) => front.has(x)));
        for (const b of back) expect(["market", "house", "chambers"]).toContain(b.o.role);
        expect(back.length).toBeLessThanOrEqual(Math.ceil(0.3 * list.length));
      }
    }
  });

  it("дома реже к краю: доля занятых лотов в ядре выше, чем на краю", () => {
    let coreLots = 0;
    let coreBuilt = 0;
    let edgeLots = 0;
    let edgeBuilt = 0;
    for (const seed of SEEDS) {
      const res = placeTown(input({ seed, buildings: 24 }));
      const s = sk(res);
      const roads = roadKeys(s);
      const taken = new Set(built(res).map((b) => b.k));
      for (const c of disk(s.center, s.radius)) {
        const k = keyOf(c);
        if (roads.has(k) || !neighborKeys(k).some((x) => roads.has(x))) continue;
        const inner = hexDist(c, s.center) <= s.radius / 2;
        if (inner) coreLots++;
        else edgeLots++;
        if (taken.has(k) && inner) coreBuilt++;
        if (taken.has(k) && !inner) edgeBuilt++;
      }
    }
    expect(coreBuilt / coreLots).toBeGreaterThan(edgeBuilt / edgeLots);
  });

  it("ни на дороге, ни на воде, ни на занятом, ни на декоре", () => {
    const water = new Set(disk({ q: 5, r: -5 }, 2).map(keyOf));
    const occupied = new Set(["1,2", "-2,3", "3,-1", "-3,0"]);
    const decorBlocked = new Set(["2,2", "-1,-2", "0,3", "4,1"]);
    const mapRoads = roadAlongQ(4, -12, 12);
    for (const seed of SEEDS) {
      const res = placeTown(input({ seed, water, occupied, decorBlocked, mapRoads }));
      const roads = roadKeys(sk(res));
      for (const b of built(res)) {
        for (const bad of [water, occupied, decorBlocked, mapRoads, roads])
          expect(bad.has(b.k)).toBe(false);
      }
      for (const s of res.structures) {
        if (typeof s.roadId === "string")
          expect(water.has(keyOf(s)) || occupied.has(keyOf(s))).toBe(false);
      }
    }
  });

  it("постройка едет одним патчем: тир, облик темы, без декора", () => {
    const res = placeTown(input({ seed: 3, theme: "Юпик" }));
    expect(res.report.theme).toBe("Юпик");
    for (const b of built(res)) {
      expect(b.s.decorationId).toBeNull();
      if (b.o.tiers > 0) expect(b.s.tier).toBe(b.o.tiers - 1);
      if (b.s.buildingSkinId !== undefined) {
        expect((b.o.skins ?? []).map((x) => x.id)).toContain(b.s.buildingSkinId);
      }
    }
    // У «Таверны» облик темы есть — она обязана встать в нём; у «Бара» облика нет.
    for (const t of built(res).filter((b) => b.o.id === "tavern")) {
      expect(t.s.buildingSkinId).toBe("tav_Юпик");
    }
    const skinned = built(res).filter((b) => b.s.buildingSkinId !== undefined);
    expect(skinned.length).toBeGreaterThan(0);
  });

  it("ручной состав: точные штуки встают, недобора в просторной зоне нет", () => {
    const manual = [
      { buildingId: "tavern", count: 1 },
      { buildingId: "wh", count: 1 },
      { buildingId: "m1", count: 0, fill: true },
      { buildingId: "m2", count: 0, fill: true },
    ];
    const res = placeTown(input({ seed: 5, buildings: 10, manual }));
    expect(res.report.byBuilding["Таверна"]).toBe(1);
    expect(res.report.byBuilding["Склад"]).toBe(1);
    expect(res.report.shortfall).toBe(0);
    expect(res.report.buildings).toBeGreaterThan(2);
  });

  it("дороги пишутся только в выделении и не поверх дороги карты", () => {
    const mapRoads = roadAlongQ(0, -12, 12);
    const res = placeTown(input({ seed: 2, mapRoads }));
    const zone = new Set(disc(10).map(keyOf));
    for (const s of res.structures) {
      if (typeof s.roadId !== "string") continue;
      expect(zone.has(keyOf(s))).toBe(true);
      expect(mapRoads.has(keyOf(s))).toBe(false);
    }
    expect(res.structures.every((s) => zone.has(keyOf(s)))).toBe(true);
  });
});
