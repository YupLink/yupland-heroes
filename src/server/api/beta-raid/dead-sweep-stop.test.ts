// Таймер уборки снесённого острова останавливается и отпускает снимок карты;
// живой остров и карты мира убираются, как прежде.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({
  sql: [] as string[],
  mapExists: false,
  busy: true,
  forgot: [] as string[],
}));

vi.mock("../../db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    s.sql.push(sql);
    if (sql.includes("FROM yuplink.raid_maps")) return [{ map: s.mapExists, busy: s.busy }];
    return [{ n: 0, cells: null, runner_cells: null }];
  },
}));
vi.mock("./map-base", () => ({ dropMapBase: () => {} }));
vi.mock("./map-snapshot", () => ({ forgetMapSnapshot: (id: string) => s.forgot.push(id) }));

const { startDeadSweeper } = await import("./dead-sweep");
const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

beforeEach(() => {
  vi.useFakeTimers();
  Object.assign(s, { sql: [], mapExists: false, busy: true, forgot: [] });
});
afterEach(() => vi.useRealTimers());

describe("уборка снесённого острова", () => {
  it("карты острова нет — таймер стоп, снимок прочь, уборки нет", async () => {
    startDeadSweeper("isle_gone");
    await vi.advanceTimersByTimeAsync(60_000);
    await flush();
    expect(s.forgot).toEqual(["isle_gone"]);
    const after = s.sql.length;
    await vi.advanceTimersByTimeAsync(180_000);
    expect(s.sql.length).toBe(after);
  });

  it("остров жив — уборка идёт", async () => {
    s.mapExists = true;
    startDeadSweeper("isle_live");
    await vi.advanceTimersByTimeAsync(60_000);
    await flush();
    expect(s.forgot).toEqual([]);
    expect(s.sql.some((q) => !q.includes("FROM yuplink.raid_maps"))).toBe(true);
  });

  it("остров есть, но на нём никто не стоит (ушёл, бросил) — таймер стоп, память прочь", async () => {
    s.mapExists = true;
    s.busy = false;
    startDeadSweeper("isle_left");
    await vi.advanceTimersByTimeAsync(60_000);
    await flush();
    expect(s.forgot).toEqual(["isle_left"]);
  });

  it("карта мира — без проверки существования", async () => {
    startDeadSweeper("beta_main_x");
    await vi.advanceTimersByTimeAsync(60_000);
    await flush();
    expect(s.sql.some((q) => q.includes("FROM yuplink.raid_maps WHERE id = 'beta_main_x'"))).toBe(
      false,
    );
  });
});
