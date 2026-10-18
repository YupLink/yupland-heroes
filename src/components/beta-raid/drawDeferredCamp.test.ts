// Игроки на клетке блока-постройки (ратуша Юпленда из двух клеток, 10.10):
// счётчик без лагеря — иначе лагерь задней клетки ложился на крышу.
import { beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({ camps: 0, counts: 0 }));
vi.mock("./drawPlayers", () => ({
  drawPlayerCamp: () => void s.camps++,
  drawPlayerCount: () => void s.counts++,
}));
vi.mock("./drawObject", () => ({ drawObject: () => {}, drawRunnerArrow: () => {} }));
vi.mock("./drawBuilding", () => ({ drawBuilding: () => 0 }));
vi.mock("./drawDecoration", () => ({ drawDecoration: () => {} }));
vi.mock("./chest/drawMagicChest", () => ({ drawMagicChest: () => 0 }));
vi.mock("./mapIndex", () => ({
  SceneCell: class {
    i = 0;
    q = 0;
    r = 0;
    x = 0;
    y = 0;
    cell = { i: 0, buildingId: undefined, objectId: undefined };
    get key() {
      return `${this.q},${this.r}`;
    }
  },
}));

const { drawDeferred } = await import("./drawMergedBlocks");

const store = { packed: { q: [34], r: [62] }, geom: { x: [0], y: [0] } } as never;
const scene = { heroCell: null, magicChests: {} } as never;
const list = [{ i: 0, crowd: 1, inDarkFog: false }];

describe("лагерь на клетке блока", () => {
  beforeEach(() => {
    s.camps = 0;
    s.counts = 0;
  });

  it("блок-постройка: только счётчик, без лагеря", () => {
    drawDeferred(scene, store, list, false, true);
    expect(s.camps).toBe(0);
    expect(s.counts).toBe(1);
  });

  it("блок-декор: лагерь как раньше", () => {
    drawDeferred(scene, store, list, false, false);
    expect(s.camps).toBe(1);
  });
});
