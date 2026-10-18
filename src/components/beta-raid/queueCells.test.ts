// Пачка правок в очередь: одна копия очереди, та же арифметика, что у nextDraft.
import { describe, expect, it } from "vitest";
import type { CellDetails, DraftState } from "./patchMapCache";
import { nextDraft } from "./mergeCellPatch";
import { queueCellsDraft } from "./queueCells";

const cell = (over: Partial<CellDetails> = {}): CellDetails => ({
  terrainId: "grass",
  roadId: null,
  decorationId: null,
  objectId: null,
  buildingId: null,
  tier: 0,
  defeated: false,
  runner: false,
  voidFog: false,
  groupId: null,
  iconScale: null,
  ...over,
});

const empty: DraftState = { queue: {}, base: {} };
const pass = (p: Parameters<typeof queueCellsDraft>[1][number]) => p;

describe("queueCellsDraft", () => {
  it("кладёт пачку и снимает базу с клетки до правки", () => {
    const step = queueCellsDraft(
      empty,
      [
        { q: 0, r: 0, terrainId: "sand", decorationId: "palm" },
        { q: 1, r: 0, terrainId: "water", decorationId: null },
      ],
      () => cell(),
      pass,
    );
    expect(Object.keys(step.next.queue)).toEqual(["0,0", "1,0"]);
    expect(step.next.base["0,0"]?.terrainId).toBe("grass");
    expect(step.reverted).toEqual([]);
  });

  it("правка «как было» вылетает из очереди и попадает в reverted", () => {
    const first = queueCellsDraft(empty, [{ q: 0, r: 0, terrainId: "sand" }], () => cell(), pass);
    // Карта уже перекрашена черновиком — «как было» берётся из базы, не с карты.
    const second = queueCellsDraft(
      first.next,
      [{ q: 0, r: 0, terrainId: "grass" }],
      () => cell({ terrainId: "sand" }),
      pass,
    );
    expect(second.next.queue["0,0"]).toBeUndefined();
    expect(second.next.base["0,0"]).toBeUndefined();
    expect(second.reverted).toEqual(["0,0"]);
  });

  it("гард урезает слои и отбрасывает пустую правку", () => {
    const step = queueCellsDraft(
      empty,
      [
        { q: 0, r: 0, terrainId: "sand", decorationId: "palm" },
        { q: 1, r: 0, decorationId: "palm" },
      ],
      () => cell(),
      (p) => {
        const cut = { ...p, decorationId: undefined };
        return cut.terrainId !== undefined ? cut : null;
      },
    );
    expect(step.next.queue["0,0"]).toEqual({
      q: 0,
      r: 0,
      terrainId: "sand",
      decorationId: undefined,
    });
    expect(step.next.queue["1,0"]).toBeUndefined();
  });

  it("совпадает с nextDraft по клеткам, но исходную очередь не трогает", () => {
    const patches = [
      { q: 0, r: 0, terrainId: "sand" },
      { q: 0, r: 0, decorationId: "palm" },
      { q: 2, r: 2, terrainId: "grass" },
    ];
    let seq: DraftState = empty;
    for (const p of patches) seq = nextDraft(seq, p, cell()).next;
    const batch = queueCellsDraft(empty, patches, () => cell(), pass);
    expect(batch.next).toEqual(seq);
    expect(empty).toEqual({ queue: {}, base: {} });
  });
});
