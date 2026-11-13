// Режимы ластика: по слою сверху, один слой, клетка целиком с местностью.
import { describe, expect, it } from "vitest";
import { erasePatch } from "@/components/beta-raid/eraseTarget";
import { keepTerrain } from "@/server/api/beta-raid/admin-cell-patch";

const full = {
  terrainId: "grass",
  roadId: "road",
  decorationId: "oak",
  objectId: "boss:x",
  buildingId: "house",
  groupId: null,
};
const none = () => null;

describe("ластик", () => {
  it("сверху — по одному слою: объект, потом декор, постройка, дорога; землю не трогает", () => {
    expect(erasePatch(full, "top", 1, 2, none)).toEqual({ q: 1, r: 2, objectId: null });
    expect(erasePatch({ ...full, objectId: null }, "top", 1, 2, none)).toEqual({
      q: 1,
      r: 2,
      decorationId: null,
    });
    const ground = { ...full, objectId: null, decorationId: null, buildingId: null, roadId: null };
    expect(erasePatch(ground, "top", 1, 2, none)).toBeNull();
  });

  it("один слой — только он, даже если сверху лежит другое", () => {
    expect(erasePatch(full, "road", 1, 2, none)).toEqual({ q: 1, r: 2, roadId: null });
    expect(erasePatch(full, "building", 1, 2, none)).toEqual({ q: 1, r: 2, buildingId: null });
    expect(erasePatch({ ...full, decorationId: null }, "decor", 1, 2, none)).toBeNull();
  });

  it("декор блока стирается там, где он стоит", () => {
    const member = { ...full, decorationId: null, groupId: "g1" };
    const held = (f: string) => (f === "decorationId" ? { q: 5, r: 5 } : null);
    expect(erasePatch(member, "decor", 1, 2, held)).toEqual({ q: 5, r: 5, decorationId: null });
  });

  it("местность — клетка целиком, пустая клетка — нечего", () => {
    expect(erasePatch({ ...full, groupId: "g1" }, "terrain", 1, 2, none)).toEqual({
      q: 1,
      r: 2,
      terrainId: null,
      roadId: null,
      objectId: null,
      decorationId: null,
      buildingId: null,
      groupId: null,
    });
    const empty = {
      terrainId: null,
      roadId: null,
      decorationId: null,
      objectId: null,
      buildingId: null,
    };
    expect(erasePatch(empty, "terrain", 1, 2, none)).toBeNull();
  });

  it("сервер вне мира креатора местность не стирает, остальное пропускает", () => {
    expect(keepTerrain({ q: 1, r: 2, terrainId: null, objectId: null } as never)).toEqual({
      q: 1,
      r: 2,
      terrainId: undefined,
      objectId: null,
    });
    expect(keepTerrain({ q: 1, r: 2, terrainId: "grass" } as never)).toEqual({
      q: 1,
      r: 2,
      terrainId: "grass",
    });
  });
});
