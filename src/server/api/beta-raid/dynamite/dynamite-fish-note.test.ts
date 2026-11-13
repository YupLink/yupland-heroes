// Улов динамитом — в журнал и турнир: каждая всплывшая рыба — улов бросившего мешочком на
// своей клетке; башмак и не легшее базой — мимо; ключ — как у мешочка.
import { beforeEach, describe, expect, it, vi } from "vitest";

const notes: unknown[] = [];
vi.mock("@/server/api/beta-raid/fishing/fishing-note", () => ({
  noteCatch: async (o: unknown) => {
    notes.push(o);
  },
}));
const { noteDynamiteCatch } = await import("./dynamite-fish-note");
const { FISH_BOOT_KEY } = await import("@/lib/raid/dynamiteFish");

const item = (k: string, item: string | null, name: string) => ({
  k,
  kind: "custom",
  ref: item,
  item,
  name,
  image: null,
  n: 1,
  h: 24,
  mob: 0,
  mine: 0,
  field: 0,
  loot: 1,
});

beforeEach(() => {
  notes.length = 0;
});

describe("улов динамитом в журнал и турнир", () => {
  it("рыба — улов мешочком на своей клетке; башмак и не легшее — мимо", async () => {
    await noteDynamiteCatch({
      account: "acc_1",
      mapId: "rmap_x",
      op: "dyn:acc_1:op1",
      fishIn: [
        { q: 1, r: 0, nm: "Рыба", items: [item("custom:cst_carp", "cst_carp", "Карп")] },
        { q: 0, r: 1, nm: "Рыба", items: [item(FISH_BOOT_KEY, null, "Башмак")] },
        { q: 2, r: 0, nm: "Рыба", items: [item("custom:cst_pike", "cst_pike", "Щука")] },
      ],
      spawned: [
        { q: 1, r: 0, bag: "lb_a" },
        { q: 0, r: 1, bag: "lb_b" },
      ],
    });
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({
      account: "acc_1",
      mapId: "rmap_x",
      q: 1,
      r: 0,
      key: "dynfish:dyn:acc_1:op1:1:0",
      items: [{ itemId: "cst_carp", name: "Карп", n: 1, dropped: 1 }],
    });
  });
});
