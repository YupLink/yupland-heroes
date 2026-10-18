// Кого ставить на грядку: отдыхающий (снят с грядки издалека) никуда не встаёт,
// а в списке помечен сроком отдыха — клиент рисует его серым.
import { beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({ rows: [] as unknown[], sql: [] as string[] }));
vi.mock("../../db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    s.sql.push(sql);
    return s.rows;
  },
}));
vi.mock("./owner", () => ({ raidOwner: async () => "acc_me" }));
vi.mock("../heroes-wake", () => ({
  resolveHeroInstanceId: async (_w: string, _a: string, id: string) => id,
  wakeRef: (itemId: string) => `wake:${itemId}`,
}));
vi.mock("../heroes-list-dormant", () => ({ listDormantHeroes: async () => [] }));

const { fieldHeroes, guardedJoinSql, requireOwnHero } = await import("./field-heroes");

beforeEach(() => {
  s.rows = [];
  s.sql = [];
});

describe("requireOwnHero — постановка на грядку", () => {
  it("отдыхает — «герой отдыхает»", async () => {
    s.rows = [{ id: "hero_w", name: "Воин", rarity: "rare", level: 5, resting: true }];
    await expect(requireOwnHero("w_me", "hero_w")).rejects.toThrow("braid.hero_resting");
  });

  it("основной — «он основной» (работает, значит не основной)", async () => {
    s.rows = [{ id: "hero_w", name: "Воин", rarity: "rare", level: 5, resting: null, main: true }];
    await expect(requireOwnHero("w_me", "hero_w")).rejects.toThrow("braid.field_hero_is_main");
  });

  it("свободен — отдаёт героя", async () => {
    s.rows = [{ id: "hero_w", name: "Воин", rarity: "rare", level: 5, resting: null, main: false }];
    await expect(requireOwnHero("w_me", "hero_w")).resolves.toMatchObject({ id: "hero_w" });
  });

  it("сама постановка — с условием «не основной и не отдыхает» в операторе", () => {
    const sql = guardedJoinSql({
      mapId: "rmap_a",
      q: 1,
      r: 2,
      account: "acc_me",
      wallet: "w_me",
      heroId: "hero_w",
    });
    expect(sql.startsWith("SELECT pg_advisory_xact_lock(hashtext('hero:hero_w')) AS l;")).toBe(
      true,
    );
    expect(sql).toContain("AS _row FROM (SELECT (SELECT count(*) FROM j)::int AS joined)");
    expect(sql).toContain("id = 'hero_w' AND selected_at IS NULL");
    expect(sql).toContain("rest_until IS NULL OR rest_until <= now()");
    expect(sql).toContain("yuplink.raid_field_join('rmap_a', 1, 2,");
    expect(sql).toContain("'acc_me', 'w_me', h.id) FROM h");
  });
});

describe("fieldHeroes — список", () => {
  it("идущий отдых — сроком, прошедший — null", async () => {
    const soon = new Date(Date.now() + 3600_000).toISOString();
    s.rows = [
      {
        id: "h1",
        level: 3,
        rarity: "rare",
        template_id: "t",
        name: "А",
        image_url: null,
        busy_q: null,
        busy_r: null,
        rest_until: soon,
      },
      {
        id: "h2",
        level: 3,
        rarity: "rare",
        template_id: "t",
        name: "Б",
        image_url: null,
        busy_q: null,
        busy_r: null,
        rest_until: "2020-01-01T00:00:00Z",
      },
    ];
    const list = await fieldHeroes("w_me", "rmap_a");
    expect(list.find((h) => h.id === "h1")?.restUntil).toBe(soon);
    expect(list.find((h) => h.id === "h2")?.restUntil).toBeNull();
    expect(s.sql[0]).toContain("h.rest_until");
  });
});
