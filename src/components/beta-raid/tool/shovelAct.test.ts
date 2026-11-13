// Что лопата в руках делает с клеткой (§8.24) и предложение лопаты: пустая
// земля — «Копать», мешочек и сундук — «Закопать», бугорок — «Выкопать»; где
// нельзя стоять, под декором, на постройке, объекте, корабле, в городе и под
// куполом — ничего. «Копать под собой» гаснет само через 5 с; кнопка плашки и
// прибытие маршрута зовут того, кто выполняет.
import { afterEach, describe, expect, it, vi } from "vitest";
import { shovelActAt } from "./shovelAct";
import { shovelOffer } from "./shovelOffer";
import type { Cell } from "@/components/beta-raid/unpackMap";

const land: Cell = { terrainId: "t_grass" };
const at = (cell: Cell | undefined, o: Partial<Parameters<typeof shovelActAt>[0]> = {}) =>
  shovelActAt({ cell, bag: undefined, chest: undefined, ship: false, water: false, ...o });

describe("что лопата сделает с клеткой", () => {
  it("пустая земля — «Копать»", () => {
    expect(at(land)).toBe("dig");
    expect(at({ ...land, objectId: "boss:x", objectDefeated: true })).toBeNull();
  });

  it("на ямке «Копать» нет — только «Закопать» её (§8.24 п. 6б)", () => {
    expect(at(land, { hole: true })).toBe("bury");
    expect(at(land, { hole: false })).toBe("dig");
    expect(at(land, { hole: true, bag: { n: 1, buried: true } })).toBe("unbury");
  });

  it("мешочек — «Закопать», одни бугорки — «Выкопать»; сундук — обычный или свой", () => {
    expect(at(land, { bag: { n: 2, buried: false } })).toBe("bury");
    expect(at(land, { bag: { n: 1, buried: true } })).toBe("unbury");
    const chest = { image: null, name: "Сундук" };
    expect(at(land, { chest: { ...chest, mine: false, plain: true } })).toBe("bury");
    expect(at(land, { chest: { ...chest, mine: true } })).toBe("bury");
    expect(at(land, { chest: { ...chest, mine: false } })).toBeNull();
  });

  it("нельзя: вода, корабль, декор, постройка, живой объект, купол, город, нет местности", () => {
    expect(at(land, { water: true })).toBeNull();
    expect(at(land, { ship: true })).toBeNull();
    expect(at({ ...land, decorationId: "decoration_tree" })).toBeNull();
    expect(
      at({ ...land, decorationId: "decoration_tree" }, { bag: { n: 1, buried: false } }),
    ).toBeNull();
    expect(at({ ...land, buildingId: "b1" })).toBeNull();
    expect(at({ ...land, objectId: "boss:x" }, { bag: { n: 1, buried: false } })).toBeNull();
    expect(at({ ...land, voidFog: true })).toBeNull();
    expect(at({ ...land, townHall: { q: 0, r: 0 } })).toBeNull();
    // Шахта (§8.59 п. 9): ни закопать, ни выкопать — даже старый бугорок.
    expect(
      at({ ...land, buildingId: "b1", mine: true }, { bag: { n: 1, buried: true } }),
    ).toBeNull();
    expect(at({ ...land, mine: true }, { bag: { n: 1, buried: false } })).toBeNull();
    expect(at({})).toBeNull();
    expect(at(undefined)).toBeNull();
  });
});

describe("предложение лопаты", () => {
  afterEach(() => {
    vi.useRealTimers();
    shovelOffer.setRunner(null);
    shovelOffer.set(null);
  });

  it("«копать под собой» гаснет само через 5 с, прочие — нет", () => {
    vi.useFakeTimers();
    shovelOffer.set({ q: 1, r: 2, act: "dig", near: true, here: true });
    vi.advanceTimersByTime(4900);
    expect(shovelOffer.get()?.here).toBe(true);
    vi.advanceTimersByTime(200);
    expect(shovelOffer.get()).toBeNull();
    shovelOffer.set({ q: 3, r: 2, act: "dig", near: false, here: false });
    vi.advanceTimersByTime(60_000);
    expect(shovelOffer.get()).not.toBeNull();
  });

  it("кнопка плашки и прибытие маршрута — к тому, кто выполняет; без него — ничего", () => {
    const offer = { q: 1, r: 2, act: "bury" as const, near: true, here: false };
    shovelOffer.set(offer);
    expect(shovelOffer.go()).toBe(false);
    const go = vi.fn(() => true);
    const arrive = vi.fn();
    shovelOffer.setRunner({ go, arrive });
    expect(shovelOffer.go()).toBe(true);
    expect(go).toHaveBeenCalledWith(offer);
    shovelOffer.arrive({ q: 5, r: 5 });
    expect(arrive).toHaveBeenCalledWith({ q: 5, r: 5 });
  });

  it("подписчики узнают о смене, повтор того же предложения их не будит", () => {
    const seen = vi.fn();
    const off = shovelOffer.subscribe(seen);
    const offer = { q: 0, r: 0, act: "dig" as const, near: true, here: false };
    shovelOffer.set(offer);
    shovelOffer.set(offer);
    shovelOffer.set(null);
    off();
    expect(seen).toHaveBeenCalledTimes(2);
  });
});
