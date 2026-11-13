// «Срубить» из окна издалека (13.11.2026): хватает энергии на дорогу и рубку —
// сразу в путь (approachCell с go), по приходу — рубка; не хватает — плашка.
import { describe, expect, it, vi } from "vitest";
import { canWalkAndAct, walkToDecor, type ApproachCell } from "./decorWalk";
import type { DoorTollMap } from "./pathTolls";

const path = (costs: number[]) => costs.map((cost, i) => ({ q: i + 1, r: 0, cost }));

describe("canWalkAndAct", () => {
  it("хватает на дорогу и дело — да; ровно впритык (с хвостом дроби) — тоже да", () => {
    expect(canWalkAndAct(path([1, 0.5]), 3, 1.5)).toBe(true);
    expect(canWalkAndAct(path(Array(9).fill(0.92)), 9.28, 1)).toBe(true);
  });

  it("на дорогу хватает, на рубку в конце — нет: нет (тогда плашка)", () => {
    expect(canWalkAndAct(path([1, 0.5]), 2, 1)).toBe(false);
  });

  it("энергия двери на пути входит в дорогу", () => {
    const tolls = {
      "1,0": { prices: [{ resource: "energy", amount: 2 }] },
    } as unknown as DoorTollMap;
    expect(canWalkAndAct(path([1]), 3, 0.5, tolls)).toBe(false);
    expect(canWalkAndAct(path([1]), 3.5, 0.5, tolls)).toBe(true);
  });

  it("пути нет или он пустой — нет", () => {
    expect(canWalkAndAct(null, 100, 0)).toBe(false);
    expect(canWalkAndAct([], 100, 0)).toBe(false);
  });
});

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("walkToDecor", () => {
  const setup = (result: Promise<boolean> | undefined, go: boolean) => {
    const approachCell = vi.fn<ApproachCell>(() => result);
    const arrive = vi.fn();
    const failed = vi.fn();
    walkToDecor({ approachCell, go, arrive, failed }, 4, 2, 3);
    return { approachCell, arrive, failed };
  };

  it("go: зовёт approachCell с делом «decor» и go, дошли — arrive(q, r)", async () => {
    const s = setup(Promise.resolve(true), true);
    expect(s.approachCell).toHaveBeenCalledWith(
      4,
      2,
      { kind: "decor", q: 4, r: 2, extraCost: 3 },
      undefined,
      undefined,
      true,
    );
    await flush();
    expect(s.arrive).toHaveBeenCalledWith(4, 2);
    expect(s.failed).not.toHaveBeenCalled();
  });

  it("go, но путь оборвался — failed, без рубки", async () => {
    const s = setup(Promise.resolve(false), true);
    await flush();
    expect(s.arrive).not.toHaveBeenCalled();
    expect(s.failed).toHaveBeenCalledTimes(1);
  });

  it("без go — только плашка маршрута (как раньше), ни рубки, ни failed", async () => {
    const s = setup(undefined, false);
    expect(s.approachCell.mock.calls[0]?.[5]).toBe(false);
    await flush();
    expect(s.arrive).not.toHaveBeenCalled();
    expect(s.failed).not.toHaveBeenCalled();
  });

  it("go, но approachCell показал плашку (дверь на пути) — ждём её кнопку", async () => {
    const s = setup(undefined, true);
    await flush();
    expect(s.arrive).not.toHaveBeenCalled();
    expect(s.failed).not.toHaveBeenCalled();
  });
});
