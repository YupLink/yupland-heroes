// Проход внутри ячейки: тупиковый карман засаживается, карман с объектом — к
// нему прорубается кратчайший проход сквозь декор; рубится только своя клетка.
import { describe, expect, it } from "vitest";
import { fixMaze, type FixInfo } from "@/lib/raid/worldgen/maze-fix";

/** Ряд клеток r = 0: «.» свободно, «#» декор, «o» свободно с объектом, «a» тропа соседа. */
function row(map: string): { keys: string[]; info: (k: string) => FixInfo } {
  const keys = [...map].map((_, q) => `${q},0`);
  const ch = (k: string) => map[Number(k.split(",")[0])];
  return {
    keys,
    info: (k) => {
      const c = ch(k);
      return {
        land: true,
        passable: c !== "#",
        carvable: c === "#",
        fillable: c === ".",
      };
    },
  };
}

describe("fixMaze", () => {
  it("всё связано — правок нет", () => {
    const { keys, info } = row("a....");
    expect(fixMaze(keys, info)).toEqual({ carve: [], fill: [] });
  });

  it("карман из одной клетки — засадить, а не рубить", () => {
    const { keys, info } = row("a..#.#");
    expect(fixMaze(keys, info)).toEqual({ carve: [], fill: ["4,0"] });
  });

  it("карман с объектом — прорубить кратчайший проход", () => {
    const { keys, info } = row("a.##o");
    expect(fixMaze(keys, info)).toEqual({ carve: ["2,0", "3,0"], fill: [] });
  });

  it("тропу соседа не рубят и не засаживают: она и так свободна", () => {
    const { keys, info } = row("a#a");
    const out = fixMaze(keys, (k) => ({ ...info(k), fillable: false }));
    expect(out.carve).toEqual(["1,0"]);
  });
});
