// «Ремонт корабля»: чинит до полного своё судно или разбитое рядом; нечего
// чинить — отказ (каст вернёт энергию); повтор моста не превращается в отказ.
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  pos: { q: 5, r: 5 } as { q: number; r: number } | null,
  target: { id: "ship_a", q: 6, r: 5, kind: "small" } as {
    id: string;
    q: number;
    r: number;
    kind: string;
  } | null,
  updated: true,
  updateThrows: false,
  publishThrows: false,
  sql: [] as string[],
  published: 0,
}));

vi.mock("../../db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    state.sql.push(sql);
    if (sql.includes("SELECT s.id")) return state.target ? [state.target] : [];
    if (sql.includes("UPDATE yuplink.beta_raid_ship")) {
      if (state.updateThrows) throw new Error("db down");
      return state.updated ? [{ id: state.target?.id }] : [];
    }
    return [];
  },
}));
vi.mock("../../raidLive", () => ({
  publishRaid: () => {
    if (state.publishThrows) throw new Error("bus down");
    state.published++;
  },
}));
vi.mock("./owner", () => ({ raidOwner: async () => "acc_me" }));
vi.mock("./encounter-where", () => ({
  myMapId: async () => "map_1",
  ownCell: async () => state.pos,
}));

import { repairShipNearHero } from "./spell-repair-ship";

const updates = () => state.sql.filter((s) => s.includes("UPDATE yuplink.beta_raid_ship"));

beforeEach(() => {
  state.pos = { q: 5, r: 5 };
  state.target = { id: "ship_a", q: 6, r: 5, kind: "small" };
  state.updated = true;
  state.updateThrows = false;
  state.publishThrows = false;
  state.sql = [];
  state.published = 0;
});

describe("repairShipNearHero", () => {
  it("чинит малый до 1000 и снимает штамп разбитого", async () => {
    const res = await repairShipNearHero("w.near");
    expect(res).toMatchObject({ ok: true, ship: { id: "ship_a", q: 6, r: 5 } });
    expect(updates()[0]).toContain("hp = 1000, hp_zero_at = NULL");
    expect(state.published).toBe(1);
  });

  it("большой — до 2000", async () => {
    state.target = { id: "ship_b", q: 5, r: 5, kind: "big" };
    await repairShipNearHero("w.near");
    expect(updates()[0]).toContain("hp = 2000");
  });

  it("своё судно первым, чужое занятое не трогаем, целые не берём", async () => {
    await repairShipNearHero("w.near");
    const sel = state.sql.find((s) => s.includes("SELECT s.id")) ?? "";
    expect(sel).toContain("ORDER BY COALESCE(s.crew_account = 'acc_me', false) DESC");
    expect(sel).toContain("s.crew_account IS NULL AND (s.q, s.r) IN ((5, 5),");
    expect(sel).toMatch(/s\.hp < \(CASE/);
  });

  it("ключ «своё первым» не бывает NULL: свободный обломок не обгоняет своё судно", async () => {
    // В Postgres `ORDER BY (crew = 'acc') DESC` ставит NULL (crew свободного
    // борта) ПЕРВЫМ — так на проде капитан большого судна 1256/2000 получил бы
    // починку чужого обломка с hp −1095 из своей же клетки.
    await repairShipNearHero("w.near");
    const sel = state.sql.find((s) => s.includes("SELECT s.id")) ?? "";
    const order = /ORDER BY\s+(.+?)\s+DESC/.exec(sel)?.[1] ?? "";
    expect(order).toMatch(/^COALESCE\(.+, false\)$/);
  });

  it("нечего чинить — отказ без записи", async () => {
    state.target = null;
    const res = await repairShipNearHero("w.near");
    expect(res).toEqual({ ok: false, reasonKey: "spell.no_ship_to_repair" });
    expect(updates()).toHaveLength(0);
  });

  it("не на карте — отказ", async () => {
    state.pos = null;
    const res = await repairShipNearHero("w.near");
    expect(res).toEqual({ ok: false, reasonKey: "spell.not_on_map" });
  });

  it("запись идемпотентна: условие только по id (повтор моста не даёт «0 строк»)", async () => {
    await repairShipNearHero("w.near");
    // Плюс «не подбит»: повтор после удачной записи строку всё равно находит (штампа нет).
    expect(updates()[0]).toMatch(/WHERE id = 'ship_a' AND blasted_at IS NULL\s+RETURNING id/);
  });

  it("судно убрали между выбором и записью — отказ", async () => {
    state.updated = false;
    const res = await repairShipNearHero("w.near");
    expect(res).toEqual({ ok: false, reasonKey: "spell.no_ship_to_repair" });
    expect(state.published).toBe(0);
  });

  it("запись упала — бросает (каст вернёт энергию), о починке никому не объявлено", async () => {
    state.updateThrows = true;
    await expect(repairShipNearHero("w.near")).rejects.toThrow("db down");
    expect(state.published).toBe(0);
  });

  it("после записи сорвалась публикация — каст всё равно состоялся", async () => {
    state.publishThrows = true;
    const res = await repairShipNearHero("w.near");
    expect(res).toMatchObject({ ok: true, ship: { id: "ship_a" } });
  });

  it("выбор только по карте героя", async () => {
    await repairShipNearHero("w.near");
    const sel = state.sql.find((s) => s.includes("SELECT s.id")) ?? "";
    expect(sel).toContain("s.map_id = 'map_1'");
  });
});
