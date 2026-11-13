// «Починить всё»: раскладка клеток — чинить / повтор / пропустить, цена, нехватка.
import { describe, expect, it } from "vitest";
import {
  addCost,
  BREAK_SLACK_MS,
  REPAIR_ALL_BELOW,
  planRepairAll,
  repairAllOp,
  shortOf,
  type RepairStateRow,
} from "./repair-all-plan";
import { repairAllSql, stateSql } from "./repair-all-sql";

const NOW = Date.parse("2026-11-05T12:00:00Z");
const H = 3_600_000;
const ME = "acc_me";

const row = (o: Partial<RepairStateRow> = {}): RepairStateRow => ({
  map_id: "rmap_a",
  q: 1,
  r: 1,
  owner: ME,
  mode: "base",
  life_left: 0.5,
  life_at: NOW - H,
  v2: true,
  cfg: { resource: "wood" },
  void: false,
  island_spent: false,
  done: false,
  ...o,
});

const plan = (rows: RepairStateRow[], extra: Partial<Parameters<typeof planRepairAll>[0]> = {}) =>
  planRepairAll({ rows, account: ME, seesVoid: false, now: NOW, ...extra });

describe("planRepairAll", () => {
  it("свои работающие — в починку, цена по виду (§8.59 п. 6), сумма общая", () => {
    const p = plan([
      row({ q: 1, cfg: { resource: "wood" } }),
      row({ q: 2, cfg: { resource: "stone" }, mode: "max" }),
      row({ q: 3, cfg: { resource: "gold" } }),
      row({ q: 4, cfg: { resource: "diamonds" } }),
    ]);
    expect(p.repair.map((x) => x.cost)).toEqual([
      { gold: 20 },
      { gold: 20 },
      { diamonds: 1 },
      { wood: 10_000, stone: 1_000 },
    ]);
    expect(p.total).toEqual({ gold: 40, diamonds: 1, wood: 10_000, stone: 1_000 });
    expect(p.repair[1].mode).toBe("max");
    expect(p.repair[0].lifeAt).toBe(NOW - H);
    expect(p.skipped).toEqual([]);
  });

  it("сломанная (строки владения нет) и ломающаяся прямо сейчас — пропущены", () => {
    // max — сутки; осталось меньше запаса BREAK_SLACK_MS.
    const left = (BREAK_SLACK_MS - 1000) / (24 * H);
    const p = plan([
      row({ q: 1, owner: null, mode: null, life_left: null, life_at: null }),
      row({ q: 2, mode: "max", life_left: left, life_at: NOW }),
      row({ q: 3, life_left: 0, life_at: NOW - H }),
    ]);
    expect(p.repair).toEqual([]);
    expect(p.skipped.map((x) => x.reason)).toEqual(["broken", "broken", "broken"]);
    expect(p.total).toEqual({});
  });

  it("чужая — not_owner; под куполом — void (админу — чинится)", () => {
    const rows = [row({ q: 1, owner: "acc_other" }), row({ q: 2, void: true })];
    expect(plan(rows).skipped.map((x) => x.reason)).toEqual(["not_owner", "void"]);
    const adm = plan(rows, { seesVoid: true });
    expect(adm.repair.map((x) => x.q)).toEqual([2]);
  });

  it("остров — пропуск (в «Управлении шахтами» его не чинят), и чиненный, и нет", () => {
    const cfg = { resource: "diamonds", island: true };
    const p = plan([
      row({ map_id: "isle_x", q: 1, cfg, mode: "max" }),
      row({ map_id: "isle_x", q: 2, cfg, island_spent: true }),
    ]);
    expect(p.repair).toEqual([]);
    expect(p.skipped.map((x) => x.reason)).toEqual(["island", "island"]);
  });

  it("порог ползунка: ниже 50 % — только та, что ниже", () => {
    const p = plan(
      [row({ q: 1, life_left: 0.6, life_at: NOW }), row({ q: 2, life_left: 0.3, life_at: NOW })],
      {
        below: 0.5,
      },
    );
    expect(p.repair.map((x) => x.q)).toEqual([2]);
    expect(p.skipped.map((x) => x.reason)).toEqual(["full"]);
  });

  it("90 % и больше — пропуск full; меньше 90 % — чинится", () => {
    const p = plan([
      row({ q: 1, life_left: 1, life_at: NOW }),
      row({ q: 2, life_left: 0.9, life_at: NOW }),
      row({ q: 3, life_left: 0.89, life_at: NOW }),
    ]);
    expect(REPAIR_ALL_BELOW).toBe(0.9);
    expect(p.repair.map((x) => x.q)).toEqual([3]);
    expect(p.skipped.map((x) => x.reason)).toEqual(["full", "full"]);
    expect(p.total).toEqual({ gold: 20 });
  });

  it("отметка запаса не та, что в цене, — changed (старое подтверждение не платит)", () => {
    const seen = new Map([
      ["rmap_a:1,1", NOW - H],
      ["rmap_a:2,1", NOW - 2 * H],
    ]);
    const p = plan([row({ q: 1 }), row({ q: 2 })], { seen });
    expect(p.repair.map((x) => x.q)).toEqual([1]);
    expect(p.skipped).toEqual([{ mapId: "rmap_a", q: 2, r: 1, reason: "changed" }]);
  });

  it("этот ключ уже проведён — повтор: без цены, даже если отметка и остров изменились", () => {
    const seen = new Map([["isle_x:1,1", 1]]);
    const p = plan(
      [
        row({
          map_id: "isle_x",
          done: true,
          island_spent: true,
          cfg: { resource: "wood", island: true },
        }),
      ],
      { seen },
    );
    expect(p.again).toHaveLength(1);
    expect(p.repair).toEqual([]);
    expect(p.total).toEqual({});
  });

  it("порядок — карта, q, r (локи шахт у всех пачек в одном порядке)", () => {
    const p = plan([row({ map_id: "rmap_b", q: 0 }), row({ q: 5, r: 2 }), row({ q: 5, r: -1 })]);
    expect(p.repair.map((x) => `${x.mapId}:${x.q},${x.r}`)).toEqual([
      "rmap_a:5,-1",
      "rmap_a:5,2",
      "rmap_b:0,1",
    ]);
  });
});

describe("цена и нехватка", () => {
  it("addCost складывает, нули не пишет", () => {
    expect(addCost({ gold: 20 }, { gold: 20, wood: 0 })).toEqual({ gold: 40 });
  });

  it("shortOf — сколько не хватает; хватает — пусто", () => {
    const have = new Map([
      ["gold", 30.7],
      ["diamonds", 5],
    ]);
    expect(shortOf({ gold: 40, diamonds: 1, wood: 100 }, have)).toEqual({ gold: 10, wood: 100 });
    expect(shortOf({ gold: 30 }, have)).toEqual({});
  });
});

describe("запросы", () => {
  it("ключ клетки — аккаунт + клетка + показанная отметка запаса (без ключа нажатия)", () => {
    expect(repairAllOp("acc_me", { mapId: "rmap_a", q: -1, r: 2 }, 1793807679609)).toBe(
      "rep:acc_me:all:rmap_a:-1,2:1793807679609",
    );
  });

  it("состояние: без ключа — NULL, кавычки экранированы, флаг острова — как у базы", () => {
    const sql = stateSql([
      { mapId: "a'b", q: 1, r: 2, op: null },
      { mapId: "m", q: 3, r: 4, op: "o'p" },
    ]);
    expect(sql).toContain("('a''b'::text, 1::int, 2::int, NULL::text)");
    expect(sql).toContain("'o''p'::text");
    expect(sql).toContain("FROM yuplink.raid_mine_op o WHERE o.op = v.op");
    expect(sql).toContain("yuplink.raid_mine_is_island(c.building_config) AS island_flag");
  });

  it("починка — одна функция базы на всю пачку, клетки одним jsonb", () => {
    const p = plan([row({ q: 1 }), row({ map_id: "x'y", q: 2, cfg: { resource: "gold" } })]);
    const items = p.repair.map((x) => ({ ...x, seen: x.lifeAt, op: repairAllOp(ME, x, x.lifeAt) }));
    const sql = repairAllSql({ account: ME, wallet: "me.near", items }).replace(/\s+/g, " ");
    expect(sql).toContain("FROM yuplink.raid_mine_repair_all('acc_me', 'me.near',");
    expect(sql).toContain(`"map":"rmap_a","q":1,"r":1,"seen":${NOW - H},"cost":{"gold":20}`);
    expect(sql).toContain(`"map":"x''y"`);
    expect(sql).toContain(`"cost":{"diamonds":1}`);
  });
});

describe("флаг острова — как у базы", () => {
  it('база считает остров (строка "true") — пропуск как остров', () => {
    const p = plan([row({ q: 1, cfg: { resource: "wood", island: "true" }, island_flag: true })]);
    expect(p.repair).toEqual([]);
    expect(p.skipped.map((x) => x.reason)).toEqual(["island"]);
  });
});
