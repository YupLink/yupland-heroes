// Остров новичка: случайные слабые боссы с обязательными призами и суша, по
// которой дойти до любого места (владелец, 14.10.2026).
import { describe, expect, it } from "vitest";
import { DIRS, keyOf } from "@/lib/raid/zonegen/town/hex";
import { axialToOffset } from "@/lib/hex-renderer";
import { ISLAND_SIZE } from "@/lib/raid/island/shape";
import { BOSS_COUNT, ISLAND_ARTIFACT, ISLAND_TRAINING_PACK } from "@/lib/raid/island/catalog";
import { parsePlaces } from "@/lib/raid/island/steps";
import type { Cell } from "@/lib/raid/worldgen/geo";
import { MANY, isWater, make, reach, spec } from "@/lib/raid/island/island.fixture";

describe("боссы и призы", () => {
  type Reward = { items: unknown[]; packs: unknown[] };

  // Много островов подряд: при общем прогоне (все тесты разом) дольше 5 с.
  const SLOW = { timeout: 60_000 };

  it("боссов 5–7, все слабые; артефакт и пак — у двух разных, не у первого", SLOW, () => {
    const counts = new Set<number>();
    const holders = new Set<number>();
    for (const seed of MANY) {
      const isl = make(seed);
      const at = new Map(isl.cells.map((c) => [keyOf(c), c]));
      const { monsters, artifact, pack } = isl.places;
      const n = monsters.length;
      expect(n).toBeGreaterThanOrEqual(BOSS_COUNT.min);
      expect(n).toBeLessThanOrEqual(BOSS_COUNT.max);
      counts.add(n);
      const cfg = (c: Cell) =>
        (at.get(keyOf(c))?.objectConfig as { rewardConfig: Reward }).rewardConfig;
      const withArt = monsters.filter((m) => cfg(m).items.length > 0);
      const withPack = monsters.filter((m) => cfg(m).packs.length > 0);
      expect(withArt).toEqual([artifact]);
      expect(withPack).toEqual([pack]);
      expect(cfg(artifact as Cell).items).toEqual([
        { itemTemplateId: ISLAND_ARTIFACT, toPlace: 1 },
      ]);
      expect(cfg(pack as Cell).packs).toEqual([{ packId: ISLAND_TRAINING_PACK, toPlace: 1 }]);
      expect(keyOf(artifact as Cell)).not.toBe(keyOf(pack as Cell));
      expect(keyOf(artifact as Cell)).not.toBe(keyOf(monsters[0]));
      expect(keyOf(pack as Cell)).not.toBe(keyOf(monsters[0]));
      holders.add(monsters.findIndex((m) => keyOf(m) === keyOf(artifact as Cell)));
    }
    // Случайно, а не «всегда второй»: число боссов и хозяин артефакта гуляют.
    expect(counts.size).toBeGreaterThan(1);
    expect(holders.size).toBeGreaterThan(1);
  });

  it("суша одним куском, без озёр; ногами — до каждой открытой клетки суши", SLOW, () => {
    for (const seed of MANY) {
      const isl = make(seed);
      const byKey = new Map(isl.cells.map((c) => [keyOf(c), c]));
      const land = isl.cells.filter((c) => !isWater(c.terrainId));
      // Связность суши (декор не в счёт) — один кусок.
      const seen = new Set([keyOf(land[0])]);
      const queue: Cell[] = [land[0]];
      while (queue.length > 0) {
        const c = queue.pop() as Cell;
        for (const [dq, dr] of DIRS) {
          const k = keyOf({ q: c.q + dq, r: c.r + dr });
          const n = byKey.get(k);
          if (!n || seen.has(k) || isWater(n.terrainId)) continue;
          seen.add(k);
          queue.push(n);
        }
      }
      expect(seen.size, `${seed}: клочки суши`).toBe(land.length);
      // Озёр нет: вся вода касается края рамки через воду.
      const water = isl.cells.filter((c) => isWater(c.terrainId));
      const edge = water.filter((c) => {
        const { col, row } = axialToOffset(c.q, c.r);
        return col === 0 || row === 0 || col === ISLAND_SIZE - 1 || row === ISLAND_SIZE - 1;
      });
      const sea = new Set(edge.map(keyOf));
      const wq: Cell[] = [...edge];
      while (wq.length > 0) {
        const c = wq.pop() as Cell;
        for (const [dq, dr] of DIRS) {
          const k = keyOf({ q: c.q + dq, r: c.r + dr });
          const n = byKey.get(k);
          if (!n || sea.has(k) || !isWater(n.terrainId)) continue;
          sea.add(k);
          wq.push(n);
        }
      }
      expect(sea.size, `${seed}: озёра`).toBe(water.length);
      // Каждая клетка, где можно стоять, достижима от старта. Босс, сундук,
      // дуб и кристалл задания — преграда на время: победил, забрал, срубил.
      const ok = reach(isl, true);
      const open = land.filter(
        (c) => c.decorationId === null || spec.walk.includes(c.decorationId),
      );
      const stuck = open.filter((c) => !ok.has(keyOf(c))).map(keyOf);
      expect(stuck, `${seed}: недоступные клетки`).toEqual([]);
    }
  });

  it("старые острова: артефакт — у второго слизня, пак — у хомяка или его нет", async () => {
    const { stepAvailable, currentStep } = await import("@/lib/raid/island/steps");
    const p = make(11).places;
    const legacy = { ...p, monsters: p.monsters.slice(0, 2), hamster: p.chest } as Record<
      string,
      unknown
    >;
    delete legacy.artifact;
    delete legacy.pack;
    const back = parsePlaces(JSON.parse(JSON.stringify(legacy)));
    expect(back?.artifact).toEqual(p.monsters[1]);
    expect(back?.pack).toEqual(p.chest);
    const noPack = { ...p, pack: null };
    expect(stepAvailable("x_pack", noPack)).toBe(false);
    expect(stepAvailable("pack_got", noPack)).toBe(false);
    expect(stepAvailable("pack_boss", noPack)).toBe(false);
    expect(stepAvailable("x_energy", noPack)).toBe(true);
    // Шаги пака на таком острове пропускаются, проходка не застревает.
    expect(
      currentStep(
        new Set([
          "hello",
          "walk",
          "chest",
          "axe",
          "chop",
          "x_energy",
          "x_warriors",
          "slime",
          "x_satiety",
          "pickaxe",
          "crystal",
          "mine",
          "harvest",
          "shovel",
          "dig",
          "x_castle",
          "chips",
          "hero",
          "x_artifact",
          "art_take",
          "equip",
        ]),
        noPack,
      ),
    ).toBe("hero_chip");
  });
});

describe("туман острова", () => {
  it("цели под туманом: при создании ничего не открывается, «Показать» ведёт к боссам", async () => {
    const { islandSql } = await import("@/server/api/beta-raid/island/island-write");
    const { stepTarget } = await import("@/lib/raid/island/steps");
    const isl = make(11);
    const p = isl.places;
    expect(stepTarget("x_artifact", p)).toEqual(p.artifact);
    expect(stepTarget("pack_boss", p)).toEqual(p.pack);
    // Владелец 16.10: «объекты подсвечены — неприемлемо»; цель — рамкой на клиенте.
    const sql = islandSql({
      mapId: "isle_new",
      name: "Остров",
      account: "acc_1",
      seed: 11,
      island: isl,
      by: "w",
    });
    expect(sql.some((q) => q.includes("beta_raid_fog_seen"))).toBe(false);
  });

  it("шаг «Забери артефакт» — только там, где артефакт есть", async () => {
    const { stepAvailable } = await import("@/lib/raid/island/steps");
    const p = make(11).places;
    expect(stepAvailable("art_take", p)).toBe(true);
    expect(stepAvailable("art_take", { ...p, artifact: null })).toBe(false);
  });
});

describe("награды острова — с этого острова", () => {
  it("забрал/надел/пак считаются с создания острова, а не по старым наградам", async () => {
    const { factsSql } = await import("@/server/api/beta-raid/island/island-facts");
    const sql = factsSql("acc_1", "isle_x", make(11).places);
    const part = (id: string) =>
      sql
        .slice(0, sql.indexOf(`AS ${id}`))
        .split("AS ")
        .at(-1) ?? "";
    for (const id of ["art_take", "equip", "pack_got", "x_pack"]) {
      expect(part(id), id).toContain("SELECT created_at FROM yuplink.raid_island");
    }
    // Победа над стражем пака — отдельный шаг: после неё ведём в «Добычу».
    expect(part("pack_boss")).toContain("beta_raid_object_hp");
  });

  it("после победы над стражем пака — шаг «Забери пак»", async () => {
    const { currentStep, ISLAND_STEP_IDS } = await import("@/lib/raid/island/steps");
    const p = make(11).places;
    const upTo = ISLAND_STEP_IDS.slice(0, ISLAND_STEP_IDS.indexOf("pack_boss") + 1);
    expect(currentStep(new Set(upTo), p)).toBe("pack_got");
  });
});
