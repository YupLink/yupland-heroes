// Обучение острова с нуля (26.10.2026): только тестер острова (админы и
// дизайнер), только свой аккаунт, снимок + сброс одной командой, повторно
// ничего не выдаётся. Базы нет.
import { beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({
  sql: [] as string[],
  tester: true,
  resets: [] as Array<[string, string]>,
  row: null as Record<string, unknown> | null,
  picked: true,
  inserted: false,
  kept: false,
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const fn = { inputValidator: () => fn, handler: (h: unknown) => h };
    return fn;
  },
}));
vi.mock("@/server/islandTester", () => ({
  requireIslandTester: () => {
    if (!s.tester) throw new Error("Доступ запрещён: тест острова новичка");
    return "w_me";
  },
}));
vi.mock("../gate", () => ({ requireBetaRaid: async () => "w_me" }));
vi.mock("../owner", () => ({ raidOwner: async (w: string) => `acc_of_${w}` }));
vi.mock("./island-admin", () => ({
  resetIsland: async (wallet: string, account: string) => {
    s.resets.push([wallet, account]);
    return { ok: true, map: "isle_new" };
  },
}));
vi.mock("@/server/api/heroes-wake", () => ({ wakeHeroInstance: async () => "hero_1" }));
vi.mock("@/server/api/heroes-select", () => ({ switchMainSql: () => "SWITCH MAIN" }));
vi.mock("@/server/api/beta-raid/hero-power", () => ({ invalidateHeroPower: () => {} }));
vi.mock("@/server/db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    s.sql.push(sql);
    if (sql.includes("raid_map_keep")) return s.kept ? [{ ok: 1 }] : [];
    if (sql.includes("FROM yuplink.raid_island WHERE account_id")) return s.row ? [s.row] : [];
    if (sql.includes("AS picked")) return [{ picked: s.picked }];
    if (sql.includes("FROM yuplink.mystic_item_template"))
      return [{ id: "hero_bee", name: "Пчела", race: "Пчела", image_url: null }];
    if (sql.includes("INSERT INTO yuplink.user_game_item"))
      return s.inserted ? [{ id: "ugi_isle_x" }] : [];
    if (sql.includes("SELECT id FROM yuplink.user_game_item")) return [{ id: "ugi_isle_x" }];
    if (sql.includes("raid_hero_backpack")) return [{ carried: 3, done: false }];
    return [];
  },
}));

const api = await import("./island-api");
const { tutorialResetSql } = await import("./island-tutorial-reset");
const { factsSql } = await import("./island-facts");
const { parsePlaces } = await import("@/lib/raid/island/steps");

const at = { q: 1, r: 1 };
const places = { spawn: at, chest: at, workshop: at, mine: at, treasure: at, portal: at };
const liveRow = (done: string[], resetAt: string | null) => ({
  account_id: "acc_of_w_me",
  map_id: "isle_a",
  places,
  done,
  tutorial_reset_at: resetAt,
});
// Ручки — сами обработчики (createServerFn подменён), вызываем напрямую.
const call = (fn: unknown, arg?: unknown) => (fn as (a?: unknown) => Promise<unknown>)(arg);

beforeEach(() => {
  s.sql = [];
  s.tester = true;
  s.resets = [];
  s.row = null;
  s.picked = true;
  s.inserted = false;
  s.kept = false;
});

describe("обучение острова с нуля", () => {
  it("не тестер острова — отказ, ни одной записи и сноса", async () => {
    s.tester = false;
    await expect(call(api.adminIslandTutorialRestart)).rejects.toThrow("Доступ запрещён");
    expect(s.sql).toEqual([]);
    expect(s.resets).toEqual([]);
  });

  it("только свой аккаунт: от кошелька сессии, чужой id на входе не слушается", async () => {
    const res = await call(api.adminIslandTutorialRestart, { data: { account: "acc_other" } });
    expect(res).toEqual({ ok: true, map: "isle_new" });
    expect(s.resets).toEqual([["w_me", "acc_of_w_me"]]);
    expect(s.sql.join("\n")).not.toContain("acc_other");
    expect(s.sql[0]).toContain("'acc_of_w_me'");
  });

  it("сохранённый остров (04.11) — отказ до сброса отметок, без сноса", async () => {
    s.row = liveRow(["welcome"], null);
    s.kept = true;
    await expect(call(api.adminIslandTutorialRestart)).rejects.toThrow("island.kept");
    expect(s.sql.some((q) => q.includes("UPDATE yuplink.raid_island"))).toBe(false);
    expect(s.resets).toEqual([]);
  });

  it("снимок и сброс — одна команда; сбрасываются только отметки обучения", () => {
    const sql = tutorialResetSql("acc_1", "w_1");
    expect(sql.match(/;/g)).toHaveLength(1);
    expect(sql).toMatch(/^WITH snap AS \(\s*INSERT INTO yuplink\.raid_island_tutorial_reset/);
    expect(sql).toContain("WHERE account_id = 'acc_1' AND EXISTS (SELECT 1 FROM snap)");
    expect(sql).toContain(
      "SET done = '[]'::jsonb, tutorial_skipped_at = NULL, finished_at = NULL,\n           tutorial_reset_at = now()",
    );
    // В снимке — строка задания, герой острова и оставленное на карте острова.
    for (const k of ["'island'", "'hero_item'", "'raid_warehouse_slot'", "'raid_loot_bag_item'"])
      expect(sql).toContain(k);
    // Пишет только историю и строку задания: вещи, балансы, герои, ачивки, награды — нет.
    const writes = [...sql.matchAll(/(?:INSERT INTO|UPDATE|DELETE FROM)\s+yuplink\.(\w+)/g)].map(
      (m) => m[1],
    );
    expect(writes).toEqual(["raid_island_tutorial_reset", "raid_island"]);
  });

  it("после сброса окно выбора героя снова, пока выбор не сделан", async () => {
    s.row = liveRow([], "2026-10-26T10:00:00Z");
    expect(((await call(api.getIslandHeroPick)) as { need: boolean }).need).toBe(true);
    s.row = liveRow(["hero_pick"], "2026-10-26T10:00:00Z");
    expect(((await call(api.getIslandHeroPick)) as { need: boolean }).need).toBe(false);
    // Без сброса — как было: герой острова есть — окна нет.
    s.row = liveRow([], null);
    expect(((await call(api.getIslandHeroPick)) as { need: boolean }).need).toBe(false);
  });

  it("награды не повторяются: повторный выбор не кладёт второго героя, шаг — по выбору", async () => {
    s.row = liveRow([], "2026-10-26T10:00:00Z");
    await call(api.pickIslandHero, { data: { templateId: "hero_bee" } });
    const ins = s.sql.find((x) => x.includes("INSERT INTO yuplink.user_game_item")) ?? "";
    // Вставка одна на аккаунт и запрещена, если героя острова выдавали до сброса.
    expect(ins).toContain("'ugi_isle_' || md5('acc_of_w_me')");
    expect(ins).toContain("NOT EXISTS (SELECT 1 FROM yuplink.raid_island_tutorial_reset t");
    expect(ins).toContain("@> '[\"hero_pick\"]'::jsonb");
    expect(s.sql.filter((x) => x.includes("INSERT INTO yuplink.user_game_item"))).toHaveLength(1);
    // Свой прежний герой остаётся тем же предметом (основным — только при пустом рюкзаке).
    expect(s.sql.some((x) => x.includes("SELECT id FROM yuplink.user_game_item"))).toBe(true);
    expect(s.sql).not.toContain("SWITCH MAIN");
    expect(
      s.sql.some((x) => x.includes("'[\"hero_pick\"]'::jsonb") && x.includes("SET done")),
    ).toBe(true);
  });

  it("после сброса шаг «Герой в подарок» не засчитывается наличием героя", () => {
    const p = parsePlaces(places);
    if (!p) throw new Error("places");
    expect(factsSql("acc_1", "isle_a", p)).toContain("WHERE id = 'ugi_isle_' || md5('acc_1')");
    const replay = factsSql("acc_1", "isle_a", p, new Set(), true);
    expect(replay).toContain("false AS hero_pick");
    expect(replay).not.toContain("'ugi_isle_' || md5");
    expect(factsSql("acc_1", "isle_a", p, new Set(["hero_pick"]), true)).toContain(
      "true AS hero_pick",
    );
  });
});
