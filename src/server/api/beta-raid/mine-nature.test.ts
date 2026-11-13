// Окружение лесопилки и каменоломни (§8.80): окно шахты видит число соседей и
// ставку с ним (ноль — настоящий), обход базы засчитывает «Хозяина шахт» и
// рассылает клетки; миграция minev2-80 — одно место для ставки.
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({
  sql: [] as string[],
  rows: [] as Array<Record<string, unknown>>,
  published: [] as unknown[],
  bumps: [] as Array<[string, string, number]>,
}));

vi.mock("@/server/db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    s.sql.push(sql);
    return s.rows;
  },
}));
vi.mock("@/server/raidLive", () => ({ publishRaid: (e: unknown) => s.published.push(e) }));
vi.mock("@/server/api/achievements/bump", () => ({
  bumpAchievement: (a: string, k: string, n: number) => s.bumps.push([a, k, n]),
}));

const { mineCellState } = await import("./mine-v2-read");
const { cellStateSql } = await import("./mine-v2-sql");
const { sweepMineNature } = await import("./mine-nature-sweep");

const T0 = Date.parse("2026-10-25T10:00:00Z");
const row = (p: Record<string, unknown> = {}) => ({
  cell_std: "0",
  nature_n: "0",
  level: 1,
  island: false,
  spent: false,
  resource: "wood",
  owner_account: "acc_me",
  claimed_hours: 0,
  cap: T0 - 3_600_000,
  pending: 0,
  v2_std: "0",
  v2_mode: "base",
  v2_life_left: 1,
  v2_life_at: T0 - 3_600_000,
  v2_accrue: T0 - 3_600_000,
  ...p,
});

beforeEach(() => {
  s.sql.length = 0;
  s.rows = [];
  s.published.length = 0;
  s.bumps.length = 0;
});

describe("окно шахты", () => {
  it("SQL отдаёт число соседей", () => {
    const sql = cellStateSql("m", 1, 2).replace(/\s+/g, " ");
    expect(sql).toContain("THEN c.building_config->>'natureN' END");
    expect(sql).toContain(
      "yuplink.raid_nature_share(c.map_id, c.q, c.r, c.building_config->>'resource')::text) END AS nature_n",
    );
  });

  it("доли соседей (09.11.2026): 1,3333 горы — в окне дробью, ставка — от неё", () => {
    const st = mineCellState(
      row({ resource: "stone", cell_std: "4.4444", v2_std: "4.4444", nature_n: "1.3333" }),
      T0,
      "rmap_world",
    );
    expect(st.view).toMatchObject({ nature: 1.3333, stdYield: 4.4444 });
  });

  it("лесопилка без деревьев: ставка 0, а не уровень 1; число соседей — в окне", () => {
    const st = mineCellState(row(), T0, "rmap_world");
    expect(st.view?.stdYield).toBe(0);
    expect(st.view?.nature).toBe(0);
    expect(st.live?.yield).toBe(0);
  });

  it("ничья: ставка по соседям на лету — столько даст тому, кто заберёт", () => {
    const st = mineCellState(
      row({ owner_account: null, cell_std: "10", nature_n: "6", level: 2 }),
      T0,
      "rmap_world",
    );
    expect(st.view).toMatchObject({ broken: true, stdYield: 40, nature: 6 });
  });

  it("6 деревьев на уровне 1 — 20 в час; золото — без окружения", () => {
    const st = mineCellState(
      row({ cell_std: "20", v2_std: "20", nature_n: "6" }),
      T0,
      "rmap_world",
    );
    expect(st.view).toMatchObject({ stdYield: 20, nature: 6 });
    const gold = mineCellState(
      row({ resource: "gold", cell_std: "1", v2_std: "1", nature_n: null }),
      T0,
      "rmap_world",
    );
    expect(gold.view?.nature).toBeNull();
  });
});

describe("обход окружения", () => {
  it("зовёт базу, засчитывает начисленное хозяину и рассылает клетки", async () => {
    s.rows = [
      { map_id: "m", q: 1, r: 2, owner: "acc_a", amount: "12.5" },
      { map_id: "m", q: 3, r: 4, owner: "acc_a", amount: "0" },
    ];
    await expect(sweepMineNature()).resolves.toBe(2);
    expect(s.sql[0]).toContain("FROM yuplink.raid_mine_nature_sweep(200)");
    expect(s.bumps).toEqual([["acc_a", "minelord", 12.5]]);
    expect(s.published).toEqual([{ mapId: "m", type: "built", cells: ["1,2", "3,4"] }]);
  });
});

describe("миграция minev2-80", () => {
  const sql = readFileSync("migrations/minev2-80-surroundings.sql", "utf8").replace(/\s+/g, " ");
  it("ставка = уровень × окружение; множитель n/3 только дереву и камню", () => {
    expect(sql).toContain("* yuplink.raid_mine_nature_mult(p_cfg)");
    expect(sql).toContain("WHEN p_cfg->>'resource' IN ('wood', 'stone')");
    expect(sql).toContain("THEN (p_cfg->>'natureN')::numeric / 3");
  });
  it("обход: старое — по старой ставке, сломанные — мимо, лок шахты", () => {
    expect(sql).toContain("SELECT * INTO cl FROM yuplink.raid_mine_v2_close(st, cfg)");
    expect(sql).toContain("now() < yuplink.raid_mine_break_at(s.mode, s.life_left, s.life_at)");
    expect(sql).toContain(
      "pg_try_advisory_xact_lock(hashtext('mine:'||m.mp||':'||m.mq||':'||m.mr))",
    );
    expect(sql).toContain("pg_try_advisory_xact_lock(hashtext('mine-nature-sweep'))");
  });
  it("edit_seq не поднимаем — сохранение редактора не спотыкается о рубку", () => {
    expect(sql).not.toContain("SET edit_seq");
  });
});

describe("миграция minev2-84: местность — не гора, дерево (гора) — долями на все шахты рядом", () => {
  const sql = readFileSync("migrations/minev2-84-nature-share.sql", "utf8").replace(/\s+/g, " ");
  it("местность «Горы»/«Высокогорье» больше не считается ни для добычи, ни для постановки", () => {
    expect(sql).toContain("CREATE OR REPLACE FUNCTION yuplink.raid_nature_around(");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION yuplink.raid_nature_around_yield(");
    expect(sql).not.toMatch(/tt\.name ~\*/);
  });
  it("доля: 1/k, k — шахт того же вида вокруг дерева (горы), не остров; до 4 знаков", () => {
    expect(sql).toContain("sum(1::numeric / GREATEST(1, (");
    expect(sql).toContain("AND m.building_config->>'resource' = p_res");
    expect(sql).toContain("AND NOT yuplink.raid_mine_is_island(m.building_config)");
    expect(sql).toContain("trim_scale(round(LEAST(6,");
  });
  it("ставка — natureN / 3 и для дробного; обход пишет доли, старое — по старой ставке", () => {
    expect(sql).toContain("'^[0-9]{1,2}(\\.[0-9]{1,8})?$'");
    expect(sql).toContain("THEN (p_cfg->>'natureN')::numeric / 3");
    expect(sql).toContain("n := yuplink.raid_nature_share(m.mp, m.mq, m.mr, cfg->>'resource');");
    expect(sql).toContain("SELECT * INTO cl FROM yuplink.raid_mine_v2_close(st, cfg)");
    expect(sql).toContain("pg_try_advisory_xact_lock(hashtext('mine-nature-sweep'))");
  });
});

describe("гекс-редактор не стирает окружение шахты", () => {
  it("та же постройка — natureN из базы поверх сохраняемой настройки", () => {
    const src = readFileSync("src/server/api/raid-hexmap.ts", "utf8");
    expect(src).toContain(
      "WHEN EXCLUDED.building_id IS NOT DISTINCT FROM c.building_id AND c.building_config ? 'natureN'",
    );
    expect(src).toContain("jsonb_build_object('natureN', c.building_config->'natureN')");
  });
});

describe("миграция minev2-81: для добычи камни игроков считаются, для постановки — нет", () => {
  const sql = readFileSync("migrations/minev2-81-yield-counts-placed.sql", "utf8").replace(
    /\s+/g,
    " ",
  );
  it("обход считает соседей по _yield (любая гора-декор)", () => {
    expect(sql).toContain(
      "CROSS JOIN LATERAL yuplink.raid_nature_around_yield(s.map_id, s.q, s.r) na",
    );
    expect(sql).toContain("FROM yuplink.raid_nature_around_yield(m.mp, m.mq, m.mr) na");
    expect(sql).not.toContain("yuplink.raid_nature_around(");
    expect(sql).not.toContain("planted_decor");
  });
  it("постановка шахты — по-прежнему raid_nature_around (без поставленных камней)", () => {
    const need = readFileSync("src/server/api/beta-raid/mine-place/mine-place-need-sql.ts", "utf8");
    expect(need).toContain("yuplink.raid_nature_around(");
    expect(need).not.toContain("raid_nature_around_yield");
  });
});
