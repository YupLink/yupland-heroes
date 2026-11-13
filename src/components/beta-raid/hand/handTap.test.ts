// Тап с вещью в руке (handTapPlan): ход героя рука не отнимает; пустота и то, что
// взорвётся, — её; двойной тап делает сразу; «тап = разместить» — только пустота.
import { describe, expect, it } from "vitest";
import { handTapPlan, handTakes } from "./handTap";
import type { HandCell } from "./handStore";

const land = { kind: "land" as const };
const dyn = { kind: "dynamite" as const };
const at = (o: Partial<HandCell> = {}): HandCell => ({
  q: 1,
  r: 0,
  dq: 1,
  dr: 0,
  ok: true,
  reason: null,
  cost: 0,
  hit: null,
  ...o,
});
const tap = { double: false, quick: false };

describe("тап с вещью в руке", () => {
  it("нет руки, клетка дальше круга, нельзя или своя — обычный тап", () => {
    expect(handTapPlan(null, at(), tap).do).toBe("pass");
    expect(handTapPlan(land, null, tap).do).toBe("pass");
    expect(handTapPlan(land, at({ ok: false, reason: "land.same" }), tap).do).toBe("pass");
    expect(handTapPlan(dyn, at({ ok: false, reason: "dynamite.town" }), tap).do).toBe("pass");
    expect(handTapPlan(land, at({ dq: 0, dr: 0 }), { double: true, quick: true }).do).toBe("pass");
  });

  it("земля: пустота — отметить; с «тап = разместить» — сразу; своя земля — ход и кнопка", () => {
    expect(handTakes(land, at())).toBe(true);
    expect(handTapPlan(land, at(), tap).do).toBe("mark");
    expect(handTapPlan(land, at(), { double: false, quick: true }).do).toBe("one");
    const rebuild = at({ cost: 5 });
    expect(handTakes(land, rebuild)).toBe(false);
    // Умный переключатель: по земле тап по-прежнему ведёт героя.
    expect(handTapPlan(land, rebuild, { double: false, quick: true }).do).toBe("offer");
    expect(handTapPlan(land, rebuild, { double: true, quick: false }).do).toBe("now");
    expect(handTapPlan(land, at(), { double: true, quick: false }).do).toBe("now");
    // Вода под землю: без корабля по ней не ходят — тап берёт рука, а не «нет корабля».
    expect(handTapPlan(land, rebuild, { double: false, quick: false, water: true }).do).toBe(
      "mark",
    );
    expect(handTapPlan(land, rebuild, { double: false, quick: true, water: true }).do).toBe("one");
    expect(
      handTapPlan(dyn, at({ cost: 100 }), { double: false, quick: false, water: true }).do,
    ).toBe("offer");
  });

  it("динамит: то, что взорвётся, — отметить, двойным — бросить; пустая земля — ход и кнопка", () => {
    const mob = at({ hit: "mob", cost: 100 });
    expect(handTapPlan(dyn, mob, tap).do).toBe("mark");
    expect(handTapPlan(dyn, mob, { double: true, quick: false }).do).toBe("now");
    // «Тап = разместить» динамит не бросает.
    expect(handTapPlan(dyn, mob, { double: false, quick: true }).do).toBe("mark");
    // Вода у красного (30.10.2026) — цель «рыба»: как моб, даже с корабля и по воде.
    const water = at({ hit: "fish", cost: 100 });
    expect(handTapPlan(dyn, water, { ...tap, water: true }).do).toBe("mark");
    expect(handTapPlan(dyn, water, { double: true, quick: false, water: true }).do).toBe("now");
    const ground = at({ cost: 100 });
    expect(handTapPlan(dyn, ground, tap).do).toBe("offer");
    // Дрогнул палец по пустой земле — не бросок.
    expect(handTapPlan(dyn, ground, { double: true, quick: false }).do).toBe("offer");
  });
});

describe("гриб в руке (31.10.2026)", () => {
  const shroom = { kind: "mushroom" as const };
  it("как жила: тап — ход и кнопка, двойной — сразу, своя клетка — обычный тап", () => {
    expect(handTapPlan(shroom, at(), tap).do).toBe("offer");
    expect(handTapPlan(shroom, at(), { double: false, quick: true }).do).toBe("offer");
    expect(handTapPlan(shroom, at(), { double: true, quick: false }).do).toBe("now");
    expect(handTapPlan(shroom, at({ dq: 0, dr: 0 }), { double: true, quick: true }).do).toBe(
      "pass",
    );
    expect(handTakes(shroom, at())).toBe(false);
  });
});

describe("красный динамит по чужому кораблю (28.10.2026)", async () => {
  const { redOnForeignShip } = await import("./handTap");
  const red = { kind: "dynamite" as const, stackKey: "custom:cst_cpsl1cy0hpd7" };
  const blue = { kind: "dynamite" as const, stackKey: "custom:cst_hionm0xz40lz" };
  const c = { q: 1, r: 0, dq: 1, dr: 0, ok: true, reason: null, hit: null, cost: 100 };
  it("красный по чужому кораблю в круге — подсказка, не посадка", () => {
    expect(redOnForeignShip(red, c, { mine: false })).toBe(true);
  });
  it("красный по воде с чужим кораблём — клетка цель (рыба): тап берёт рука, не подсказка", () => {
    const fish = { ...c, hit: "fish" };
    expect(redOnForeignShip(red, fish, { mine: false })).toBe(false);
  });
  it("свой корабль, синий динамит, вне круга, без корабля — обычный путь", () => {
    expect(redOnForeignShip(red, c, { mine: true })).toBe(false);
    expect(redOnForeignShip(blue, c, { mine: false })).toBe(false);
    expect(redOnForeignShip(red, null, { mine: false })).toBe(false);
    expect(redOnForeignShip(red, c, undefined)).toBe(false);
  });
});

describe("синий динамит по плывущему кораблю (28.10.2026)", async () => {
  const { withLiveShip, handTapPlan: plan } = await import("./handTap");
  const blue = { kind: "dynamite" as const, stackKey: "custom:cst_hionm0xz40lz" };
  const red = { kind: "dynamite" as const, stackKey: "custom:cst_cpsl1cy0hpd7" };
  const water = { q: 2, r: 0, dq: 2, dr: 0, ok: true, reason: null, hit: null, cost: 100 };
  it("корабль приплыл после круга — цель: тап берёт рука, а не посадка", () => {
    const c = withLiveShip(blue, water, { mine: false });
    expect(c?.hit).toBe("ship");
    expect(plan(blue, c, { double: false, quick: false, water: true }).do).toBe("mark");
  });
  it("корабль уплыл — цели нет", () => {
    expect(withLiveShip(blue, { ...water, hit: "ship" }, undefined)?.hit).toBeNull();
  });
  it("красный и запрещённая клетка — без изменений", () => {
    expect(withLiveShip(red, water, { mine: false })?.hit).toBeNull();
    expect(withLiveShip(blue, { ...water, ok: false }, { mine: false })?.hit).toBeNull();
  });
});

describe("синий по кораблю за кругом броска", async () => {
  const { blueShipTooFar } = await import("./handTap");
  const blue = { kind: "dynamite" as const, stackKey: "custom:cst_hionm0xz40lz" };
  it("чужой занятый за кругом — «далеко», свой или свободный — обычный тап", () => {
    expect(blueShipTooFar(blue, null, { mine: false, free: 0 })).toBe(true);
    expect(blueShipTooFar(blue, null, { mine: true, free: 0 })).toBe(false);
    expect(blueShipTooFar(blue, null, { mine: false, free: 1 })).toBe(false);
  });
});
