// Замок главного мира — из настройки 'beta_raid_castle' (ратуша Юпленда,
// 10.10.2026); на этажах и без настройки — центр карты.
import { describe, expect, it, vi } from "vitest";

vi.mock("../../db/mcpClient", () => ({
  mcpExec: async (sql: string) =>
    sql.includes("yuplink.settings") ? [{ value: '{"q":34,"r":63}' }] : [{ size: 129 }],
}));
vi.mock("./encounter-where", () => ({
  activeBetaMapId: async () => "alpha",
  myMapId: async () => "alpha",
  ownCell: async () => ({ q: 34, r: 62 }),
}));

const { castleCell, isAtCastle } = await import("./castle");

describe("замок главного мира — ратуша Юпленда", () => {
  it("главный мир — клетка из настройки", async () => {
    expect(await castleCell("alpha")).toEqual({ q: 34, r: 63 });
    expect(await castleCell()).toEqual({ q: 34, r: 63 });
  });
  it("этаж — по-прежнему центр своей карты", async () => {
    expect(await castleCell("maze")).not.toEqual({ q: 34, r: 63 });
  });
  it("вплотную к ратуше — в замке", async () => {
    expect(await isAtCastle("me.near")).toBe(true);
  });
});
