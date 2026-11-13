// Шахты v2 (§8.59): SQL-куски для читателей, вызовы функций базы и разбор
// состояния клетки (владелец, поломка, подстановка для живого расчёта).
import { describe, expect, it } from "vitest";
import {
  breakDueSql,
  brokenSql,
  cellStateSql,
  dueCellsSql,
  mineClockSql,
  repairSql,
  setModeSql,
  v2ColsSql,
  v2StdSql,
} from "./mine-v2-sql";
import { mineCellState, mineV2ErrorKey, type MineCellRow } from "./mine-v2-read";

const flat = (s: string) => s.replace(/\s+/g, " ").trim();
const H = 3_600_000;
const T0 = Date.UTC(2026, 9, 20, 10, 0, 0);

describe("куски для читателей", () => {
  it("v2 — вид клетки v2 и строка переведена (accrue_from задан)", () => {
    expect(v2StdSql("s", "c.building_config")).toBe(
      "CASE WHEN s.accrue_from IS NOT NULL THEN yuplink.raid_mine_v2_std(c.building_config) END",
    );
    expect(flat(brokenSql("m", "c.building_config"))).toBe(
      "(m.accrue_from IS NOT NULL AND yuplink.raid_mine_v2_std(c.building_config) IS NOT NULL" +
        " AND yuplink.raid_mine_break_at(m.mode, m.life_left, m.life_at) <= now())",
    );
    const cols = flat(v2ColsSql("s", "c.cfg"));
    expect(cols).toContain("AS v2_std, s.mode AS v2_mode, s.life_left AS v2_life_left");
    expect(cols).toContain("extract(epoch from s.life_at) * 1000 AS v2_life_at");
    expect(cols).toContain("extract(epoch from s.accrue_from) * 1000 AS v2_accrue");
  });

  it("клетка: строка владения LEFT JOIN — ничья тоже отвечает", () => {
    const sql = flat(cellStateSql("rmap_'x", 3, -4));
    expect(sql).toContain("yuplink.raid_mine_v2_std(c.building_config) AS cell_std");
    expect(sql).toContain("LEFT JOIN yuplink.raid_mine_state s");
    expect(sql).toContain("yuplink.raid_mine_pending(c.map_id, c.q, c.r) AS pending");
    expect(sql).toContain("c.map_id = 'rmap_''x' AND c.q = 3 AND c.r = -4");
  });

  it("секундомер — от начала отрезка, как считают старые ветки сбора; нет — захват", () => {
    expect(mineClockSql("s")).toBe(
      "extract(epoch from COALESCE(s.accrue_from, s.captured_at)) * 1000",
    );
    expect(flat(cellStateSql("m", 0, 0))).toContain(
      "extract(epoch from COALESCE(s.accrue_from, s.captured_at)) * 1000 AS cap",
    );
  });
});

describe("вызовы функций базы", () => {
  it("починка: цена — JSON сервера, ключ повтора как есть", () => {
    const sql = flat(
      repairSql({
        mapId: "m",
        q: 1,
        r: 2,
        account: "acc",
        wallet: "w.near",
        mode: "mid",
        cost: { wood: 10_000, stone: 1_000 },
        op: "rep:acc:op1",
      }),
    );
    expect(sql).toContain(
      "yuplink.raid_mine_repair('m', 1, 2, 'acc', 'w.near', 'mid', '{\"wood\":10000,\"stone\":1000}'::jsonb, 'rep:acc:op1')",
    );
    // Начисленное добычи и кому — для ачивки «Хозяин шахт».
    expect(sql).toContain("SELECT x.captured, x.applied, x.credited, x.credited_to");
  });

  it("режим: сменили ли и сколько начислено", () => {
    expect(flat(setModeSql({ mapId: "m", q: -1, r: 0, account: "acc", mode: "max" }))).toBe(
      "SELECT x.changed, x.credited FROM yuplink.raid_mine_set_mode('m', -1, 0, 'acc', 'max') x;",
    );
  });

  it("обход: список с запасом вперёд, по порядку поломок, тот же предел", () => {
    const sql = flat(dueCellsSql(100, 10));
    expect(sql).toContain("s.accrue_from IS NOT NULL");
    expect(sql).toContain(
      "yuplink.raid_mine_break_at(s.mode, s.life_left, s.life_at) <= now() + interval '10 seconds'",
    );
    expect(sql).toContain("ORDER BY yuplink.raid_mine_break_at(s.mode, s.life_left, s.life_at)");
    expect(sql).toContain("LIMIT 100;");
    // Строка на каждую сломанную: хозяин и начисленное ему.
    expect(flat(breakDueSql(100))).toBe(
      "SELECT b.b_owner AS owner, b.b_amount AS amount FROM yuplink.raid_mine_break_due(100) b;",
    );
    expect(breakDueSql(-5)).toContain("yuplink.raid_mine_break_due(0) b;");
  });
});

const row = (o: Partial<MineCellRow>): MineCellRow => ({
  cell_std: 10,
  resource: "wood",
  owner_account: "acc",
  claimed_hours: 1,
  cap: T0 - 50 * H,
  pending: 20,
  v2_std: 10,
  v2_mode: "mid",
  v2_life_left: 1,
  v2_life_at: T0,
  v2_accrue: T0,
  ...o,
});

describe("состояние клетки", () => {
  it("работающая v2: секундомер — начало отрезка, выход — стандарт × режим", () => {
    const st = mineCellState(row({}), T0 + 3 * H);
    expect(st.owner).toBe("acc");
    expect(st.capturedAt).toBe(T0);
    expect(st.pending).toBe(20);
    expect(st.live).toEqual({ yield: 20, maxHours: 72 });
    expect(st.view).toMatchObject({
      mode: "mid",
      lifeLeft: 1,
      breakAt: T0 + 72 * H,
      broken: false,
      stdYield: 10,
      mult: 2,
      repairCost: { gold: 20 },
    });
  });

  it("сломанная v2 до уборки — ничья, накопленного в окне нет", () => {
    const st = mineCellState(row({}), T0 + 80 * H);
    expect(st.owner).toBeNull();
    expect(st.pending).toBe(0);
    expect(st.view?.broken).toBe(true);
  });

  it("ничья v2 (строки нет) — сломана, починка по цене вида", () => {
    const st = mineCellState(
      row({
        resource: "diamonds",
        cell_std: 1,
        owner_account: null,
        v2_std: null,
        v2_accrue: null,
      }),
      T0,
    );
    expect(st.owner).toBeNull();
    expect(st.view).toMatchObject({
      broken: true,
      lifeLeft: 0,
      mode: "base",
      repairCost: { wood: 10_000, stone: 1_000 },
    });
    expect(st.live).toBeNull();
  });

  it("строка ещё не переведена и шахты старого образца — по-старому", () => {
    const old = mineCellState(row({ v2_accrue: null, v2_std: null }), T0);
    expect(old.view).toBeNull();
    expect(old.capturedAt).toBe(T0 - 50 * H);
    const darai = mineCellState(row({ cell_std: null, resource: "token", v2_std: null }), T0);
    expect(darai.view).toBeNull();
    expect(darai.owner).toBe("acc");
    expect(mineCellState(undefined).owner).toBeNull();
  });
});

describe("отказы базы → ключи словаря", () => {
  it("известные коды, остальное как есть", () => {
    expect(mineV2ErrorKey("MCP error: mine_broken")).toBe("braid.mine_broken");
    expect(mineV2ErrorKey("mine_owned")).toBe("braid.mine_owned");
    expect(mineV2ErrorKey("x mine_not_owner")).toBe("braid.mine_not_owner");
    expect(mineV2ErrorKey("mine_not_v2")).toBe("braid.mine_not_v2");
    expect(mineV2ErrorKey("res_move: в минус")).toBe("braid.mine_repair_no_res");
    expect(mineV2ErrorKey("что-то иное")).toBe("что-то иное");
  });
});
