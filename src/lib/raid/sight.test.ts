// Бинокль: радиус «второго обзора» по списку бустов состояния (08.11).
import { describe, expect, it } from "vitest";
import { BINOCULAR_RADIUS, SIGHT_KIND, SIGHT_MAX, sightRadiusOf, sightUntil } from "./sight";
import { FOG_ACTIVE_RADIUS } from "./fogRadius";

const now = Date.parse("2026-11-08T12:00:00Z");
const at = (min: number) => new Date(now + min * 60_000).toISOString();

describe("sight", () => {
  it("без бинокля — 20, с ним — 40", () => {
    expect(FOG_ACTIVE_RADIUS).toBe(20);
    expect(BINOCULAR_RADIUS).toBe(40);
    expect(SIGHT_MAX).toBe(40);
    expect(sightRadiusOf([], now)).toBe(20);
    expect(sightRadiusOf([{ kind: SIGHT_KIND, value: 40, expiresAt: at(3) }], now)).toBe(40);
  });
  it("истёкший бинокль и чужие бусты не считаются", () => {
    expect(sightRadiusOf([{ kind: SIGHT_KIND, expiresAt: at(-1) }], now)).toBe(20);
    expect(sightRadiusOf([{ kind: "buff_spd", expiresAt: at(30) }], now)).toBe(20);
    expect(sightRadiusOf(null, now)).toBe(20);
    expect(sightRadiusOf("мусор", now)).toBe(20);
  });
  it("срок — самый дальний", () => {
    expect(
      sightUntil(
        [
          { kind: SIGHT_KIND, expiresAt: at(3) },
          { kind: SIGHT_KIND, expiresAt: at(60) },
        ],
        now,
      ),
    ).toBe(now + 60 * 60_000);
  });
});
