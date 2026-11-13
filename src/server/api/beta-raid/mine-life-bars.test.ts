// Полосы шахт v2 с сервера: все шахты v2 этажа (чьи бы ни были), ничья —
// пустая, строка старого образца — без полосы, ответ — одна строка + часы.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({ sql: [] as string[], rows: [] as unknown[], admin: false }));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    handler: (h: unknown) => h,
    inputValidator: (v: (d: unknown) => unknown) => ({
      handler: (h: (a: { data: unknown }) => unknown) => (a?: { data?: unknown }) =>
        h({ data: v(a?.data) }),
    }),
  }),
}));
vi.mock("./voidGate", () => ({ canIgnoreVoid: () => s.admin }));
vi.mock("./gate", () => ({ requireBetaRaid: async () => "me.near" }));
vi.mock("./encounter-where", () => ({ myMapId: async () => "rmap_x" }));
vi.mock("./owner", () => ({ raidOwner: async () => "acc_me" }));
vi.mock("../../db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    s.sql.push(sql);
    return s.rows;
  },
}));

import { getMineLifeBars, mineLifeInput, mineLifeRows, mineLifeSql } from "./mine-life-bars";
import { decodeMineLife } from "@/lib/mineLifeBars";

const NOW = Date.parse("2026-10-21T12:00:00Z");
const H = 3_600_000;

const PLAYER = { all: false, seesVoid: false, account: "acc_me" };
const ADMIN = { all: false, seesVoid: true, account: "acc_adm" };
const GOD = { all: true, seesVoid: true, account: "acc_adm" };

const call = getMineLifeBars as unknown as (a?: {
  data: { god: boolean };
}) => Promise<{ bars: string; serverNow: number }>;

beforeEach(() => {
  s.sql = [];
  s.rows = [];
  s.admin = false;
  vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
});
afterEach(() => vi.useRealTimers());

describe("mineLifeSql", () => {
  it("этаж игрока, только шахты v2, ничьи тоже (LEFT JOIN строки владения)", () => {
    const sql = mineLifeSql("rmap_x", PLAYER).replace(/\s+/g, " ");
    expect(sql).toContain("c.map_id = 'rmap_x'");
    expect(sql).toContain("yuplink.raid_mine_v2_std(c.building_config) IS NOT NULL");
    expect(sql).toContain("LEFT JOIN yuplink.raid_mine_state s");
    expect(sql).toContain("t.name ILIKE '%шахт%'");
  });

  it("кавычка в id карты не ломает запрос", () => {
    expect(mineLifeSql("a'b", PLAYER)).toContain("'a''b'");
  });
});

describe("mineLifeRows", () => {
  it("строка старого образца (нет accrue_from) — без полосы; ничья — пустая", () => {
    const rows = mineLifeRows([
      { q: 1, r: 1, owned: true, v2: false, mode: "base", life_left: 1, life_at: NOW },
      { q: 2, r: 2, owned: false, v2: false, mode: null, life_left: null, life_at: null },
      { q: 3, r: 3, owned: true, v2: true, mode: "max", life_left: "0.5", life_at: String(NOW) },
    ]);
    expect(rows).toEqual([
      { q: 2, r: 2, life: null, level: 1 },
      { q: 3, r: 3, life: { mode: "max", lifeLeft: 0.5, lifeAt: NOW }, level: 1 },
    ]);
  });
});

describe("ничья после поломки и ничья с рождения", () => {
  it("признак — последняя запись журнала потерь клетки, только у ничьей", () => {
    const sql = mineLifeSql("rmap_x", PLAYER).replace(/\s+/g, " ");
    expect(sql).toContain("CASE WHEN s.map_id IS NULL THEN (");
    expect(sql).toContain(
      "SELECT l.kind IN ('break', 'capture') FROM yuplink.raid_mine_capture_log l",
    );
    expect(sql).toContain("ORDER BY l.seized_at DESC LIMIT 1) END AS wrecked");
  });

  it("сломалась — «q,r,lvl,w»; ничья с рождения или без записей — «q,r,lvl»; у рабочей признак не едет", async () => {
    s.rows = [
      {
        q: 1,
        r: 1,
        owned: false,
        v2: false,
        mode: null,
        life_left: null,
        life_at: null,
        wrecked: true,
      },
      {
        q: 2,
        r: 2,
        owned: false,
        v2: false,
        mode: null,
        life_left: null,
        life_at: null,
        wrecked: false,
      },
      {
        q: 3,
        r: 3,
        owned: false,
        v2: false,
        mode: null,
        life_left: null,
        life_at: null,
        wrecked: null,
      },
      {
        q: 4,
        r: 4,
        owned: true,
        v2: true,
        mode: "base",
        life_left: 1,
        life_at: NOW,
        wrecked: true,
      },
    ];
    expect((await call()).bars).toBe("1,1,1,w;2,2,1;3,3,1;4,4,0,1,0,1");
  });
});

describe("getMineLifeBars", () => {
  it("одна строка на все шахты и часы сервера; клиент читает её обратно", async () => {
    s.rows = [
      {
        q: 5,
        r: -2,
        owned: true,
        v2: true,
        mode: "mid",
        life_left: 0.75,
        life_at: NOW - 3 * H,
        lvl: 2,
      },
      { q: 6, r: 0, owned: false, v2: false, mode: null, life_left: null, life_at: null, lvl: 0 },
    ];
    const res = await call();
    expect(res).toEqual({ bars: "5,-2,1,0.75,10800,2;6,0,0", serverNow: NOW });
    expect(s.sql).toHaveLength(1);
    const { bars } = decodeMineLife(res);
    expect(bars.get("5,-2")).toEqual({ left: 0.75, at: NOW - 3 * H, span: 72 * H, lvl: 2 });
    expect(bars.get("6,0")?.left).toBe(0);
  });

  it("пустой ответ базы — пустая строка", async () => {
    s.rows = null as unknown as unknown[];
    expect(await call()).toEqual({ bars: "", serverNow: NOW });
  });

  it("под куполом игроку полос не отдаём, админу — да", () => {
    expect(mineLifeSql("rmap_1", PLAYER)).toContain("AND NOT COALESCE(c.void_fog, false)");
    expect(mineLifeSql("rmap_1", ADMIN)).not.toContain("void_fog");
  });
});

describe("чужие — только во «втором обзоре» (04.11.2026)", () => {
  it("игроку: свои с любого расстояния ИЛИ чужие в круге 20 на разведанном", () => {
    const sql = mineLifeSql("rmap_1", PLAYER).replace(/\s+/g, " ");
    expect(sql).toContain(
      "AND (s.owner_account = 'acc_me' OR (EXISTS (SELECT 1 FROM yuplink.beta_raid_positions p",
    );
    expect(sql).toContain(
      "WHERE p.account_id = 'acc_me' AND (p.map_id IS NULL OR p.map_id = 'rmap_1')",
    );
    // Круг «второго обзора»: 20, под биноклем 40 (lib/raid/sight, 08.11).
    expect(sql).toContain(
      "+ abs(c.q + c.r - p.q - p.r)) / 2 <= (CASE WHEN EXISTS (SELECT 1 FROM yuplink.beta_raid_player_effects se WHERE se.account_id = 'acc_me' AND se.kind = 'sight' AND se.kind NOT LIKE 'buff_%' AND se.expires_at > now()) THEN 40 ELSE 20 END)",
    );
    expect(sql).toContain(
      "f.owner = 'acc_me' AND f.map_id = 'rmap_1' AND f.cell = c.q || ',' || c.r",
    );
  });

  it("админу в режиме бога — все шахты, без круга", () => {
    const sql = mineLifeSql("rmap_1", GOD);
    expect(sql).not.toContain("beta_raid_positions");
    expect(sql).not.toContain("owner_account =");
  });

  it("админу без режима бога — круг, как игроку (купол виден, как раньше)", () => {
    const sql = mineLifeSql("rmap_1", ADMIN);
    expect(sql).toContain("beta_raid_positions");
    expect(sql).toContain("s.owner_account = 'acc_adm'");
    expect(sql).not.toContain("void_fog");
  });

  it("режим бога: все шахты только админу; игроку god не помогает", async () => {
    s.admin = true;
    await call({ data: { god: true } });
    expect(s.sql[0]).not.toContain("beta_raid_positions");
    await call({ data: { god: false } });
    expect(s.sql[1]).toContain("beta_raid_positions");
    await call();
    expect(s.sql[2]).toContain("beta_raid_positions");
    s.admin = false;
    await call({ data: { god: true } });
    expect(s.sql[3]).toContain("beta_raid_positions");
    expect(s.sql[3]).toContain("void_fog");
  });

  it("вход: god — только настоящий true", () => {
    expect(mineLifeInput({ god: true })).toEqual({ god: true });
    expect(mineLifeInput({ god: "true" })).toEqual({ god: false });
    expect(mineLifeInput(null)).toEqual({ god: false });
    expect(mineLifeInput(undefined)).toEqual({ god: false });
  });

  it("запрос строится от аккаунта игрока (raidOwner), не от кошелька", async () => {
    await call();
    expect(s.sql[0]).toContain("s.owner_account = 'acc_me'");
    expect(s.sql[0]).not.toContain("me.near");
  });
});
