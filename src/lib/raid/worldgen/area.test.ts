// Города мира: растут на суше, у ратуши сразу настройка (имя + шаблон образца),
// лавки привязаны к ратуше своего города, тракты — только по суше; под домом
// и дорогой ни декора, ни объекта; карта с краем не вылезает за край.
import { beforeAll, describe, expect, it } from "vitest";
import { axialToOffset } from "@/lib/hex-renderer";
import { generateArea } from "@/lib/raid/worldgen/area";
import { makeWorld } from "@/lib/raid/worldgen/field";
import { chunksOfSize } from "@/lib/raid/worldgen/geo";
import { hallConfig, townName } from "@/lib/raid/worldgen/hall";
import { anchorOf } from "@/lib/raid/worldgen/links";
import type { BuiltTown } from "@/lib/raid/worldgen/town";
import { DIRS, hexDist, keyOf } from "@/lib/raid/zonegen/town/hex";
import type { WorldArea } from "@/lib/raid/worldgen/spec";
import { GOODS, OCEAN, TEST_CATALOG, WATER, testSpec } from "@/test/worldSpec";

let area: WorldArea;
beforeAll(() => {
  area = generateArea(makeWorld(testSpec(8)), {
    chunks: chunksOfSize(128),
    bounds: { size: 128 },
    catalog: TEST_CATALOG,
  });
});

const isWater = (id: string) => id === WATER || id === OCEAN;

describe("карта 128 с краем", () => {
  it("ровно 128 × 128 клеток, все внутри края", () => {
    expect(area.cells).toHaveLength(128 * 128);
    for (const c of area.cells) {
      const { col, row } = axialToOffset(c.q, c.r);
      expect(col >= 0 && col < 128 && row >= 0 && row < 128).toBe(true);
    }
  });

  it("города есть, у части — ратуша; дома на суше, тракты по суше", () => {
    expect(area.towns.length).toBeGreaterThanOrEqual(4);
    expect(area.halls.length).toBeGreaterThanOrEqual(2);
    const built = area.cells.filter((c) => c.buildingId !== null || c.roadId !== null);
    expect(built.length).toBeGreaterThan(100);
    expect(built.filter((c) => isWater(c.terrainId))).toEqual([]);
    expect(area.roads).toBeGreaterThan(0);
  });

  it("под домом и дорогой — ни декора, ни объекта; объект не на декоре", () => {
    for (const c of area.cells) {
      if (c.buildingId !== null || c.roadId !== null) {
        expect([c.decorationId, c.objectId]).toEqual([null, null]);
      }
      if (c.decorationId !== null) expect(c.objectId).toBeNull();
    }
  });

  it("ратуша стоит на клетке с ратушей и сразу настроена: имя и товары образца", () => {
    const byKey = new Map(area.cells.map((c) => [`${c.q},${c.r}`, c]));
    for (const h of area.halls) {
      const cell = byKey.get(`${h.q},${h.r}`);
      expect(TEST_CATALOG.byId.get(cell?.buildingId ?? "")?.effect).toBe("town_hall");
      expect(h.config).toMatchObject({ residents: 200, goods: GOODS });
      expect(String(h.config.name).length).toBeGreaterThan(2);
    }
  });

  it("лавка привязана к ратуше своего города (рядом, не через полкарты)", () => {
    expect(area.shops.length).toBeGreaterThan(0);
    const byKey = new Map(area.cells.map((c) => [`${c.q},${c.r}`, c]));
    for (const s of area.shops) {
      expect(TEST_CATALOG.byId.get(byKey.get(`${s.q},${s.r}`)?.buildingId ?? "")?.effect).toBe(
        "market",
      );
      expect(area.halls.some((h) => h.q === s.hallQ && h.r === s.hallR)).toBe(true);
      expect(hexDist(s, { q: s.hallQ, r: s.hallR })).toBeLessThanOrEqual(12);
    }
  });
});

describe("имя и настройка ратуши", () => {
  it("имя — от сида: то же для того же города, разные у разных", () => {
    expect(townName(5)).toBe(townName(5));
    const names = new Set(Array.from({ length: 50 }, (_, i) => townName(i * 7919)));
    expect(names.size).toBeGreaterThan(30);
  });

  it("шаблонов нет — ратуша с именем и без товаров (настроит админ)", () => {
    expect(hallConfig([], 3, "Ирий")).toEqual({ name: "Ирий", residents: 0, goods: [] });
  });
});

describe("тракт выходит с улицы", () => {
  const town = (structures: BuiltTown["structures"]): BuiltTown =>
    ({ center: { q: 0, r: 0 }, structures }) as BuiltTown;

  it("в центре ратуша — тракт начинается с ближайшей к соседу улицы, не с дома", () => {
    const t = town([
      { q: 0, r: 0, buildingId: "hall" },
      { q: 1, r: 0, roadId: "road" },
      { q: -1, r: 0, roadId: "road" },
    ]);
    const taken = new Map([["0,0", "building" as const]]);
    expect(anchorOf(t, { q: 9, r: 0 }, taken)).toEqual({ q: 1, r: 0 });
    expect(anchorOf(t, { q: -9, r: 0 }, taken)).toEqual({ q: -1, r: 0 });
  });

  it("улиц нет: центр — если свободен; занят домом — тракта нет", () => {
    expect(anchorOf(town([]), { q: 5, r: 0 }, new Map())).toEqual({ q: 0, r: 0 });
    expect(anchorOf(town([]), { q: 5, r: 0 }, new Map([["0,0", "building" as const]]))).toBeNull();
  });
});

describe("лабиринт: проход ко всему", () => {
  const walk = new Set(testSpec(8).walk);
  const passable = (c: WorldArea["cells"][number]) =>
    !isWater(c.terrainId) && (c.decorationId === null || walk.has(c.decorationId));

  it("из любой свободной клетки суши можно дойти до любой другой на том же куске суши", () => {
    const at = new Map(area.cells.map((c) => [keyOf(c), c]));
    const flood = (start: string, ok: (k: string) => boolean): Set<string> => {
      const seen = new Set([start]);
      const queue = [start];
      while (queue.length > 0) {
        const c = area.cells.length > 0 ? queue.shift()! : "";
        const [q, r] = c.split(",").map(Number);
        for (const [dq, dr] of DIRS) {
          const n = `${q + dq},${r + dr}`;
          if (!seen.has(n) && at.has(n) && ok(n)) {
            seen.add(n);
            queue.push(n);
          }
        }
      }
      return seen;
    };
    const done = new Set<string>();
    let pieces = 0;
    for (const c of area.cells) {
      const k = keyOf(c);
      if (done.has(k) || isWater(c.terrainId)) continue;
      const land = flood(k, (n) => !isWater(at.get(n)!.terrainId));
      land.forEach((x) => done.add(x));
      const free = [...land].filter((x) => passable(at.get(x)!));
      if (free.length === 0) continue;
      pieces++;
      const reached = flood(free[0], (n) => land.has(n) && passable(at.get(n)!));
      expect(reached.size, `кусок суши у ${k}`).toBe(free.length);
    }
    expect(pieces).toBeGreaterThan(0);
  });

  it("декор остался — лабиринт, а не поле", () => {
    const land = area.cells.filter((c) => !isWater(c.terrainId));
    const decor = land.filter((c) => c.decorationId !== null).length;
    expect(decor / land.length).toBeGreaterThan(0.12);
  });

  it("дороги есть и вне городов — между областями земель", () => {
    const far = area.cells.filter(
      (c) => c.roadId !== null && area.towns.every((t) => hexDist(c, t) > 12),
    );
    expect(far.length).toBeGreaterThan(20);
  });
});
