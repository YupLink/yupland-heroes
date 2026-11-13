// Досылка поставленных шахт: неразосланный ключ — дельта клетки ещё раз и
// отметка; шахты на клетке уже нет — только отметка; запись не прошла — ключ
// ждёт следующего прохода. Чужой вид — отметка, чтобы не держал очередь.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PlaceOpRow } from "./mine-place-op-sql";

const s = vi.hoisted(() => ({
  sql: [] as string[],
  unsent: [] as PlaceOpRow[],
  failMaps: [] as string[],
  /** Шаблоны, которых нет в словаре (досылка их не отметит). */
  noDict: [] as string[],
  recorded: [] as Array<{ mapId: string; patches: unknown[]; assets?: unknown }>,
  published: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/server/db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    s.sql.push(sql);
    if (/WHERE o\.sent_at IS NULL/.test(sql)) return s.unsent;
    const tpl = /FROM yuplink\.mystic_item_template\s+WHERE id = '([^']+)'/.exec(sql)?.[1];
    if (tpl) return s.noDict.includes(tpl) ? [] : [{ id: tpl, name: "Шахта", meta: {} }];
    return [];
  },
}));
vi.mock("@/server/raidLive", () => ({
  publishRaid: (e: Record<string, unknown>) => s.published.push(e),
}));
vi.mock("@/server/api/beta-raid/voidCells", () => ({
  withoutVoid: async (_m: string, cells: string[]) => cells,
}));
vi.mock("@/server/api/beta-raid/map-journal", () => ({
  recordMapChange: async (
    mapId: string,
    change: { patches: unknown[] },
    assetsFor?: () => Promise<unknown>,
  ) => {
    if (s.failMaps.includes(mapId)) throw new Error("revision locked");
    s.recorded.push({ mapId, patches: change.patches, assets: await assetsFor?.() });
    return 1;
  },
}));

const { resendPlacedMines } = await import("./mine-place-resend");
const { placedOpOf } = await import("./mine-place-announce");

const WOOD = "building_yYIdx793rM";
const STONE = "building_IbP4EseH2O";
const opRow = (over: Partial<PlaceOpRow>): PlaceOpRow => ({
  op: "mplace:a:1",
  map_id: "m1",
  q: 3,
  r: -1,
  kind: "wood",
  sent: false,
  building_id: WOOD,
  ...over,
});
const marked = () =>
  s.sql
    .filter((x) => x.includes("SET sent_at = now()"))
    .map((x) => /WHERE op = '([^']+)'/.exec(x)?.[1]);

beforeEach(() => {
  s.sql.length = 0;
  s.recorded.length = 0;
  s.published.length = 0;
  s.failMaps = [];
  s.noDict = [];
  s.unsent = [];
});

describe("строка ключа", () => {
  it("шахта на месте — here; другой постройки или пусто — нет; чужой вид — null", () => {
    expect(placedOpOf(opRow({ q: "3", r: "-1" }))).toEqual({
      op: "mplace:a:1",
      mapId: "m1",
      q: 3,
      r: -1,
      kind: "wood",
      here: true,
      sent: false,
    });
    expect(placedOpOf(opRow({ kind: "stone", building_id: STONE }))?.here).toBe(true);
    expect(placedOpOf(opRow({ building_id: STONE }))?.here).toBe(false);
    expect(placedOpOf(opRow({ building_id: null, sent: true }))).toMatchObject({
      here: false,
      sent: true,
    });
    // Золотая и алмазная (на жилу, 21.10) — свои шаблоны.
    expect(placedOpOf(opRow({ kind: "gold", building_id: "building_UbJz0SbcXB" }))?.here).toBe(
      true,
    );
    expect(placedOpOf(opRow({ kind: "diamonds", building_id: "building_JTzVEXzUQH" }))?.here).toBe(
      true,
    );
    expect(placedOpOf(opRow({ kind: "darai" }))).toBeNull();
    expect(placedOpOf(null)).toBeNull();
  });
});

describe("проход досылки", () => {
  it("дошлёт стоящие, отметит снятые, не отметит упавшие", async () => {
    s.unsent = [
      opRow({ op: "mplace:a:1" }),
      opRow({ op: "mplace:a:2", map_id: "m2", kind: "stone", building_id: STONE, q: 0, r: 0 }),
      opRow({ op: "mplace:a:3", building_id: null }),
      opRow({ op: "mplace:a:4", map_id: "bad" }),
      opRow({ op: "mplace:a:5", kind: "darai" }),
    ];
    s.failMaps = ["bad"];
    await expect(resendPlacedMines()).resolves.toBe(3);
    expect(s.recorded).toEqual([
      {
        mapId: "m1",
        patches: [
          {
            q: 3,
            r: -1,
            buildingId: WOOD,
            buildingSkinId: null,
            buildingConfig: { effect: "mine" },
          },
        ],
        assets: { buildings: { [WOOD]: { id: WOOD, name: "Шахта", tiers: [], effect: "mine" } } },
      },
      {
        mapId: "m2",
        patches: [
          {
            q: 0,
            r: 0,
            buildingId: STONE,
            buildingSkinId: null,
            buildingConfig: { effect: "mine" },
          },
        ],
        assets: {
          buildings: { [STONE]: { id: STONE, name: "Шахта", tiers: [], effect: "mine" } },
        },
      },
    ]);
    expect(marked()).toEqual(["mplace:a:1", "mplace:a:2", "mplace:a:3", "mplace:a:5"]);
    // 'built' с хозяином — всем, где шахта стоит (и у упавшей записи — окна и флажки).
    expect(s.published.map((e) => [e.mapId, e.owner, e.cells])).toEqual([
      ["m1", true, ["3,-1"]],
      ["m2", true, ["0,0"]],
      ["bad", true, ["3,-1"]],
    ]);
  });

  it("словаря шаблона нет — дельты нет, ключ ждёт следующего прохода", async () => {
    s.unsent = [opRow({ op: "mplace:a:1" }), opRow({ op: "mplace:a:2", map_id: "m2" })];
    s.noDict = [WOOD];
    await expect(resendPlacedMines()).resolves.toBe(0);
    expect(s.recorded).toHaveLength(0);
    expect(marked()).toEqual([]);
  });

  it("неразосланных нет — тишина", async () => {
    await expect(resendPlacedMines()).resolves.toBe(0);
    expect(s.recorded).toHaveLength(0);
    expect(s.published).toHaveLength(0);
  });
});
