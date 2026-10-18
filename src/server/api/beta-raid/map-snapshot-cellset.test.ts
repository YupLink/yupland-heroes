// Туман спрашивает только «какие клетки есть на карте» — пересобирать снимок
// на каждую версию (а версия растёт от каждого боя) для этого не нужно.
import { describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({ rev: 1, builds: 0 }));
vi.mock("../../db/mcpClient", () => ({ mcpExec: async () => [{ revision: s.rev }] }));
vi.mock("../../raidLive", () => ({ subscribeRaid: () => () => {} }));
vi.mock("./map-base", () => ({ purgeMapBase: () => {} }));
vi.mock("../../perf/trace", () => ({ traced: (_n: string, fn: () => unknown) => fn() }));
vi.mock("./map-assemble", () => ({
  assembleMap: async () => {
    s.builds++;
    return {
      map: {},
      packed: { q: [0, 1], r: [0, 0] },
      terrains: {},
      objects: {},
      decorations: {},
      roads: {},
      buildings: {},
      buildingTiers: {},
      doors: [],
    };
  },
}));
vi.mock("@/lib/raid/mapCodec", () => ({
  encodeMapBlob: () => new Uint8Array([1, 2, 3]),
  MAP_BLOB_FORMAT: 1,
}));
vi.mock("@/lib/raid/cellOrder", () => ({ cellOrderHash: () => "order" }));

const { getCellSetSnapshot, getMapSnapshot, dropMapSnapshot } = await import("./map-snapshot");
const map = { id: "m1", name: "Карта", size: 128 };

describe("снимок для набора клеток", () => {
  it("версия ушла вперёд — готовый снимок, без пересборки", async () => {
    await getMapSnapshot(map, "player", { wait: true });
    expect(s.builds).toBe(1);
    for (let i = 0; i < 5; i++) {
      s.rev++;
      dropMapSnapshot("m1");
      const snap = await getCellSetSnapshot(map, "player");
      expect(snap.q.length).toBe(2);
    }
    await new Promise((r) => setTimeout(r, 10));
    expect(s.builds).toBe(1);
  });

  it("снимка ещё нет — собираем", async () => {
    const snap = await getCellSetSnapshot({ ...map, id: "m2" }, "player");
    expect(snap.mapId).toBe("m2");
  });
});
