import { describe, expect, it } from "vitest";
import { currentStep, ISLAND_PILOT_STEP_IDS, ISLAND_STEP_IDS, parsePlaces } from "./steps";
import { islandStepList } from "./stepList";

const c = (q: number, r: number) => ({ q, r });
const places = parsePlaces({
  spawn: c(0, 0),
  chest: c(1, 0),
  workshop: c(2, 0),
  trees: [c(3, 0)],
  monsters: [c(4, 0)],
  crystals: [c(5, 0)],
  mine: c(6, 0),
  treasure: c(7, 0),
  portal: c(8, 0),
  hall: c(9, 0),
  gift: true,
  artifact: null,
  pack: null,
});
if (!places) throw new Error("Invalid island fixture");

describe("tutorial pilot step order", () => {
  it("puts chips after the first pack only for the pilot", () => {
    const done = new Set(["hello", "hero_pick", "walk", "chest", "pack_got", "x_pack"]);
    expect(currentStep(done, places)).toBe("axe");
    expect(currentStep(done, places, ISLAND_PILOT_STEP_IDS)).toBe("chips");
    expect(
      islandStepList(done, places, false, ISLAND_PILOT_STEP_IDS).find((step) => step.current)?.id,
    ).toBe("chips");
  });

  it("explains resource buildings before introducing the shovel and treasure", () => {
    expect(ISLAND_PILOT_STEP_IDS.indexOf("mine")).toBeLessThan(ISLAND_PILOT_STEP_IDS.indexOf("shovel"));
    expect(ISLAND_PILOT_STEP_IDS.indexOf("harvest")).toBeLessThan(ISLAND_PILOT_STEP_IDS.indexOf("dig"));
  });

  it("returns the pilot to island achievements without a temple or portal task", () => {
    expect(ISLAND_PILOT_STEP_IDS).not.toContain("grow_temple");
    expect(ISLAND_PILOT_STEP_IDS).not.toContain("portal");
    expect(ISLAND_PILOT_STEP_IDS.slice(-4)).toEqual([
      "hero_level",
      "hero_sets",
      "return_island",
      "achievements",
    ]);
    const done = new Set(ISLAND_PILOT_STEP_IDS.slice(0, -1));
    expect(currentStep(done, places, ISLAND_PILOT_STEP_IDS)).toBe("achievements");
    expect(currentStep(new Set(ISLAND_PILOT_STEP_IDS), places, ISLAND_PILOT_STEP_IDS)).toBeNull();
    expect(currentStep(new Set(ISLAND_PILOT_STEP_IDS), places, ISLAND_STEP_IDS)).not.toBeNull();
  });
});
