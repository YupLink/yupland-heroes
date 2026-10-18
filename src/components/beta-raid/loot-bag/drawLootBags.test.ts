// Мешочки на канвасе (§8.21): рисуются только во «втором обзоре» — активная
// зона тумана на разведанном (и у админа с открытой картой), на любом зуме —
// вблизи спрайтом, издалека квадратом; мешочек важнее бугорка; число — когда
// их на клетке больше одного. Без свечений: ни shadowBlur, ни filter кадр не
// трогает, и без save/restore.
import { describe, expect, it } from "vitest";
import { drawLootBags } from "./drawLootBags";
import type { DrawScene } from "@/components/beta-raid/betaCanvasScene";
import type { MapStore } from "@/components/beta-raid/mapStore";

type Call = [string, ...unknown[]];

function fakeScene(o: { scale: number; visible: number[]; revealAll?: boolean; unseen?: number[] }) {
  const calls: Call[] = [];
  const g = new Proxy(
    {},
    {
      get:
        (_t, k: string) =>
        (...a: unknown[]) =>
          void calls.push([k, ...a]),
      set: (_t, k: string, val: unknown) => {
        calls.push([`set:${k}`, val]);
        return true;
      },
    },
  ) as unknown as CanvasRenderingContext2D;
  const img = { complete: true, naturalWidth: 112, naturalHeight: 112 };
  const drawn: string[] = [];
  const scene = {
    g,
    scale: o.scale,
    view: { minX: -1e6, maxX: 1e6, minY: -1e6, maxY: 1e6 },
    // «Второй обзор»: активная зона тумана и разведанное.
    fogZones: { active: new Set(o.visible), bright: new Set<number>() },
    seen: { hasIndex: (i: number) => !(o.unseen ?? []).includes(i), has: () => true },
    visible: new Set<number>(),
    revealAll: o.revealAll === true,
    images: new Map([
      ["loot-bag", img],
      ["loot-mound", { ...img, naturalHeight: 56, naturalWidth: 112 }],
    ]),
    bucket: 1,
    sprites: {
      get: (key: string) => ({ img: key, w: 10, h: 10, last: 0 }),
      drawBottom: (_g: unknown, s: { img: string }) => void drawn.push(s.img),
    },
  } as unknown as DrawScene;
  return { scene, calls, drawn };
}

const store = {
  indexOfKey: (key: string) => ({ "1,1": 0, "2,2": 1, "3,3": 2 })[key] ?? -1,
  geom: { x: [10, 20, 30], y: [10, 20, 30] },
} as unknown as MapStore;

describe("drawLootBags", () => {
  it("вблизи — спрайт; мешочек сверху бугорка; вне обзора — не рисуем", () => {
    const { scene, drawn } = fakeScene({ scale: 1, visible: [0, 1] });
    drawLootBags(scene, store, {
      "1,1": { n: 1, buried: false },
      "2,2": { n: 1, buried: true },
      "3,3": { n: 1, buried: false },
    });
    expect(drawn).toEqual(["loot-bag", "loot-mound"]);
  });

  it("несколько на клетке — число; одна — без числа; без save/restore", () => {
    const { scene, calls } = fakeScene({ scale: 1, visible: [0, 1] });
    drawLootBags(scene, store, { "1,1": { n: 3, buried: false }, "2,2": { n: 1, buried: false } });
    expect(calls.filter((c) => c[0] === "fillText").map((c) => c[1])).toEqual(["3"]);
    expect(calls.some((c) => c[0] === "save" || c[0] === "restore")).toBe(false);
  });

  it("в активной зоне, но на неразведанном — не рисуем", () => {
    const { scene, drawn } = fakeScene({ scale: 1, visible: [0, 1], unseen: [1] });
    drawLootBags(scene, store, { "1,1": { n: 1, buried: false }, "2,2": { n: 1, buried: false } });
    expect(drawn).toEqual(["loot-bag"]);
  });

  it("издалека — квадрат цвета мешочка/бугорка, видно на любом зуме", () => {
    const { scene, calls, drawn } = fakeScene({ scale: 0.4, visible: [0, 1] });
    drawLootBags(scene, store, { "1,1": { n: 2, buried: false }, "2,2": { n: 1, buried: true } });
    expect(drawn).toEqual([]);
    expect(calls.filter((c) => c[0] === "fillRect")).toHaveLength(2);
    expect(calls.filter((c) => c[0] === "set:fillStyle").map((c) => c[1])).toEqual([
      "#b27b3c",
      "#7c5232",
    ]);
  });

  it("админ с открытой картой видит и вне обзора; свечений нет", () => {
    const { scene, calls, drawn } = fakeScene({ scale: 1, visible: [], revealAll: true });
    drawLootBags(scene, store, { "3,3": { n: 1, buried: false } });
    expect(drawn).toEqual(["loot-bag"]);
    expect(calls.some((c) => /shadow|filter/i.test(String(c[0])))).toBe(false);
  });

  it("слоя нет — ничего не делаем", () => {
    const { scene, calls } = fakeScene({ scale: 1, visible: [0] });
    drawLootBags(scene, store, undefined);
    expect(calls).toEqual([]);
  });
});
