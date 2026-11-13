// Возврат съеденных (§8.85): через 12 ч бросок 50 %, выпало — свободная жила своего
// вида. Шаг обхода зовёт базу с ключом вызова и рассылает вставших одной дельтой.
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({
  sql: [] as string[],
  rows: [] as unknown[],
  announced: [] as unknown[],
}));
vi.mock("@/server/db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    s.sql.push(sql);
    return s.rows;
  },
}));
vi.mock("@/server/api/beta-raid/dmine/dmine-spawn", async (orig) => ({
  ...(await orig<typeof import("./dmine-spawn")>()),
  announceSpawn: async (res: unknown) => {
    s.announced.push(res);
  },
}));

const { respawnEatenMushrooms } = await import("./dmine-respawn");

beforeEach(() => {
  s.sql.length = 0;
  s.rows = [];
  s.announced.length = 0;
});

describe("возврат съеденных — шаг обхода", () => {
  it("вставшие — одной рассылкой; ключ вызова; нечего — без рассылки", async () => {
    s.rows = [
      {
        res: {
          hour: "h",
          spawned: 1,
          building: "building_3arAnV9ajZ",
          cells: [{ map: "m", q: 1, r: 2, kind: "gold", skin: "bskin_dm_gold" }],
        },
      },
    ];
    await expect(respawnEatenMushrooms()).resolves.toBe(1);
    expect(s.sql[0]).toMatch(/yuplink\.raid_mushroom_respawn_due\('respawn:[0-9a-f-]{36}', 20\)/);
    expect(s.announced).toHaveLength(1);
    s.rows = [{ res: null }];
    await expect(respawnEatenMushrooms()).resolves.toBe(0);
    expect(s.announced).toHaveLength(1);
  });
});

describe("миграции mushroom-13/14", () => {
  const read = (f: string) => readFileSync(`migrations/${f}`, "utf8").replace(/\s+/g, " ");
  const back = read("mushroom-13-respawn-chance.sql");
  const spawn = read("mushroom-14-spawn-counts-pending.sql");
  it("съедение: срок 12 часов", () => {
    expect(back).toContain("now() + interval '12 hours');");
  });
  it("один бросок 50 %; не выпало — закрыто; выпало — только сама жила своего вида", () => {
    expect(back).toContain("v_win := COALESCE(e.respawn_roll, random() < 0.5);");
    expect(back).toContain(
      "UPDATE yuplink.raid_mushroom_eat SET respawned_at = now() WHERE op = e.op;",
    );
    expect(back).toContain(
      "FROM yuplink.raid_map_vein v WHERE v.kind = CASE e.kind WHEN 'diamonds' THEN 'diamonds' ELSE 'gold' END",
    );
    expect(back).toContain("AND yuplink.raid_mushroom_cell_free(v.map_id, v.q, v.r)");
  });
  it("выпавшие и ждущие жилу — в конце очереди; повтор моста ждёт первый вызов", () => {
    expect(back).toContain("ORDER BY (respawn_roll IS TRUE), respawn_at");
    expect(back).toContain("PERFORM pg_advisory_xact_lock(hashtext('mushroom-respawn'));");
  });
  it("ждущие броска или жилы — в лимите появления, проигравшие — нет", () => {
    expect(spawn).toContain("AND e.respawn_roll IS DISTINCT FROM false) x;");
  });
});
