// Перенос в режиме бога: каждая причина отказа, остаток и вид — словом на
// обоих языках (§4.0.1); окно знает, когда оставаться в режиме переноса; ответ
// сервера ложится на карту ровно тем, что ехало.
import { describe, expect, it } from "vitest";
import {
  GOD_MOVE_KINDS,
  GOD_MOVE_LEFTOVERS,
  GOD_MOVE_REASONS,
  cellPatches,
  godMoveParts,
  keepsMoving,
  type GodMovedCell,
} from "@/lib/godMove";
import { dict } from "@/lib/translations";

const both = (key: string) => {
  const e = dict[key];
  return !!e?.ru?.trim() && !!e?.en?.trim();
};

describe("перенос: тексты и режим", () => {
  it("кнопка, полоска, строки окна, тосты — ru и en", () => {
    const keys = ["move", "cancel", "done", "failed", "draft_pending", "buried"];
    keys.push("row.chest", "row.bags", "kind.block");
    for (const k of keys) expect(both(`godmove.${k}`), k).toBe(true);
    for (const k of GOD_MOVE_KINDS) expect(both(`godmove.kind.${k}`), k).toBe(true);
  });

  it("каждая причина отказа и каждый остаток — ru и en", () => {
    for (const r of GOD_MOVE_REASONS) expect(both(`godmove.${r}`), r).toBe(true);
    for (const k of GOD_MOVE_LEFTOVERS) expect(both(`godmove.lo.${k}`), k).toBe(true);
    expect(dict["godmove.target_leftovers"].ru).toContain("{what}");
    expect(dict["godmove.target_leftovers"].en).toContain("{what}");
  });

  it("не подошла цель — выбираем другую; дело в самом переносимом — режим снят", () => {
    expect(keepsMoving("target_water")).toBe(true);
    expect(keepsMoving("target_leftovers")).toBe(true);
    expect(keepsMoving("target_runner")).toBe(true);
    expect(keepsMoving("same_cell")).toBe(true);
    for (const r of ["gone", "changed", "dead", "block_many", "chest_guard", "other_map"] as const)
      expect(keepsMoving(r), r).toBe(false);
  });
});

describe("перенос: ответ → правки карты", () => {
  const cells: GodMovedCell[] = [
    {
      q: 1,
      r: 0,
      buildingId: "b1",
      skinId: "sk",
      tier: 2,
      decorationId: "d1",
      groupId: "g",
      iconScale: 1.2,
    },
    {
      q: 0,
      r: 0,
      buildingId: null,
      skinId: null,
      tier: 0,
      decorationId: null,
      groupId: null,
      iconScale: null,
    },
  ];

  it("блок: постройка с обликом и тиром, декор, блок и масштаб", () => {
    expect(godMoveParts("decor", true)).toEqual({ building: true, decor: true, group: true });
    expect(cellPatches(cells, godMoveParts("building", true))).toEqual([
      {
        q: 1,
        r: 0,
        buildingId: "b1",
        tier: 2,
        buildingSkinId: "sk",
        decorationId: "d1",
        groupId: "g",
        iconScale: 1.2,
      },
      { q: 0, r: 0, buildingId: null, tier: 0, decorationId: null, groupId: null, iconScale: null },
    ]);
  });

  it("одиночные: здание — без декора и блока; декор — только декор", () => {
    expect(cellPatches(cells, godMoveParts("building", false))[0]).toEqual({
      q: 1,
      r: 0,
      buildingId: "b1",
      tier: 2,
      buildingSkinId: "sk",
    });
    expect(cellPatches(cells, godMoveParts("decor", false))).toEqual([
      { q: 1, r: 0, decorationId: "d1" },
      { q: 0, r: 0, decorationId: null },
    ]);
  });
});
