// Слой беглецов на карте игрока: под живым верхним беглец не показан, но его
// шаблон в словаре есть — открывшись, он рисуется и забирается без F5.
import { describe, expect, it } from "vitest";
import { dictObjectIds, overlayRunners } from "./map-runners";
import type { RunnerRow } from "./runners";
import type { RawCell } from "./packCells";

const cell = (q: number, r: number, object_id: string | null): RawCell => ({
  q,
  r,
  terrain_id: "grass",
  road_id: null,
  object_id,
  decoration_id: null,
  building_id: null,
});
const run = (q: number, r: number, objectId: string): RunnerRow => ({
  id: `rn${q}${r}`,
  q,
  r,
  objectId,
  config: null,
});

describe("заяц под мобом", () => {
  const rows = [cell(0, 0, "boss:mob"), cell(1, 0, null)];
  const runners = [run(0, 0, "chest:hare")];
  const known = new Set(["boss:mob", "chest:hare"]);

  it("пока моб жив — показан моб, заяц спрятан", () => {
    const o = overlayRunners({ rows, runners, known, deadCells: new Set(), deadRunners: new Set() });
    expect(o.cells[0].object_id).toBe("boss:mob");
    expect(o.runnerKeys.has("0,0")).toBe(false);
  });

  it("моба добили — показан живой заяц", () => {
    const o = overlayRunners({
      rows,
      runners,
      known,
      deadCells: new Set(["0,0"]),
      deadRunners: new Set(),
    });
    expect(o.cells[0].object_id).toBe("chest:hare");
    expect(o.runnerKeys.has("0,0")).toBe(true);
    expect(o.defeatedKeys.has("0,0")).toBe(false);
  });

  it("словарю нужен и спрятанный заяц, но не под куполом", () => {
    const shown = ["boss:mob"];
    expect(dictObjectIds(shown, runners, new Set())).toEqual(["boss:mob", "chest:hare"]);
    expect(dictObjectIds(shown, runners, new Set(["0,0"]))).toEqual(["boss:mob"]);
    expect(shown).toEqual(["boss:mob"]); // вход не портится
  });
});
