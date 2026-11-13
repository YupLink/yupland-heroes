// Пауза основной карты под окном «Карта»: счётчик, повторное «отпустить»
// безвредно; куски статики при паузе отдают память графики сразу.
import { beforeAll, describe, expect, it } from "vitest";
import { holdMapFrames, mapFramesHeld, subscribeMapHold } from "./mapFrameHold";
import { ChunkLayer } from "./chunkLayer";
import { MapStore } from "./mapStore";
import { buildMapIndex } from "./mapIndex";
import { FogMask, fogView } from "./fogMask";
import { gridOrigin } from "./hexGeometry";
import { HexTileCache } from "./hexTileCache";
import { RoadRibbonCache } from "./roadRibbonCache";
import type { PackedCells } from "./unpackMap";
import { installCanvasFakes } from "@/test/canvasFakes";

describe("holdMapFrames", () => {
  it("holds while any window is open; double release is harmless", () => {
    const events: boolean[] = [];
    const off = subscribeMapHold((held) => events.push(held));
    const a = holdMapFrames();
    const b = holdMapFrames();
    expect(mapFramesHeld()).toBe(true);
    a();
    a();
    expect(mapFramesHeld()).toBe(true);
    b();
    expect(mapFramesHeld()).toBe(false);
    expect(events).toEqual([true, false]);
    off();
    holdMapFrames()();
    expect(events).toEqual([true, false]);
  });
});

describe("ChunkLayer.clear", () => {
  beforeAll(installCanvasFakes);
  it("frees baked canvases at once instead of waiting for garbage collection", () => {
    const size = 8;
    const q: number[] = [];
    const r: number[] = [];
    for (let rr = 0; rr < size; rr++)
      for (let qq = 0; qq < size; qq++) {
        q.push(qq);
        r.push(rr);
      }
    const n = q.length;
    const packed: PackedCells = {
      terrainIds: ["grass"],
      roadIds: [],
      objectIds: [],
      decorationIds: [],
      buildingIds: [],
      q,
      r,
      t: new Array<number>(n).fill(0),
      road: new Array<number>(n).fill(-1),
      obj: new Array<number>(n).fill(-1),
      dec: new Array<number>(n).fill(-1),
      bld: new Array<number>(n).fill(-1),
      defeated: [],
      runners: [],
      voidFog: [],
    };
    const { centerQ, c0q } = gridOrigin(size);
    const store = new MapStore(packed, centerQ, c0q, false);
    const layer = new ChunkLayer();
    const baked = layer.bake(0, 0, 1, {
      index: buildMapIndex(store),
      tiles: new HexTileCache(),
      ribbons: new RoadRibbonCache(),
      images: new Map(),
      seen: fogView(new FogMask(store)),
      revealAll: true,
    });
    expect(baked?.cv.width).toBeGreaterThan(0);
    layer.clear();
    expect(baked?.cv.width).toBe(0);
    expect(layer.stats()).toEqual({ chunks: 0, mb: 0 });
  });
});
