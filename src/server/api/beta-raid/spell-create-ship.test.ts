// «Создать корабль»: спуск на воду рядом с героем и отказы с возвратом.
//
// Базы нет: карта и мост подменены заглушками. Проверяем то, из-за чего
// заклинание чинили (22.09 каст списывал 80 энергии и ничего не делал): удачный
// каст ОБЯЗАН вставить борт, а отказ — не вставлять ничего, иначе каст вернёт
// энергию за стоящий корабль.
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  pos: { q: 5, r: 5 } as { q: number; r: number } | null,
  voidHere: false,
  water: { q: 6, r: 5 } as { q: number; r: number } | null,
  insertOk: true,
  insertThrows: false,
  exists: false,
  existsThrows: false,
  sql: [] as string[],
  published: 0,
}));

vi.mock("../../db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    state.sql.push(sql);
    if (sql.includes("INSERT INTO yuplink.beta_raid_ship")) {
      if (state.insertThrows) throw new Error("bridge down");
      return state.insertOk ? [{ id: "x" }] : [];
    }
    if (sql.startsWith("SELECT id FROM yuplink.beta_raid_ship")) {
      if (state.existsThrows) throw new Error("db down");
      return state.exists ? [{ id: "x" }] : [];
    }
    return [];
  },
}));
vi.mock("../../raidLive", () => ({ publishRaid: () => void state.published++ }));
vi.mock("./owner", () => ({ raidOwner: async () => "acc_me" }));
vi.mock("./encounter-where", () => ({
  myMapId: async () => "map_1",
  ownCell: async () => state.pos,
}));
vi.mock("./ships", () => ({ freeWaterAround: async () => state.water }));
vi.mock("./voidGate", () => ({
  canIgnoreVoid: () => false,
  isVoidCellLive: async () => state.voidHere,
}));

import { createShipNearHero } from "./spell-create-ship";

const inserts = () => state.sql.filter((s) => s.includes("INSERT INTO yuplink.beta_raid_ship"));

beforeEach(() => {
  state.pos = { q: 5, r: 5 };
  state.voidHere = false;
  state.water = { q: 6, r: 5 };
  state.insertOk = true;
  state.insertThrows = false;
  state.exists = false;
  state.existsThrows = false;
  state.sql = [];
  state.published = 0;
});

describe("createShipNearHero", () => {
  it("успех: новый малый свободный борт с полным запасом хода на соседней воде", async () => {
    const res = await createShipNearHero("w.near");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.ship).toMatchObject({ q: 6, r: 5 });
    expect(res.ship?.id).toMatch(/^ship_/);
    expect(res.moved).toBeNull();
    const sql = inserts();
    expect(sql).toHaveLength(1);
    expect(sql[0]).toContain("'small', 1000");
    expect(sql[0]).toContain("'acc_me'");
    // Без экипажа: садится игрок сам.
    expect(sql[0]).not.toContain("crew_");
    expect(state.published).toBe(1);
  });

  it("корабль в клетке не мешает: вставка без условия на соседей, повтор — по id", async () => {
    await createShipNearHero("w.near");
    const sql = inserts()[0];
    expect(sql).not.toContain("NOT EXISTS");
    expect(sql).toContain("ON CONFLICT (id) DO NOTHING");
  });

  it("нет воды рядом — отказ, ничего не вставлено", async () => {
    state.water = null;
    const res = await createShipNearHero("w.near");
    expect(res).toEqual({ ok: false, reasonKey: "spell.no_water_near" });
    expect(inserts()).toHaveLength(0);
    expect(state.published).toBe(0);
  });

  it("вставка вернула 0 строк и строки нет — отказ", async () => {
    state.insertOk = false;
    const res = await createShipNearHero("w.near");
    expect(res).toEqual({ ok: false, reasonKey: "spell.no_water_near" });
    expect(state.published).toBe(0);
  });

  it("не на карте — отказ до любых запросов к воде", async () => {
    state.pos = null;
    const res = await createShipNearHero("w.near");
    expect(res).toEqual({ ok: false, reasonKey: "spell.not_on_map" });
    expect(inserts()).toHaveLength(0);
  });

  it("под глухим туманом — отказ", async () => {
    state.voidHere = true;
    const res = await createShipNearHero("w.near");
    expect(res).toEqual({ ok: false, reasonKey: "braid.void_blocked" });
    expect(inserts()).toHaveLength(0);
  });

  it("мост упал на вставке, а строка есть — это успех, а не возврат энергии", async () => {
    state.insertThrows = true;
    state.exists = true;
    const res = await createShipNearHero("w.near");
    expect(res.ok).toBe(true);
  });

  it("мост упал на вставке и строки нет — отказ, корабля даром нет", async () => {
    state.insertThrows = true;
    const res = await createShipNearHero("w.near");
    expect(res).toEqual({ ok: false, reasonKey: "spell.no_water_near" });
  });

  it("повтор моста: вставка легла, повтор упёрся в свой же борт (0 строк) — успех, не возврат", async () => {
    state.insertOk = false;
    state.exists = true;
    const res = await createShipNearHero("w.near");
    expect(res.ok).toBe(true);
    expect(state.published).toBe(1);
  });

  it("мост упал и проверить нельзя — снимаем только свою строку без экипажа и бросаем", async () => {
    state.insertThrows = true;
    state.existsThrows = true;
    await expect(createShipNearHero("w.near")).rejects.toThrow("bridge down");
    const del = state.sql.filter((s) => s.startsWith("DELETE"));
    expect(del).toHaveLength(1);
    expect(del[0]).toMatch(/WHERE id = 'ship_[^']+' AND crew_account IS NULL/);
    expect(state.published).toBe(0);
  });

  it("0 строк, а проверка по id сорвалась — не возвращаем «нет воды» молча", async () => {
    state.insertOk = false;
    state.existsThrows = true;
    await expect(createShipNearHero("w.near")).rejects.toThrow();
    expect(state.sql.some((s) => s.startsWith("DELETE"))).toBe(true);
  });
});
