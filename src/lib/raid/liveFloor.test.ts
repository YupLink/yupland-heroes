import { describe, expect, it } from "vitest";
import { foreignFloor } from "./liveFloor";

describe("события по этажам", () => {
  it("событие другого этажа — чужое", () => {
    expect(foreignFloor("alpha", "maze")).toBe(true);
  });
  it("своего этажа — своё", () => {
    expect(foreignFloor("maze", "maze")).toBe(false);
  });
  it("событие для всех карт (null) или этаж смотрящего неизвестен — применяем", () => {
    expect(foreignFloor(null, "maze")).toBe(false);
    expect(foreignFloor(undefined, "maze")).toBe(false);
    expect(foreignFloor("alpha", null)).toBe(false);
  });
});
