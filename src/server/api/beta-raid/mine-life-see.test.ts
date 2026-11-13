// Запас чужой шахты — только во «втором обзоре» героя (владелец, 04.11.2026).
import { beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({ sql: [] as string[], rows: [] as unknown[], admin: false }));

vi.mock("@/server/db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    s.sql.push(sql);
    return s.rows;
  },
}));
vi.mock("./voidGate", () => ({ canIgnoreVoid: () => s.admin }));
vi.mock("./owner", () => ({ raidOwner: async () => "acc_me" }));

import { MINE_HP_SEE, hideMineLife, inSightSql, mineHpInSight } from "./mine-life-see";
import { FOG_ACTIVE_RADIUS } from "@/lib/raid/fogRadius";
import { mineBrokenNow, mineServerNow } from "@/lib/mineV2Clock";
import type { MineV2Stamped } from "@/lib/mineV2Clock";

beforeEach(() => {
  s.sql = [];
  s.rows = [];
  s.admin = false;
});

describe("круг", () => {
  it("тот же, что у мешочков: активная зона тумана, 20 клеток", () => {
    expect(MINE_HP_SEE).toBe(FOG_ACTIVE_RADIUS);
    expect(MINE_HP_SEE).toBe(20);
  });

  it("позиция героя по аккаунту на этой карте, гекс-расстояние, разведанное им", () => {
    const sql = inSightSql("c", "acc_me", "rmap_1").replace(/\s+/g, " ");
    expect(sql).toContain("p.account_id = 'acc_me' AND (p.map_id IS NULL OR p.map_id = 'rmap_1')");
    expect(sql).toContain(
      // Круг «второго обзора»: 20, под биноклем 40 (lib/raid/sight, 08.11).
      "(abs(c.q - p.q) + abs(c.r - p.r) + abs(c.q + c.r - p.q - p.r)) / 2 <= " +
        "(CASE WHEN EXISTS (SELECT 1 FROM yuplink.beta_raid_player_effects se WHERE se.account_id = 'acc_me' AND se.kind = 'sight' AND se.kind NOT LIKE 'buff_%' AND se.expires_at > now()) THEN 40 ELSE 20 END)",
    );
    expect(sql).toContain(
      "f.owner = 'acc_me' AND f.map_id = 'rmap_1' AND f.cell = c.q || ',' || c.r",
    );
  });

  it("кавычки в аккаунте и карте не ломают запрос", () => {
    const sql = inSightSql("c", "a'b", "m'n");
    expect(sql).toContain("'a''b'");
    expect(sql).toContain("'m''n'");
  });
});

describe("окно: mineHpInSight", () => {
  it("админу — как игроку: окно шахты в режиме бога не открывается (05.11.2026)", async () => {
    s.admin = true;
    s.rows = [];
    expect(await mineHpInSight("adm.near", "rmap_1", 5, 5)).toBe(false);
    expect(s.sql).toHaveLength(1);
  });

  it("игроку: строка есть — видно, нет — нет", async () => {
    s.rows = [{ ok: 1 }];
    expect(await mineHpInSight("me.near", "rmap_1", 5, -3)).toBe(true);
    expect(s.sql[0]).toContain("SELECT 5::int AS q, -3::int AS r");
    s.rows = [];
    expect(await mineHpInSight("me.near", "rmap_1", 5, -3)).toBe(false);
  });

  it("битые координаты — не видно и без запроса", async () => {
    expect(await mineHpInSight("me.near", "rmap_1", 1.5, 2)).toBe(false);
    expect(s.sql).toHaveLength(0);
  });
});

describe("hideMineLife", () => {
  const NOW = Date.parse("2026-11-04T12:00:00Z");
  const v2 = {
    mode: "max",
    lifeLeft: 0.03,
    lifeAt: "2026-11-04T11:00:00.000Z",
    breakAt: NOW + 60_000,
    broken: false,
    stdYield: 10,
    mult: 3,
    repairCost: { wood: 20 },
    level: 2,
    serverNow: NOW,
  } as MineV2Stamped;

  it("запас и срок — заглушки, режим/добыча/уровень остаются", () => {
    const h = hideMineLife(v2);
    expect(h.far).toBe(true);
    expect(h.lifeLeft).toBe(1);
    expect(h.lifeAt).toBe(new Date(NOW).toISOString());
    expect(h.breakAt).toBeGreaterThan(NOW + 365 * 24 * 3_600_000);
    expect(h).toMatchObject({ mode: "max", mult: 3, stdYield: 10, level: 2, broken: false });
    // Ни настоящей доли, ни настоящего срока в ответе нет.
    expect(JSON.stringify(h)).not.toContain("0.03");
    expect(JSON.stringify(h)).not.toContain(String(NOW + 60_000));
  });

  it("часы окна не ждут поломки спрятанной шахты", () => {
    const h = hideMineLife(v2);
    expect(mineBrokenNow(h, mineServerNow(h, NOW + 3_600_000))).toBe(false);
  });
});
