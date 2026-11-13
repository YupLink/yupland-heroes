// Автораздача: боссы — ни на дорогу, ни на жилу (владелец, 22.10.2026: «мобов
// на жилах и дорогах не спавнить!!»). Сундукам и прочим дорога по-прежнему
// можно. База поддельная: «карта» в массиве, у части клеток дорога/жила;
// условие mob-ground в запросе режет такие клетки.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mobGroundSql, spawnGuardedSql } from "./mob-ground";

type Cell = { q: number; r: number; terrain: string; road?: boolean };

/** Трава: 6 клеток, из них 3 — дорога или жила; горы: 2 клетки, обе на дороге. */
const MAP: Cell[] = [
  ...Array.from({ length: 6 }, (_, i) => ({ q: i, r: 0, terrain: "grass", road: i < 3 })),
  ...Array.from({ length: 2 }, (_, i) => ({ q: i, r: 1, terrain: "mount", road: true })),
];

const db = vi.hoisted(() => ({ calls: [] as string[] }));

/** Худший случай: оба жребия по местности отдают клетки в одном порядке. */
vi.mock("../../db/mcpClient", () => ({
  mcpExec: (sql: string) => {
    db.calls.push(sql);
    const mob = sql.includes("yuplink.raid_map_vein");
    const ok = (c: Cell) => !mob || !c.road;
    if (sql.includes("WITH need(tid, n)")) {
      const out: Array<{ tid: string; q: number; r: number }> = [];
      for (const m of sql.matchAll(/\('([^']*)'::text, (\d+)::int\)/g)) {
        const [, tid, n] = m;
        for (const c of MAP.filter((x) => x.terrain === tid && ok(x)).slice(0, Number(n)))
          out.push({ tid, q: c.q, r: c.r });
      }
      return Promise.resolve(out);
    }
    if (sql.includes("raid_map_cells AS tgt")) return Promise.resolve([]);
    // Шаблоны убегающих существ (meta.flees).
    if (sql.includes("'flees'")) return Promise.resolve([{ id: "chest_hare" }]);
    const limit = Number(/LIMIT (\d+)/.exec(sql)?.[1] ?? 0);
    return Promise.resolve(
      MAP.filter(ok)
        .slice(0, limit)
        .map((c) => ({ q: c.q, r: c.r })),
    );
  },
  mcpSession: () => {
    throw new Error("тесты не открывают сессию к базе");
  },
}));

vi.mock("./map-darai-hold", () => ({
  readDaraiHold: () => Promise.resolve(null),
  settleDaraiHold: () => Promise.resolve(),
}));

const { pickCells } = await import("./scatter-cells");
const { placeObjects } = await import("./scatter-apply");
const { buckets } = await import("./scatter-buckets");

const key = (c: { q: number; r: number }) => `${c.q},${c.r}`;
const onRoad = (c: { q: number; r: number }) =>
  MAP.find((x) => x.q === c.q && x.r === c.r)?.road === true;

beforeEach(() => {
  db.calls = [];
});

describe("автораздача: босс не встаёт на дорогу и жилу", () => {
  it("боссу своей местности — только клетки без дороги и жилы, сундуку — любые", async () => {
    const grants = await pickCells("map-1", [
      { terrainId: "grass", count: 3, mob: true },
      { terrainId: "grass", count: 3 },
    ]);
    expect(grants[0].cells).toHaveLength(3);
    expect(grants[0].cells.some(onRoad)).toBe(false);
    // Сундук берёт оставшиеся — те самые три на дороге.
    expect(grants[1].cells).toHaveLength(3);
    expect(grants[1].cells.every(onRoad)).toBe(true);
    // Одна клетка — одному, хотя оба жребия отдавали клетки в одном порядке.
    const all = [...grants[0].cells, ...grants[1].cells].map(key);
    expect(new Set(all).size).toBe(all.length);
    // Жребий мобов — с условием mob-ground, прочих — без.
    const terrain = db.calls.filter((s) => s.includes("WITH need(tid, n)"));
    expect(terrain).toHaveLength(2);
    expect(terrain[0]).toContain(mobGroundSql("c"));
    expect(terrain[1]).not.toContain("raid_map_vein");
  });

  it("добор с суши для босса — тоже без дорог и жил; не хватило — недостача числом", async () => {
    const [boss] = await pickCells("map-1", [{ terrainId: "mount", count: 5, mob: true }]);
    // Горы целиком на дороге: своё не дали, добор — три клетки травы без дороги.
    expect(boss.cells).toHaveLength(3);
    expect(boss.cells.some(onRoad)).toBe(false);
    expect(boss.short).toBe(2);
    const land = db.calls.find((s) => s.includes("ORDER BY") && !s.includes("WITH need"));
    expect(land).toContain(mobGroundSql("c"));
  });

  it("без боссов раздача как прежде: один запрос, дорога сундуку можно", async () => {
    const [chest] = await pickCells("map-1", [{ terrainId: "mount", count: 2 }]);
    expect(chest.cells).toHaveLength(2);
    expect(chest.cells.every(onRoad)).toBe(true);
    expect(db.calls).toHaveLength(1);
    expect(db.calls[0]).not.toContain("raid_map_vein");
  });

  it("запись решает последней: босс и существо на дорогу и жилу не встают и при перехвате", async () => {
    await placeObjects("map-1", [{ q: 4, r: 0, objectId: "boss:rbt_a", objectConfig: null }]);
    const put = db.calls.find((s) => s.includes("raid_map_cells AS tgt")) ?? "";
    expect(put).toContain(`AND (NOT ${spawnGuardedSql("v.object_id")} OR ${mobGroundSql("c")})`);
    // Существо — по шаблону с meta.flees, как в flee-cells.
    expect(spawnGuardedSql("v.object_id")).toContain("meta->>'flees'");
  });

  it("план раздачи передаёт «моб ли» заявки в подбор клеток", () => {
    const src = readFileSync(join(process.cwd(), "src/server/api/beta-raid/scatter.ts"), "utf8");
    expect(src).toContain("mob: b.mob");
  });
});

describe("заявки раздачи: убегающие существа — тоже мобы", () => {
  const d = (group: "boss" | "chest", objectId: string, terrainId: string | null = "grass") => ({
    group,
    objectId,
    objectConfig: null,
    terrainId,
  });

  it("босс и убегающее существо — мобы, обычный сундук — нет; заявки врозь", async () => {
    const list = await buckets([
      { group: "boss", drafts: [d("boss", "boss:rbt_a")], notes: [] },
      {
        group: "chest",
        drafts: [d("chest", "chest:chest_hare"), d("chest", "chest:chest_plain")],
        notes: [],
      },
    ]);
    const view = list.map((b) => [b.group, b.mob, b.drafts.map((x) => x.objectId).join(",")]);
    expect(view).toEqual([
      ["boss", true, "boss:rbt_a"],
      ["chest", true, "chest:chest_hare"],
      ["chest", false, "chest:chest_plain"],
    ]);
  });

  it("одни боссы — справочник существ не спрашиваем", async () => {
    await buckets([{ group: "boss", drafts: [d("boss", "boss:rbt_a")], notes: [] }]);
    expect(db.calls.some((s) => s.includes("'flees'"))).toBe(false);
  });
});
