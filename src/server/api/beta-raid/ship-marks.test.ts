// Отметка причала для карты: подбитые (dynamite-08) считаются отдельно и несут срок —
// клиент рисует их своим артом и пишет «исчезнет через…»; сесть в них нельзя.
import { describe, expect, it } from "vitest";
import { shipMarkOf } from "./ship-marks";
import type { ShipBrief, ShipCell } from "./ship-berths";

const cell = (fleet: ShipBrief[], over: Partial<ShipCell> = {}): ShipCell => ({
  q: 2,
  r: 3,
  ships: fleet.length,
  busy: fleet.filter((f) => f.crew).length,
  crew: fleet.map((f) => f.crew).filter((c): c is string => !!c),
  water: true,
  big: fleet.some((f) => f.kind === "big"),
  fleet,
  ...over,
});

describe("shipMarkOf", () => {
  it("обломок: разбит и подбит, свободных нет, срок — по штампу", () => {
    const m = shipMarkOf(cell([{ kind: "big", hp: 0, crew: null, blastedAt: 1000 }]), "acc", null);
    expect(m).toMatchObject({ total: 1, free: 0, busy: 0, broken: 1, blasted: 1, blastedAt: 1000 });
  });

  it("срок клетки — по последнему взрыву; целые и разбитые без штампа — не подбитые", () => {
    const m = shipMarkOf(
      cell([
        { kind: "small", hp: 0, crew: null, blastedAt: 1000 },
        { kind: "small", hp: 0, crew: null, blastedAt: 5000 },
        { kind: "small", hp: 0, crew: null },
        { kind: "small", hp: 400, crew: null, blastedAt: null },
      ]),
      "acc",
      null,
    );
    expect(m).toMatchObject({ blasted: 2, blastedAt: 5000, broken: 3, free: 1 });
  });

  it("без подбитых — ноль и null, остальное как было", () => {
    const m = shipMarkOf(cell([{ kind: "small", hp: 700, crew: "acc" }]), "acc", {
      id: "s1",
      q: 2,
      r: 3,
      kind: "small",
    });
    expect(m).toMatchObject({ blasted: 0, blastedAt: null, mine: true, busy: 1, hp: 700 });
  });

  it("подбитый со случайным запасом хода свободным не считается", () => {
    const m = shipMarkOf(cell([{ kind: "small", hp: 50, crew: null, blastedAt: 1 }]), "acc", null);
    expect(m.free).toBe(0);
    expect(m.freeBig).toBe(false);
  });
});
