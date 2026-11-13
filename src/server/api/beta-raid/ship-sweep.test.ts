// Уборка кораблей: разбитый — через 2 суток (как было), подбитый синим динамитом
// (dynamite-08) — через час от взрыва. Снятое уходит всем событием «ships».
import { beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({
  sql: [] as string[],
  blasted: [] as Array<{ id: string }>,
  events: [] as Array<{ mapId: string; type: string; cells?: unknown }>,
}));

vi.mock("../../db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    s.sql.push(sql);
    if (sql.includes("DELETE") && sql.includes("blasted_at")) return s.blasted;
    return [];
  },
}));
vi.mock("../../raidLive", () => ({
  publishRaid: (e: { mapId: string; type: string }) => void s.events.push(e),
}));

import { sweepBrokenShips } from "./ship-sweep";
import { SHIP_BLASTED_TTL_MIN } from "@/lib/shipBlasted";

const deletes = () => s.sql.filter((x) => x.includes("DELETE FROM yuplink.beta_raid_ship"));

beforeEach(() => {
  s.sql = [];
  s.blasted = [];
  s.events = [];
});

describe("sweepBrokenShips — подбитые", () => {
  it("срок подбитого — час", () => {
    expect(SHIP_BLASTED_TTL_MIN).toBe(60);
  });

  it("подбитые старше часа — долой с этой карты, и всем «ships» без клеток", async () => {
    s.blasted = [{ id: "ship_w" }];
    await sweepBrokenShips("map_a");
    const sql = deletes().find((x) => x.includes("blasted_at")) ?? "";
    expect(sql).toContain("WHERE map_id = 'map_a' AND blasted_at IS NOT NULL");
    expect(sql).toContain("AND blasted_at < now() - interval '60 minutes'");
    expect(s.events).toEqual([{ mapId: "map_a", type: "ships" }]);
  });

  it("обычный разбитый — по-прежнему 2 суток и без оглядки на штамп подбитого", async () => {
    await sweepBrokenShips("map_b");
    const old = deletes().find((x) => !x.includes("blasted_at")) ?? "";
    expect(old).toContain("hp_zero_at < now() - interval '2 days'");
    // Снимать нечего — событие не шлём.
    expect(s.events).toHaveLength(0);
  });

  it("чаще раза в минуту на карту не ходит", async () => {
    await sweepBrokenShips("map_c");
    const n = s.sql.length;
    s.blasted = [{ id: "ship_w" }];
    await sweepBrokenShips("map_c");
    expect(s.sql.length).toBe(n);
    expect(s.events).toHaveLength(0);
  });
});
