// «Защита на час» (владелец, 22.10.2026): числа владельца, созревание и подпись,
// которая сама прячется через 5 секунд после нажатия.
import { describe, expect, it } from "vitest";
import {
  MUSHROOM_PROTECT_ENERGY,
  MUSHROOM_RIPEN_MS,
  RIPE_HINT_MS,
  isRipening,
  ripeAtMs,
  ripeHintShown,
} from "./mushroomRipe";

const NOW = Date.parse("2026-10-22T16:00:00Z");

describe("числа владельца", () => {
  it("5 энергии, час созревания, подпись — 5 секунд", () => {
    expect(MUSHROOM_PROTECT_ENERGY).toBe(5);
    expect(MUSHROOM_RIPEN_MS).toBe(3_600_000);
    expect(RIPE_HINT_MS).toBe(5_000);
  });
});

describe("созревание", () => {
  it("созревает только до своей минуты; защиты нет — не созревает", () => {
    expect(isRipening(NOW + 1, NOW)).toBe(true);
    expect(isRipening(NOW, NOW)).toBe(false);
    expect(isRipening(null, NOW)).toBe(false);
    expect(isRipening(Number.NaN, NOW)).toBe(false);
  });

  it("время из базы: ISO и мс; прошедшее и мусор — null", () => {
    const iso = new Date(NOW + 60_000).toISOString();
    expect(ripeAtMs(iso, NOW)).toBe(NOW + 60_000);
    expect(ripeAtMs(NOW + 5, NOW)).toBe(NOW + 5);
    expect(ripeAtMs(new Date(NOW - 1).toISOString(), NOW)).toBeNull();
    expect(ripeAtMs("вчера", NOW)).toBeNull();
    expect(ripeAtMs(null, NOW)).toBeNull();
  });
});

describe("подпись после нажатия", () => {
  it("видна 5 секунд, потом прячется; не нажимали — не видна", () => {
    expect(ripeHintShown(NOW, NOW)).toBe(true);
    expect(ripeHintShown(NOW, NOW + RIPE_HINT_MS - 1)).toBe(true);
    expect(ripeHintShown(NOW, NOW + RIPE_HINT_MS)).toBe(false);
    expect(ripeHintShown(null, NOW)).toBe(false);
  });
});
