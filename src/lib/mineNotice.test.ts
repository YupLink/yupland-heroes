// Уведомления «Добычи» (§8.106): строки базы → уведомления; мир героя — булавка.
import { describe, expect, it } from "vitest";
import { noticesOf } from "@/lib/mineNotice";

describe("noticesOf", () => {
  it("свой мир — here, гриб — с видом, мусор отброшен", () => {
    const rows = [
      {
        id: "a",
        kind: "capture",
        map_id: "m1",
        world: "Асгард",
        q: "3",
        r: -4,
        resource: "stone",
        amount: "12.5",
        at: "1700000000000",
      },
      {
        id: "b",
        kind: "take",
        map_id: "m2",
        world: " ",
        q: 1,
        r: 2,
        resource: "token",
        token: "Darai",
        amount: null,
        at: 5,
      },
      { id: "", kind: "capture", map_id: "m1" },
      { id: "c", kind: "capture", map_id: null },
      null,
    ];
    expect(noticesOf(rows, "m1")).toEqual([
      {
        id: "a",
        kind: "capture",
        mapId: "m1",
        world: "Асгард",
        here: true,
        q: 3,
        r: -4,
        resource: "stone",
        amount: 12.5,
        at: 1700000000000,
      },
      {
        id: "b",
        kind: "take",
        mapId: "m2",
        world: null,
        here: false,
        q: 1,
        r: 2,
        resource: "token",
        mushroom: "darai",
        amount: 0,
        at: 5,
      },
    ]);
    expect(noticesOf("junk", "m1")).toEqual([]);
    expect(noticesOf([{ id: "x", kind: "weird", map_id: "m", amount: -3 }], null)[0]).toMatchObject(
      {
        kind: "capture",
        here: false,
        amount: 0,
      },
    );
  });
});
