// Окно турниров у постройки: постройка обязана быть «Турниром», а игрок — рядом.
import { beforeEach, describe, expect, it, vi } from "vitest";

const st = {
  effect: "tournament" as string | null,
  pos: { q: 0, r: 0 } as { q: number; r: number } | null,
};

vi.mock("../beta-raid/building-action", () => ({
  loadCellBuilding: async () => (st.effect == null ? null : { effect: st.effect }),
}));
vi.mock("../beta-raid/encounter-where", () => ({
  myMapId: async () => "map-1",
  ownCell: async () => st.pos,
}));
vi.mock("../beta-raid/helpers", () => ({
  areNeighbors: (q1: number, r1: number, q2: number, r2: number) =>
    Math.abs(q1 - q2) + Math.abs(r1 - r2) === 1,
}));

const { requireTourHere } = await import("./tour-gate");

describe("requireTourHere", () => {
  beforeEach(() => {
    st.effect = "tournament";
    st.pos = { q: 0, r: 0 };
  });

  it("не «Турнир» — tour.err.not_here", async () => {
    st.effect = "museum";
    await expect(requireTourHere("w", 0, 0)).rejects.toThrow("tour.err.not_here");
    st.effect = null;
    await expect(requireTourHere("w", 0, 0)).rejects.toThrow("tour.err.not_here");
  });

  it("издалека — tour.err.far", async () => {
    st.pos = { q: 5, r: 5 };
    await expect(requireTourHere("w", 0, 0)).rejects.toThrow("tour.err.far");
  });
});
