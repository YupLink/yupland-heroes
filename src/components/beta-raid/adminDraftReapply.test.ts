// Черновик режима бога держится на карте, когда снимок кладут вручную
// (дельта «full», сверка раз в минуту): раньше «убрал ратушу — она вернулась»,
// хотя правка лежала в очереди (владелец, 05.10.2026).
import { afterEach, describe, expect, it } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import type { PackedCells } from "./unpackMap";
import { readCellDetails, type MapLike } from "./patchMapCache";
import { commitDraft, watchDraft } from "./adminDraft";
import { readDraft } from "./adminDraftStore";
import { nextDraft } from "./mergeCellPatch";

const MAP = ["beta-raid-map"];

/** Карта 4×4 с ратушей на (2,1) — свежий «снимок сервера» на каждый вызов. */
function serverMap(): MapLike {
  const q: number[] = [];
  const r: number[] = [];
  for (let rr = 0; rr < 4; rr++)
    for (let qq = 0; qq < 4; qq++) {
      q.push(qq);
      r.push(rr);
    }
  const n = q.length;
  const packed = {
    terrainIds: ["grass"],
    roadIds: [],
    objectIds: [],
    decorationIds: [],
    buildingIds: ["town_hall"],
    q,
    r,
    t: new Array(n).fill(0),
    road: new Array(n).fill(-1),
    obj: new Array(n).fill(-1),
    dec: new Array(n).fill(-1),
    bld: new Array(n).fill(-1),
    defeated: [],
    runners: [],
    voidFog: [],
  } as PackedCells;
  packed.bld[1 * 4 + 2] = 0;
  return {
    map: { id: "rmap_t" },
    packed,
    terrains: {},
    roads: {},
    objects: {},
    decorations: {},
    buildings: {},
  } as unknown as MapLike;
}

const hallAt = (qc: QueryClient) => readCellDetails(qc.getQueryData(MAP) as never, 2, 1).buildingId;

let stop: (() => void) | null = null;
afterEach(() => {
  stop?.();
  stop = null;
});

describe("черновик поверх подменённого снимка", () => {
  it("снимок целиком, положенный вручную, не возвращает убранную ратушу", () => {
    const qc = new QueryClient();
    qc.setQueryData(MAP, serverMap());
    stop = watchDraft(
      qc,
      () => undefined,
      () => undefined,
    );

    const step = nextDraft(
      readDraft(),
      { q: 2, r: 1, buildingId: null },
      readCellDetails(qc.getQueryData(MAP) as never, 2, 1),
    );
    commitDraft(qc, step.next, step.reverted);
    expect(hallAt(qc)).toBeNull();

    // Сверка раз в минуту нашла «full» и положила свежий снимок без черновика.
    qc.setQueryData(MAP, serverMap());
    expect(hallAt(qc)).toBeNull();
    expect((qc.getQueryData(MAP) as MapLike & { draftCells?: string[] }).draftCells).toEqual([
      "2,1",
    ]);

    // Очередь выгрузили и опустошили — новый снимок уже не трогаем.
    commitDraft(qc, { queue: {}, base: {} });
    qc.setQueryData(MAP, serverMap());
    expect(hallAt(qc)).toBe("town_hall");
  });
});
