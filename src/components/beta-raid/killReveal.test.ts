// Заяц под мобом: добили моба — заяц открывается и остаётся живым, в каком
// бы порядке ни пришли ответ удара, своё же событие «defeated» из потока и
// дельта карты. Раньше вторая по счёту отметка «погасить клетку» гасила уже
// открывшегося зайца, и он пропадал до F5 (жалоба игрока).
import { describe, expect, it } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { applyDefeated } from "./applyFled";
import { applyReveal } from "./applyReveal";
import { markCellDefeated, shownRunnerAt } from "./markDefeated";
import { handleDefeated } from "./liveDefeated";
import { applyCellPatches, readCellDetails, type MapLike } from "./patchMapCache";
import { synthMap, type FixtureCell } from "@/test/mapFixture";

const MAP_KEY = ["beta-raid-map"];
const MOB = "boss:mob";
const HARE = "chest:hare";
const M = { q: 0, r: 0 };
const reveal = { cell: "0,0", objectId: HARE };

function client(cells: FixtureCell[] = [{ ...M, objectId: MOB }, { q: 1, r: 0 }]): QueryClient {
  const qc = new QueryClient();
  qc.setQueryData(MAP_KEY, synthMap(cells));
  return qc;
}

const cellOf = (qc: QueryClient) => readCellDetails(qc.getQueryData(MAP_KEY) as MapLike, M.q, M.r);

/** Ответ удара убившему (useBetaEncounter): погасить цель, открыть беглеца. */
const response = (qc: QueryClient, runner = false) => {
  markCellDefeated(qc, M.q, M.r, runner);
  applyReveal(qc, reveal);
};
/** Своё же «defeated» из потока (useRaidLiveStream → handleDefeated). */
const event = (qc: QueryClient) => handleDefeated(qc, { cells: ["0,0"], runner: false, reveal });
/** Дельта «map»: правда клетки из базы (map-change-hooks). */
const delta = (qc: QueryClient) =>
  qc.setQueryData(MAP_KEY, (old: MapLike) =>
    applyCellPatches(old, [{ ...M, objectId: HARE, runner: true, alive: true }]),
  );

const hareAlive = { objectId: HARE, runner: true, defeated: false };

describe("добили моба над зайцем", () => {
  it.each([
    ["поток → дельта → ответ", [event, delta, response]],
    ["ответ → поток → дельта", [response, event, delta]],
    ["ответ → дельта → поток", [response, delta, event]],
    ["поток → ответ → дельта", [event, response, delta]],
    ["дельта → поток → ответ", [delta, event, response]],
  ] as const)("убивший, порядок %s: заяц виден", (_, steps) => {
    const qc = client();
    for (const step of steps) step(qc);
    expect(cellOf(qc)).toMatchObject(hareAlive);
  });

  it.each([
    ["поток → дельта", [event, delta]],
    ["дельта → поток", [delta, event]],
  ] as const)("сосед рядом, порядок %s: заяц виден", (_, steps) => {
    const qc = client();
    for (const step of steps) step(qc);
    expect(cellOf(qc)).toMatchObject(hareAlive);
  });

  it("динамит (гасит объекты клетки) не гасит уже открытого зайца", () => {
    const qc = client();
    event(qc);
    markCellDefeated(qc, M.q, M.r);
    expect(cellOf(qc)).toMatchObject(hareAlive);
  });
});

describe("снятие убитых не сломано", () => {
  it("забрали самого зайца — клетка гаснет и в ответе, и потоком", () => {
    const qc = client([{ ...M, objectId: HARE, runner: true }]);
    markCellDefeated(qc, M.q, M.r, true);
    expect(cellOf(qc).defeated).toBe(true);
    const other = client([{ ...M, objectId: HARE, runner: true }]);
    handleDefeated(other, { cells: ["0,0"], runner: true });
    expect(cellOf(other).defeated).toBe(true);
  });

  it("моб без беглеца под ним гаснет как раньше", () => {
    const qc = client();
    markCellDefeated(qc, M.q, M.r);
    expect(cellOf(qc)).toMatchObject({ objectId: MOB, defeated: true });
    const other = client();
    applyDefeated(other, ["0,0"]);
    expect(cellOf(other)).toMatchObject({ objectId: MOB, defeated: true });
  });

  it("событие без признака слоя гасит объект клетки, а не открытого беглеца", () => {
    const qc = client([{ ...M, objectId: HARE, runner: true }]);
    handleDefeated(qc, { cells: ["0,0"] });
    expect(cellOf(qc)).toMatchObject(hareAlive);
  });
});

describe("shownRunnerAt — по кому идёт удар", () => {
  it("клетка показывает этого беглеца — да; объект клетки или чужой id — нет", () => {
    const qc = client([
      { ...M, objectId: HARE, runner: true },
      { q: 1, r: 0, objectId: MOB },
    ]);
    expect(shownRunnerAt(qc, 0, 0, HARE)).toBe(true);
    expect(shownRunnerAt(qc, 0, 0, MOB)).toBe(false);
    expect(shownRunnerAt(qc, 1, 0, MOB)).toBe(false);
    expect(shownRunnerAt(new QueryClient(), 0, 0, HARE)).toBe(false);
  });
});
