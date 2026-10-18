// «Сначала бой, потом мешочек» (владелец, 29.09): живой объект на клетке
// мешочка закрывает любые действия с ним — и окно, и забор, и лопату.
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  row: null as Record<string, unknown> | null,
  sql: "",
  pos: { q: 5, r: 5 },
}));

vi.mock("@/server/db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    state.sql = sql;
    return state.row ? [state.row] : [];
  },
}));
vi.mock("@/server/rateGate", () => ({ actionGate: async () => {} }));
vi.mock("@/server/api/currency/move", () => ({ accAccountId: async () => "acc_1" }));
vi.mock("@/server/api/beta-raid/gate", () => ({ requireBetaRaid: async () => "w.near" }));
vi.mock("@/server/api/beta-raid/encounter-where", () => ({
  myMapId: async () => "map_1",
  ownCell: async () => state.pos,
}));
vi.mock("@/server/api/beta-raid/voidGate", () => ({ requireNotVoid: async () => {} }));

import { bagNear, blockedAt } from "./bag-actor";

const actor = { wallet: "w.near", mapId: "map_1", account: "acc_1" };

beforeEach(() => {
  state.row = { id: "lb_1", q: 5, r: 6, buried: false, alive: true, guarded: false };
  state.pos = { q: 5, r: 5 };
});

describe("bagNear", () => {
  it("живой объект на клетке — bag.guarded, сначала бой", async () => {
    state.row = { ...state.row, guarded: true };
    await expect(bagNear(actor, "lb_1")).rejects.toThrow("bag.guarded");
  });

  it("объект повержен или его нет — мешочек доступен", async () => {
    await expect(bagNear(actor, "lb_1")).resolves.toMatchObject({ id: "lb_1", q: 5, r: 6 });
  });

  it("живость объекта считается по той же записи гибели, что у карты (cycle 0)", async () => {
    await bagNear(actor, "lb_1");
    const sql = state.sql.replace(/\s+/g, " ");
    expect(sql).toContain("c.object_id IS NOT NULL");
    expect(sql).toContain("h.cycle_no = 0 AND (h.killed_at IS NOT NULL OR h.current_hp <= 0)");
    expect(sql).toContain("AS guarded");
  });

  it("декор вырос поверх — bag.decor (сначала рубка); срубили — доступно", async () => {
    state.row = { ...state.row, decor: true };
    await expect(bagNear(actor, "lb_1")).rejects.toThrow("bag.decor");
    expect(state.sql.replace(/\s+/g, " ")).toContain("AND c.decoration_id IS NOT NULL) AS decor");
    state.row = { ...state.row, decor: false };
    await expect(bagNear(actor, "lb_1")).resolves.toMatchObject({ id: "lb_1" });
  });

  it("клетка окна и бугорка: объект — бой, декор — рубка, свободно — null", async () => {
    state.row = { guarded: true, decor: true };
    await expect(blockedAt("map_1", 5, 6)).resolves.toBe("bag.guarded");
    state.row = { guarded: false, decor: true };
    await expect(blockedAt("map_1", 5, 6)).resolves.toBe("bag.decor");
    state.row = { guarded: false, decor: false };
    await expect(blockedAt("map_1", 5, 6)).resolves.toBeNull();
  });

  it("сгоревший мешочек — bag.gone раньше, чем проверка боя", async () => {
    state.row = { ...state.row, alive: false, guarded: true };
    await expect(bagNear(actor, "lb_1")).rejects.toThrow("bag.gone");
  });
});
