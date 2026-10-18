// Общее ядро снятия с грядки (рядом — без отдыха, издалека — с отдыхом): снимает
// CAS-ом под замком поля, дробный хвост выдаёт только тот, кто снял.
import { beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({
  heroId: "hero_w" as string | null,
  accrued: 0.4,
  sql: [] as string[],
  dust: 0,
  /** Метка, с которой хвост лёг на склад (stack-origin). */
  origin: null as unknown,
  /** Повтор моста после коммита: снятие уже прошло, в журнале свой ключ. */
  retried: false,
  settleThrows: false,
}));

vi.mock("../../db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    s.sql.push(sql);
    if (sql.includes("raid_field_settle") && s.settleThrows) throw new Error("MCP POST 502");
    if (!sql.includes("SET hero_id = NULL")) return [];
    if (s.retried) return [{ removed: 0, accrued: null, prior: s.accrued }];
    const want = /w\.hero_id = '([^']+)'/.exec(sql)?.[1] ?? null;
    const hit = s.heroId !== null && (want === null || s.heroId === want);
    if (!hit) return [{ removed: 0, accrued: null, prior: null }];
    s.heroId = null;
    return [{ removed: 1, accrued: s.accrued, prior: null }];
  },
}));
vi.mock("./field-settle", () => ({ WAREHOUSE_RADIUS: 3 }));
vi.mock("./field-reward", () => ({ giveFieldReward: async () => {} }));
vi.mock("./item-alias", () => ({ canonRef: async (_k: string, id: string) => id }));
vi.mock("./warehouse-store", () => ({
  nearestWarehouse: async () => ({ q: 31, r: 90 }),
  creditItemToWarehouse: async (o: { units: number; origin?: unknown }) => {
    s.dust += o.units;
    s.origin = o.origin;
    return { failed: 0, rejected: 0 };
  },
}));

import { leaveFieldWork } from "./field-leave";

const cfg = {
  reward: { kind: "item" as const, itemId: "cst_apple", name: "Яблоко", image: null },
  yield: 2,
  rarities: [],
  levelMode: "any" as const,
  levelFrom: 1,
  levelTo: 100,
  maxHeroes: 0,
};
const base = { wallet: "w", account: "acc_me", mapId: "rmap_a", q: 30, r: -90, cfg };
const cas = () => s.sql.find((x) => x.includes("SET hero_id = NULL")) ?? "";

beforeEach(() => {
  s.heroId = "hero_w";
  s.accrued = 0.4;
  s.sql = [];
  s.dust = 0;
  s.origin = null;
  s.retried = s.settleThrows = false;
});

describe("leaveFieldWork", () => {
  it("снятие рядом: любой свой герой, под замком поля, хвост — одной единицей", async () => {
    const res = await leaveFieldWork({ ...base, heroId: null, key: null });
    expect(res).toEqual({ removed: true, dust: 1 });
    expect(cas()).toContain("w.hero_id IS NOT NULL");
    expect(cas()).toContain("hashtext('field:rmap_a:30:-90')");
    expect(s.dust).toBe(1);
    // Хвост — тоже урожай: на склад с меткой грядки (ПРАВИЛА §8.18).
    expect(s.origin).toBe("field");
    expect(s.sql.some((x) => x.includes("SET accrued=0"))).toBe(true);
  });

  it("снятие издалека — только этот герой, ключ снятия в журнал поля", async () => {
    await leaveFieldWork({ ...base, heroId: "hero_w", key: "rcl:op1" });
    expect(cas()).toContain("w.hero_id = 'hero_w'");
    expect(cas()).toContain("SELECT 'lv:rcl:op1', accrued FROM up");
  });

  it("снятие с отдыхом: отдых тем же оператором, только за снятие, срок не укорачивается", async () => {
    await leaveFieldWork({ ...base, heroId: "hero_w", key: "rcl:op1", restMs: 10_800_000 });
    const sql = cas();
    expect(sql).toContain("rest AS (");
    expect(sql).toContain("WHERE h.id = 'hero_w' AND EXISTS (SELECT 1 FROM up)");
    expect(sql).toContain("interval '10800000 milliseconds'");
    expect(sql).toContain("GREATEST(COALESCE(h.rest_until, now())");
    // Отдыхающий перестаёт быть основным — тем же оператором.
    expect(sql).toContain("selected_at = NULL");
  });

  it("без отдыха (рядом, без героя или без срока) — оператор не трогает героя", async () => {
    await leaveFieldWork({ ...base, heroId: null, key: null, restMs: 10_800_000 });
    expect(cas()).not.toContain("rest_until");
    s.sql = [];
    s.heroId = "hero_w";
    await leaveFieldWork({ ...base, heroId: "hero_w", key: "rcl:op2" });
    expect(cas()).not.toContain("rest_until");
  });

  it("целые единицы хвостом не выдаются — их увезёт сеттл на склад", async () => {
    s.accrued = 1.7;
    const res = await leaveFieldWork({ ...base, heroId: null, key: null });
    expect(res).toEqual({ removed: true, dust: 0 });
    expect(s.dust).toBe(0);
  });

  it("героя уже сняли — снимать некого, хвост второй раз не выдаётся", async () => {
    s.heroId = null;
    const res = await leaveFieldWork({ ...base, heroId: null, key: null });
    expect(res).toEqual({ removed: false, dust: 0 });
    expect(s.dust).toBe(0);
  });

  it("свой повтор моста узнаётся по ключу в журнале — снято, хвост выдан", async () => {
    s.retried = true;
    const res = await leaveFieldWork({ ...base, heroId: null, key: null });
    expect(res).toEqual({ removed: true, dust: 1 });
  });

  it("сеттл сорвался — не снимаем: иначе накопленное ушло бы соседям", async () => {
    s.settleThrows = true;
    await expect(leaveFieldWork({ ...base, heroId: null, key: null })).rejects.toThrow();
    expect(cas()).toBe("");
    expect(s.heroId).toBe("hero_w");
  });

  it("поле без конфига — героя всё равно отпускаем, без хвоста", async () => {
    const res = await leaveFieldWork({ ...base, cfg: null, heroId: "hero_w", key: "rcl:op2" });
    expect(res).toEqual({ removed: true, dust: 0 });
  });
});
