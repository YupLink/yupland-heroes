// Герой острова (20.10): выбранной расы, сразу в героях (не «Подарки»), раз на
// аккаунт; основным — только если рюкзак нынешнего основного пуст. Базы нет.
import { beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({
  sql: [] as string[],
  inserted: true,
  carried: 0,
  done: false,
  woke: [] as string[],
}));

vi.mock("@/server/db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    s.sql.push(sql);
    if (sql.includes("FROM yuplink.mystic_item_template"))
      return [
        { id: "hero_dragon", name: "Дракон", race: "Дракон", image_url: "/d.webp" },
        { id: "hero_bee", name: "Пчела", race: "Пчела", image_url: null },
      ];
    if (sql.includes("INSERT INTO yuplink.user_game_item"))
      return s.inserted ? [{ id: "ugi_isle_x" }] : [];
    if (sql.includes("raid_hero_backpack")) return [{ carried: s.carried, done: s.done }];
    return [];
  },
}));
vi.mock("@/server/api/heroes-wake", () => ({
  wakeHeroInstance: async (_w: string, _a: string, item: string) => {
    s.woke.push(item);
    return "hero_1";
  },
}));
vi.mock("@/server/api/heroes-select", () => ({ switchMainSql: () => "SWITCH MAIN" }));
vi.mock("@/server/api/beta-raid/hero-power", () => ({ invalidateHeroPower: () => {} }));

const { pickIslandHero, islandHeroOptions } = await import("./island-gift");

beforeEach(() => {
  s.sql = [];
  s.inserted = true;
  s.carried = 0;
  s.done = false;
  s.woke = [];
});

describe("герой острова", () => {
  it("выбранной расы — сразу в героях, id предмета один на аккаунт, сразу основной", async () => {
    expect((await islandHeroOptions()).map((o) => o.race)).toEqual(["Дракон", "Пчела"]);
    await pickIslandHero("w", "acc_1", "hero_dragon");
    const ins = s.sql.find((x) => x.includes("INSERT INTO yuplink.user_game_item")) ?? "";
    expect(ins).toContain("'ugi_isle_' || md5('acc_1')");
    expect(ins).toContain("'hero_dragon', 'hero', 'island'");
    expect(ins).toContain("ON CONFLICT (id) DO UPDATE");
    expect(s.sql.some((x) => x.includes("player_gift"))).toBe(true);
    // Раса уже выбрана в меню входа — второго героя вставка не даст (06.11.2026).
    expect(ins).toContain("AND NOT EXISTS (SELECT 1 FROM yuplink.game_start s");
    expect(ins).toContain("s.template_id IS NOT NULL");
    expect(s.woke).toEqual(["ugi_isle_x"]);
    expect(s.sql).toContain("SWITCH MAIN");
  });

  it("рюкзак основного не пуст — герой ложится, но основным не становится", async () => {
    s.carried = 3;
    await pickIslandHero("w", "acc_1", "hero_bee");
    expect(s.woke).toEqual([]);
    expect(s.sql).not.toContain("SWITCH MAIN");
  });

  it("повтор: уже основной — ничего; не успел стать основным — доделает", async () => {
    s.done = true;
    await pickIslandHero("w", "acc_1", "hero_bee");
    expect(s.woke).toEqual([]);
    s.done = false;
    await pickIslandHero("w", "acc_1", "hero_bee");
    expect(s.woke).toEqual(["ugi_isle_x"]);
  });

  it("выбравший до 20.10 подарком — ничего не добавляет; чужой шаблон не выдаётся", async () => {
    s.inserted = false;
    await pickIslandHero("w", "acc_1", "hero_bee");
    expect(s.woke).toEqual([]);
    await expect(pickIslandHero("w", "acc_1", "hero_legendary")).rejects.toThrow(
      "island.hero_unknown",
    );
  });
});
