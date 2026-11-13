// Остров новичка: случайные слабые боссы с обязательными призами и суша, по
// которой дойти до любого места (владелец, 14.10.2026).
import { describe, expect, it } from "vitest";
import { DIRS, keyOf } from "@/lib/raid/zonegen/town/hex";
import { axialToOffset } from "@/lib/hex-renderer";
import { ISLAND_SIZE } from "@/lib/raid/island/shape";
import { BOSS_COUNT } from "@/lib/raid/island/catalog";
import { parsePlaces } from "@/lib/raid/island/steps";
import { isMineCell } from "@/lib/raid/island/carve";
import type { Cell } from "@/lib/raid/worldgen/geo";
import { MANY, isWater, make, reach, spec } from "@/lib/raid/island/island.fixture";

describe("боссы и призы", () => {
  type Reward = { items: unknown[]; packs: unknown[] };

  // Много островов подряд: при общем прогоне (все тесты разом) дольше 5 с.
  const SLOW = { timeout: 60_000 };

  it("боссов 50, все слабые, первый — слизень; призов на клетках нет", SLOW, () => {
    for (const seed of MANY.slice(0, 8)) {
      const isl = make(seed);
      const at = new Map(isl.cells.map((c) => [keyOf(c), c]));
      const { monsters, artifact, pack } = isl.places;
      expect(monsters.length).toBe(BOSS_COUNT.min);
      expect(new Set(monsters.map(keyOf)).size).toBe(monsters.length);
      expect(artifact).toBeNull();
      expect(pack).toBeNull();
      const cfg = (c: Cell) =>
        (at.get(keyOf(c))?.objectConfig as { rewardConfig: Reward }).rewardConfig;
      for (const m of monsters) {
        expect(cfg(m).items).toEqual([]);
        expect(cfg(m).packs).toEqual([]);
      }
    }
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
      // Шахта — стена навсегда (§8.59): на ней не стоят, путь её обходит.
      const ok = reach(isl, true);
      const open = land.filter(
        (c) => !isMineCell(c) && (c.decorationId === null || spec.walk.includes(c.decorationId)),
      );
      const stuck = open.filter((c) => !ok.has(keyOf(c))).map(keyOf);
      expect(stuck, `${seed}: недоступные клетки`).toEqual([]);
    }
  });

  it("старые острова: артефакт — у второго слизня, пак — у хомяка; null — призов нет", async () => {
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
    // Сохранённый null — «призов нет» (с 20.10), а не «второй слизень».
    const none = parsePlaces(JSON.parse(JSON.stringify(p)));
    expect(none?.artifact).toBeNull();
    expect(none?.pack).toBeNull();
    // Паки из первого сундука — у всех; «найди пак» — только с призом на боссе.
    expect(stepAvailable("pack_got", p)).toBe(true);
    expect(stepAvailable("x_pack", p)).toBe(true);
    expect(stepAvailable("pack_boss", p)).toBe(false);
    expect(stepAvailable("x_artifact", p)).toBe(false);
    // Проходка не застревает на шагах без приза.
    expect(
      currentStep(
        new Set([
          "hello",
          "hero_pick",
          "walk",
          "chest",
          "pack_got",
          "x_pack",
          "axe",
          "chop",
          "x_energy",
          "x_warriors",
          "slime",
          "slime_loot",
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
        ]),
        p,
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
    const old = { ...p, artifact: p.monsters[1], pack: p.monsters[2] };
    expect(stepTarget("x_artifact", old)).toEqual(old.artifact);
    expect(stepTarget("pack_boss", old)).toEqual(old.pack);
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
    expect(stepAvailable("art_take", { ...p, artifact: p.monsters[1] })).toBe(true);
    expect(stepAvailable("art_take", p)).toBe(false);
  });
});

describe("награды острова — с этого острова", () => {
  it("забрал/надел/пак считаются с создания острова, а не по старым наградам", async () => {
    const { factsSql } = await import("@/server/api/beta-raid/island/island-facts");
    const p = make(11).places;
    const sql = factsSql("acc_1", "isle_x", { ...p, pack: p.monsters[2] });
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

  it("подарок уже получал (паков в сундуке нет) — после сундука сразу топор", async () => {
    const { currentStep } = await import("@/lib/raid/island/steps");
    const { generateIsland } = await import("@/lib/raid/island/generate");
    const { TEST_CATALOG } = await import("@/test/worldSpec");
    const p = generateIsland(spec, TEST_CATALOG, 11, { gift: false }).places;
    expect(p.gift).toBe(false);
    expect(currentStep(new Set(["hello", "hero_pick", "walk", "chest"]), p)).toBe("axe");
    // Старый остров с паком у босса: «забери пак» — после победы над ним.
    const old = { ...p, pack: p.monsters[2] };
    expect(currentStep(new Set(["hello", "hero_pick", "walk", "chest"]), old)).toBe("axe");
    expect(currentStep(new Set(["hello", "hero_pick", "walk", "chest", "pack_boss"]), old)).toBe(
      "pack_got",
    );
    // Из базы: ключа gift нет — остров старше 20.10.
    const raw = JSON.parse(JSON.stringify(p)) as Record<string, unknown>;
    delete raw.gift;
    expect(parsePlaces(raw)?.gift).toBe(false);
  });

  it("после первого сундука — «Забери добычу» и «Открой паки», потом топор и бои", async () => {
    const { currentStep, ISLAND_STEP_IDS } = await import("@/lib/raid/island/steps");
    const p = make(11).places;
    expect(currentStep(new Set(["hello", "hero_pick", "walk", "chest"]), p)).toBe("pack_got");
    expect(currentStep(new Set(["hello", "hero_pick", "walk", "chest", "pack_got"]), p)).toBe(
      "x_pack",
    );
    expect(ISLAND_STEP_IDS.indexOf("x_pack")).toBeLessThan(ISLAND_STEP_IDS.indexOf("slime"));
  });
});
