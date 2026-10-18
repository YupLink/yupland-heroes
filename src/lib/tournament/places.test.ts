// Места одним полем и фонд DARAI турнира.
import { describe, expect, it } from "vitest";
import {
  bandsError,
  fundDarai,
  parsePlaces,
  placeDarai,
  prizePlaces,
  prizesForPlace,
} from "@/lib/tournament/places";
import type { TourBand } from "@/lib/tournament/types";

const d = (amount: number) => ({ kind: "token" as const, amount, refId: "Darai" });
const gold = (amount: number) => ({ kind: "resource" as const, amount, refId: "gold" });

const bands: TourBand[] = [
  { places: "1", prizes: [d(1000), gold(50_000)] },
  { places: "2-3", prizes: [d(500), gold(25_000)] },
  { places: "4–10", prizes: [gold(10_000)] },
];

describe("места одним полем", () => {
  it("число или диапазон; мусор — null", () => {
    expect(parsePlaces("1")).toEqual({ from: 1, to: 1 });
    expect(parsePlaces(" 2 - 3 ")).toEqual({ from: 2, to: 3 });
    expect(parsePlaces("4–10")).toEqual({ from: 4, to: 10 });
    expect(parsePlaces("0")).toBeNull();
    expect(parsePlaces("5-2")).toBeNull();
    expect(parsePlaces("abc")).toBeNull();
  });

  it("строки не пересекаются, у каждой есть приз", () => {
    expect(bandsError(bands)).toBeNull();
    expect(bandsError([...bands, { places: "3", prizes: [gold(1)] }])).toBe("tour.err.overlap");
    expect(bandsError([{ places: "1", prizes: [] }])).toBe("tour.err.no_prize");
    expect(bandsError([{ places: "x", prizes: [gold(1)] }])).toBe("tour.err.places");
  });

  it("призы и DARAI по месту; фонд = DARAI × мест", () => {
    expect(prizesForPlace(bands, 3)).toEqual(bands[1].prizes);
    expect(prizesForPlace(bands, 11)).toEqual([]);
    expect(prizePlaces(bands)).toBe(10);
    expect(placeDarai(bands, 2)).toBe(500);
    expect(fundDarai(bands)).toBe(1000 + 2 * 500);
  });
});
