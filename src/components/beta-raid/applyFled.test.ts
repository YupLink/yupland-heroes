// Побег на карте клиента: с правдой клеток порядок переездов ничего не решает,
// одноимённый верхний не стирается; без правды — два прохода.
import { describe, expect, it } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { applyFled, type FleeMove } from "./applyFled";
import { readCellDetails, type MapLike } from "./patchMapCache";
import { synthMap, type FixtureCell } from "@/test/mapFixture";
import type { CellPatch } from "@/lib/raid/mapDelta";

const MAP_KEY = ["beta-raid-map"];

function client(cells: FixtureCell[]): QueryClient {
  const qc = new QueryClient();
  qc.setQueryData(MAP_KEY, synthMap(cells));
  return qc;
}

const cellOf = (qc: QueryClient, q: number, r: number) =>
  readCellDetails(qc.getQueryData(MAP_KEY) as MapLike, q, r);

/** Цепочка одного шага: A c X уходит на Y ПОД живого B, B с Y уходит на Z. */
const X = { q: 0, r: 0 };
const Y = { q: 1, r: 0 };
const Z = { q: 2, r: 0 };
const truthAfterChain: CellPatch[] = [
  { ...X, objectId: null, runner: false, alive: true },
  { ...Y, objectId: "mush", runner: true, alive: true },
  { ...Z, objectId: "frog", runner: true, alive: true },
];
const chain = (): FleeMove[] => [
  {
    from: "0,0",
    to: "1,0",
    objectId: "mush",
    layer: 0,
    patches: truthAfterChain.filter((p) => p.q <= 1),
  },
  {
    from: "1,0",
    to: "2,0",
    objectId: "frog",
    layer: 0,
    patches: truthAfterChain.filter((p) => p.q >= 1),
  },
];
const chainCells: FixtureCell[] = [
  { ...X, objectId: "mush" },
  { ...Y, objectId: "frog" },
  { ...Z },
];

describe("applyFled с правдой клеток", () => {
  it.each([
    ["[A, B]", (m: FleeMove[]) => m],
    ["[B, A]", (m: FleeMove[]) => [...m].reverse()],
  ])("цепочка A→Y под B, B→Z в порядке %s: A виден на Y беглецом", (_, order) => {
    const qc = client(chainCells);
    const fresh = applyFled(qc, order(chain()));
    expect(fresh).toHaveLength(2);
    expect(cellOf(qc, 0, 0).objectId).toBeNull();
    expect(cellOf(qc, 1, 0)).toMatchObject({ objectId: "mush", runner: true });
    expect(cellOf(qc, 2, 0)).toMatchObject({ objectId: "frog", runner: true });
  });

  it("уход из-под одноимённого верхнего не стирает верхний", () => {
    // На (0,0) живой верхний «mush», под ним беглец «mush» — уходит на (1,0).
    const qc = client([{ ...X, objectId: "mush" }, { ...Y }]);
    applyFled(qc, [
      {
        from: "0,0",
        to: "1,0",
        objectId: "mush",
        layer: 1,
        patches: [
          { ...X, objectId: "mush", runner: false, alive: true },
          { ...Y, objectId: "mush", runner: true, alive: true },
        ],
      },
    ]);
    expect(cellOf(qc, 0, 0)).toMatchObject({ objectId: "mush", runner: false });
    expect(cellOf(qc, 1, 0)).toMatchObject({ objectId: "mush", runner: true });
  });

  it("та же правда второй раз (свой шаг, потом поток) — уже применено, пусто", () => {
    const qc = client(chainCells);
    expect(applyFled(qc, chain())).toHaveLength(2);
    expect(applyFled(qc, chain())).toHaveLength(0);
  });

  it("спрятался под живой объект — карта не меняется, показывать нечего", () => {
    const qc = client([
      { ...X, objectId: "mush" },
      { ...Y, objectId: "chest" },
    ]);
    const fresh = applyFled(qc, [
      {
        from: "0,0",
        to: "1,0",
        objectId: "mush",
        layer: 0,
        patches: [
          { ...X, objectId: null, runner: false, alive: true },
          { ...Y, objectId: "chest", runner: false, alive: true },
        ],
      },
    ]);
    // Уход с (0,0) виден — переезд свежий; на (1,0) по-прежнему сундук.
    expect(fresh).toHaveLength(1);
    expect(cellOf(qc, 0, 0).objectId).toBeNull();
    expect(cellOf(qc, 1, 0)).toMatchObject({ objectId: "chest", runner: false });
  });
});

describe("applyFled без правды (запасной путь)", () => {
  const bare = (m: FleeMove): FleeMove => ({ ...m, patches: undefined });

  it.each([
    ["[A, B]", (m: FleeMove[]) => m],
    ["[B, A]", (m: FleeMove[]) => [...m].reverse()],
  ])("цепочка в порядке %s: два прохода не оставляют Y пустой", (_, order) => {
    const qc = client(chainCells);
    applyFled(qc, order(chain().map(bare)));
    expect(cellOf(qc, 0, 0).objectId).toBeNull();
    expect(cellOf(qc, 1, 0)).toMatchObject({ objectId: "mush", runner: true });
    expect(cellOf(qc, 2, 0)).toMatchObject({ objectId: "frog", runner: true });
  });

  it("беглец из слоя (layer 1) не стирает одноимённый верхний", () => {
    const qc = client([{ ...X, objectId: "mush" }, { ...Y }]);
    applyFled(qc, [{ from: "0,0", to: "1,0", objectId: "mush", layer: 1 }]);
    expect(cellOf(qc, 0, 0)).toMatchObject({ objectId: "mush", runner: false });
    expect(cellOf(qc, 1, 0)).toMatchObject({ objectId: "mush", runner: true });
  });

  it("не появляется под живым объектом, появляется над поверженным", () => {
    const qc = client([
      { ...X, objectId: "mush" },
      { ...Y, objectId: "chest" },
      { ...Z, objectId: "boss", defeated: true },
    ]);
    applyFled(qc, [{ from: "0,0", to: "1,0", objectId: "mush", layer: 0 }]);
    expect(cellOf(qc, 1, 0)).toMatchObject({ objectId: "chest", runner: false });
    applyFled(qc, [{ from: "1,0", to: "2,0", objectId: "chest", layer: 0 }]);
    expect(cellOf(qc, 2, 0)).toMatchObject({ objectId: "chest", runner: true, defeated: false });
  });
});
