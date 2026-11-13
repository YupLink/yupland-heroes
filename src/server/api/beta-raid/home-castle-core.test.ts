// Основной замок: плата и запись одним запросом; первый выбор бесплатно;
// «у ратуши» — вплотную; снесённая ратуша — основным снова центральный замок.
import { beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({ sql: [] as string[], answers: [] as unknown[][] }));
vi.mock("../../db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    s.sql.push(sql);
    return s.answers.shift() ?? [];
  },
}));
vi.mock("./castle", () => ({
  castleCell: async () => ({ q: 10, r: 10 }),
  cellAtCastle: (pos: { q: number; r: number } | null, c: { q: number; r: number }) =>
    !!pos && Math.abs(pos.q - c.q) + Math.abs(pos.r - c.r) <= 1,
}));

const core = await import("./home-castle-core");

beforeEach(() => {
  s.sql = [];
  s.answers = [];
});

describe("setHome", () => {
  const place = { kind: "town" as const, q: 3, r: 4, name: "Город" };
  it("первый выбор — без списания золота", async () => {
    s.answers = [[{ moves: 1 }]];
    await core.setHome({
      account: "acc_1",
      wallet: "w",
      mapId: "m",
      place,
      cost: 0,
      opId: "op_12345678",
    });
    expect(s.sql[0]).not.toContain("res_move");
    expect(s.sql[0]).not.toContain("ticket_move");
    expect(s.sql[0]).toContain("ON CONFLICT (account_id)");
  });
  it("переселение — 2 500 золота (5 билетов × 500) тем же запросом, ключ от нажатия", async () => {
    s.answers = [[{ moves: 2 }]];
    await core.setHome({
      account: "acc_1",
      wallet: "w",
      mapId: "m",
      place,
      cost: core.HOME_MOVE_COST,
      opId: "op_12345678",
    });
    expect(core.HOME_MOVE_COST).toBe(2500);
    expect(s.sql[0]).toContain(
      "yuplink.res_move('acc_1', 'gold', -2500, 'home_castle', 'home:op_12345678')",
    );
    expect(s.sql[0]).not.toContain("ticket_move");
    // Оплата — подзапрос самой вставки: вложенный WITH с INSERT база отвергает
    // внутри обёртки mcpExec (09.10.2026).
    expect(s.sql[0]).toContain(") pay");
    expect(s.sql[0]).not.toMatch(/^\s*WITH/);
    expect(s.sql[0]).toContain("RETURNING moves");
    // Строка вставляется только при проведённой оплате.
    expect(s.sql[0]).toContain("WHERE pay.applied");
  });
  it("ключ нажатия уже проведён (applied=false, 0 строк) — отказ, замок не меняется", async () => {
    s.answers = [[]];
    await expect(
      core.setHome({
        account: "acc_1",
        wallet: "w",
        mapId: "m",
        place,
        cost: core.HOME_MOVE_COST,
        opId: "op_12345678",
      }),
    ).rejects.toThrow("err.op_reused");
  });
});

describe("homeMoveCost", () => {
  it("ни разу не выбирал — 0, выбирал — 2 500 золота", async () => {
    s.answers = [[]];
    expect(await core.homeMoveCost("acc_1")).toBe(0);
    s.answers = [[{ x: 1 }]];
    expect(await core.homeMoveCost("acc_1")).toBe(core.HOME_MOVE_COST);
  });
});

describe("homePlace", () => {
  it("строки нет — центральный замок", async () => {
    s.answers = [[]];
    expect(await core.homePlace("acc_1", "m")).toMatchObject({ kind: "castle", q: 10, r: 10 });
  });
  it("ратушу снесли — снова центральный замок", async () => {
    s.answers = [[{ q: 3, r: 4, kind: "town", moves: 1 }], []];
    expect(await core.homePlace("acc_1", "m")).toMatchObject({ kind: "castle" });
  });
  it("строки нет, замок стоит на ратуше (Юпленд) — основной она", async () => {
    s.answers = [[], [{ name: "Юпленд" }]];
    expect(await core.homePlace("acc_1", "m")).toEqual({
      kind: "town",
      q: 10,
      r: 10,
      name: "Юпленд",
    });
  });
  it("ратуша на месте — она", async () => {
    s.answers = [[{ q: 3, r: 4, kind: "town", moves: 1 }], [{ name: "Пристань" }]];
    expect(await core.homePlace("acc_1", "m")).toEqual({
      kind: "town",
      q: 3,
      r: 4,
      name: "Пристань",
    });
  });
});

describe("placeHere", () => {
  it("у центрального замка — замок; вплотную к ратуше — ратуша; далеко — ничего", async () => {
    expect(await core.placeHere("m", { q: 10, r: 11 })).toMatchObject({ kind: "castle" });
    s.answers = [[{ q: 3, r: 4, name: null }]];
    expect(await core.placeHere("m", { q: 3, r: 5 })).toMatchObject({
      kind: "town",
      name: "Ратуша 3,4",
    });
    s.answers = [[]];
    expect(await core.placeHere("m", { q: 30, r: 30 })).toBeNull();
    expect(await core.placeHere("m", null)).toBeNull();
  });
  it("у замка на ратуше — это ратуша: совпадает с выбранной вручную", async () => {
    s.answers = [[{ name: "Юпленд" }]];
    const here = await core.placeHere("m", { q: 10, r: 11 });
    expect(here).toEqual({ kind: "town", q: 10, r: 10, name: "Юпленд" });
    expect(core.samePlace(here, { kind: "town", q: 10, r: 10, name: "Юпленд" })).toBe(true);
  });
});
