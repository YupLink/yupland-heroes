// Замок — только в главном мире (§8.39): на другом этаже те же координаты
// порогом замка не считаются. Любая ратуша — тоже замок, не только своя (16.10),
// и в любом мире: у ратуши Асгарда героя меняют так же, как в Мидгарде (04.11).
import { beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({
  map: "alpha",
  pos: { q: 0, r: 0 } as { q: number; r: number },
  towns: [] as Array<{ q: number; r: number; name: string | null }>,
}));

vi.mock("../../db/mcpClient", () => ({
  mcpExec: async (sql: string) => (sql.includes("raid_town") ? s.towns : [{ size: 129 }]),
}));
vi.mock("./encounter-where", () => ({
  activeBetaMapId: async () => "alpha",
  myMapId: async () => s.map,
  ownCell: async () => s.pos,
}));

const { castleCell, isAtCastle } = await import("./castle");

beforeEach(async () => {
  s.map = "alpha";
  s.towns = [];
  s.pos = await castleCell("alpha");
});

describe("isAtCastle", () => {
  it("в главном мире у замка — в замке", async () => {
    expect(await isAtCastle("me.near")).toBe(true);
  });

  it("на другом этаже в тех же координатах — нет", async () => {
    s.map = "maze";
    expect(await isAtCastle("me.near")).toBe(false);
  });

  it("вплотную к чужой ратуше — тоже в замке; вдали от всего — нет", async () => {
    s.pos = { q: 5, r: 5 };
    expect(await isAtCastle("me.near")).toBe(false);
    s.towns = [{ q: 5, r: 6, name: "Чужой город" }];
    expect(await isAtCastle("me.near")).toBe(true);
  });

  it("в другом мире у ратуши — в замке (смена героя как в главном)", async () => {
    s.map = "asgard";
    s.pos = { q: 20, r: 47 };
    expect(await isAtCastle("me.near")).toBe(false);
    s.towns = [{ q: 20, r: 48, name: "Солдон" }];
    expect(await isAtCastle("me.near")).toBe(true);
  });
});
