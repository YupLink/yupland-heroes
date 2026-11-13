// Появление грибов на жилах — рассылка (владелец, 22.10.2026): бросок часа
// делает база (raid_mushroom_spawn_hour, ключ часа), сервер шлёт новые грибы
// одной дельтой на карту за час — со словарём шаблона и обликов, без F5.
// Час уже брошен (NULL) или ничего не выпало — рассылки нет.
import { beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({
  sql: [] as string[],
  res: null as unknown,
  recorded: [] as Array<{ mapId: string; change: Record<string, unknown>; assets: unknown }>,
  assetCalls: [] as Array<[string, string | null]>,
}));

vi.mock("@/server/db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    s.sql.push(sql);
    return [{ res: s.res }];
  },
}));
vi.mock("@/server/api/beta-raid/dmine/dmine-announce", () => ({
  dmineAssets: async (buildingId: string, skinId: string | null) => {
    s.assetCalls.push([buildingId, skinId]);
    return { buildings: { [`skin:${skinId}`]: { id: `skin:${skinId}` } } };
  },
}));
vi.mock("@/server/api/beta-raid/map-journal", () => ({
  recordMapChange: async (
    mapId: string,
    change: Record<string, unknown>,
    assetsFor?: () => Promise<unknown>,
  ) => {
    s.recorded.push({ mapId, change, assets: await assetsFor?.() });
    return 1;
  },
}));

const { spawnMushrooms, spawnPatches, spawnResOf, spawnHourSql } = await import("./dmine-spawn");

const res = {
  hour: "2026-10-22T15:00:00+00:00",
  spawned: 3,
  building: "building_3arAnV9ajZ",
  cells: [
    { map: "rmap_1", q: 1, r: 2, kind: "gold", skin: "bskin_dm_gold" },
    { map: "rmap_1", q: 5, r: -1, kind: "darai", skin: "bskin_dm_mushroom" },
    { map: "rmap_2", q: 0, r: 0, kind: "diamonds", skin: "bskin_dm_diamonds" },
  ],
};

beforeEach(() => {
  s.sql.length = 0;
  s.res = null;
  s.recorded.length = 0;
  s.assetCalls.length = 0;
});

describe("появление грибов — рассылка", () => {
  it("бросок — одна функция базы с ключом вызова (повтор моста — тот же текст)", async () => {
    expect(spawnHourSql("spawn:o'1")).toBe(
      "SELECT yuplink.raid_mushroom_spawn_hour('spawn:o''1') AS res",
    );
    await spawnMushrooms();
    await spawnMushrooms();
    const ops = s.sql.map((x) => /spawn_hour\('(spawn:[^']+)'\)/.exec(x)?.[1]);
    expect(ops[0]).toBeTruthy();
    // Каждый обход — свой ключ: чужой процесс и следующий обход часа получат NULL.
    expect(ops[0]).not.toBe(ops[1]);
  });

  it("одна дельта на карту за час: клетки с шаблоном и обликом вида, словарь обликов", async () => {
    s.res = res;
    await expect(spawnMushrooms()).resolves.toBe(3);
    expect(s.recorded.map((x) => x.mapId)).toEqual(["rmap_1", "rmap_2"]);
    expect(s.recorded[0].change).toEqual({
      patches: [
        {
          q: 1,
          r: 2,
          buildingId: "building_3arAnV9ajZ",
          buildingSkinId: "bskin_dm_gold",
          buildingConfig: { effect: "mine" },
        },
        {
          q: 5,
          r: -1,
          buildingId: "building_3arAnV9ajZ",
          buildingSkinId: "bskin_dm_mushroom",
          buildingConfig: { effect: "mine" },
        },
      ],
    });
    expect(s.recorded[0].assets).toEqual({
      buildings: {
        "skin:bskin_dm_gold": { id: "skin:bskin_dm_gold" },
        "skin:bskin_dm_mushroom": { id: "skin:bskin_dm_mushroom" },
      },
    });
  });

  it("час уже брошен (NULL) или ничего не выпало — без рассылки", async () => {
    s.res = null;
    await expect(spawnMushrooms()).resolves.toBe(0);
    s.res = { ...res, spawned: 0, cells: [] };
    await expect(spawnMushrooms()).resolves.toBe(0);
    expect(s.recorded).toHaveLength(0);
  });

  it("ответ строкой разбирается; клетки — по картам", () => {
    const parsed = spawnResOf([{ res: JSON.stringify(res) }])!;
    expect(parsed.spawned).toBe(3);
    expect([...spawnPatches(parsed).keys()]).toEqual(["rmap_1", "rmap_2"]);
    expect(spawnResOf([{ res: "{oops" }])).toBeNull();
  });
});
