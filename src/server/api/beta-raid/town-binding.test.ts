// Привязка лавки к ратуше (владелец, 04.10.2026): чья лавка и какие ратуши
// предлагать — от ближней к дальней. Базы нет: mcpExec подменён.
import { beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({ rows: [] as unknown[], sql: [] as string[] }));

vi.mock("../../db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    s.sql.push(sql);
    return s.rows;
  },
}));
vi.mock("../../auth", () => ({ requireAdmin: () => undefined }));
vi.mock("./encounter-where", () => ({
  activeBetaMapId: async () => "map-1",
  myMapId: async () => "map-1",
}));

const { shopTown, townHallsNear } = await import("./town-binding");

describe("shopTown", () => {
  beforeEach(() => {
    s.rows = [];
    s.sql = [];
  });

  it("привязанная лавка — ключ её ратуши", async () => {
    s.rows = [{ tq: "33", tr: 53 }];
    expect(await shopTown("map-1", 35, 53)).toEqual({ mapId: "map-1", q: 33, r: 53 });
    // Ратуша обязана жить в реестре: снесённая не держит лавку.
    expect(s.sql[0]).toContain("JOIN yuplink.raid_town");
  });

  it("без галочки — обычная лавка", async () => {
    expect(await shopTown("map-1", 35, 53)).toBeNull();
  });
});

describe("townHallsNear", () => {
  beforeEach(() => {
    s.rows = [];
  });

  it("от ближней к дальней, с жителями и местностью", async () => {
    s.rows = [
      { q: -49, r: -34, residents: "5000", name: "Ратуша", land: null },
      { q: 33, r: 53, residents: "500", name: "Ратуша", land: "Город Кабанов" },
      { q: -90, r: -40, residents: null, name: "Ратуша", land: "Степь" },
    ];
    const halls = await townHallsNear("map-1", 35, 53);
    expect(halls.map((h) => `${h.q},${h.r}`)).toEqual(["33,53", "-49,-34", "-90,-40"]);
    expect(halls[0]).toMatchObject({ dist: 2, residents: 500, land: "Город Кабанов" });
    expect(halls[2].residents).toBe(0);
  });

  it("ратуш нет — пустой список", async () => {
    expect(await townHallsNear("map-1", 0, 0)).toEqual([]);
  });
});
