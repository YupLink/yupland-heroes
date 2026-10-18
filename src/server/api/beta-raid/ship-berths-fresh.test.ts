// Снимок причалов, снятый до моего гребка, обязан быть отвергнут.
//
// Жалоба 20.09: после гребка рефетч причалов приносил судно на прошлой клетке
// с игроком в экипаже — герой «пешком» на воде, корабль «занят другим», плыть
// нельзя до F5. Здесь — ровно те четыре положения, которые различает сверка.
import { describe, expect, it } from "vitest";
import { knowsMyShip } from "./ship-berths-fresh";

const ME = "acc_me";
const OTHER = "acc_other";

/** Снимок: моё судно ещё на 10,5, рядом чужое занятое. */
const snapshot = [
  { q: 10, r: 5, crew: [ME] },
  { q: 12, r: 5, crew: [OTHER] },
  { q: 3, r: 3, crew: [] },
];

describe("knowsMyShip", () => {
  it("гребок: живое судно уехало на 11,5, а снимок держит его на 10,5 — протух", () => {
    expect(knowsMyShip(snapshot, ME, { q: 11, r: 5 })).toBe(false);
  });

  it("сход: живьём я ни на чём, а снимок ещё сажает меня в экипаж — протух", () => {
    expect(knowsMyShip(snapshot, ME, null)).toBe(false);
  });

  it("посадка: живьём я на 3,3, а в снимке это судно ещё свободно — протух", () => {
    expect(knowsMyShip(snapshot, "acc_new", { q: 3, r: 3 })).toBe(false);
  });

  it("совпадает: судно там же, где я записан — годится", () => {
    expect(knowsMyShip(snapshot, ME, { q: 10, r: 5 })).toBe(true);
  });

  it("пешком и в снимке меня нет — годится", () => {
    expect(knowsMyShip(snapshot, "acc_walker", null)).toBe(true);
  });

  // Случая «чтение своего судна упало» здесь нет: MySeat не знает undefined —
  // сбой myShip роняет весь getBetaRaidShips (ship-action), снимок не уходит.

  it("без аккаунта сверка невозможна — снимок отдаём", () => {
    expect(knowsMyShip(snapshot, null, { q: 11, r: 5 })).toBe(true);
  });
});
