// Ответ выбора героя острова (26.10.2026, Ангелина): фактически выданный герой
// с расой, специализацией и редкостью; повторный выбор — прежний, alreadyHad,
// без выдачи. Базы нет.
import { beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({
  sql: [] as string[],
  fresh: true,
  inserted: true,
  instance: null as string | null,
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const fn = { inputValidator: () => fn, handler: (h: unknown) => h };
    return fn;
  },
}));
vi.mock("@/server/islandTester", () => ({ requireIslandTester: () => "w_me" }));
vi.mock("../gate", () => ({ requireBetaRaid: async () => "w_me" }));
vi.mock("../owner", () => ({ raidOwner: async (w: string) => `acc_of_${w}` }));
vi.mock("@/server/api/heroes-wake", () => ({ wakeHeroInstance: async () => "hero_1" }));
vi.mock("@/server/api/heroes-select", () => ({ switchMainSql: () => "SWITCH MAIN" }));
vi.mock("@/server/api/beta-raid/hero-power", () => ({ invalidateHeroPower: () => {} }));
vi.mock("@/server/db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    s.sql.push(sql);
    if (sql.includes("FROM yuplink.raid_island WHERE account_id"))
      return [{ account_id: "acc_of_w_me", map_id: "isle_a", places: PLACES, done: [] }];
    if (sql.includes("FROM yuplink.mystic_item_template") && sql.includes("DISTINCT ON"))
      return [
        { id: "hero_bee", name: "Fedr - Stubborn Mage", race: "Пчела", image_url: "/f.webp" },
      ];
    if (sql.includes("INSERT INTO yuplink.user_game_item"))
      return s.inserted ? [{ id: "ugi_isle_x", fresh: s.fresh }] : [];
    if (sql.includes("SELECT id FROM yuplink.user_game_item")) return [{ id: "ugi_isle_x" }];
    if (sql.includes("raid_hero_backpack")) return [{ carried: 3, done: false }];
    if (sql.includes("LEFT JOIN yuplink.hero_instance h ON h.item_id = u.id"))
      return [
        {
          item_id: "ugi_isle_x",
          instance_id: s.instance,
          template_id: "hero_bee",
          name: "Fedr - Stubborn Mage",
          image_url: "/f.webp",
          race: "Пчела",
          specialization: "Маг",
          level: 1,
          inst_rarity: null,
          main: false,
        },
      ];
    return [];
  },
}));

const at = { q: 1, r: 1 };
const PLACES = { spawn: at, chest: at, workshop: at, mine: at, treasure: at, portal: at };
const api = await import("./island-api");
const { heroGrantedOf } = await import("./island-hero-info");
const call = (fn: unknown, arg?: unknown) => (fn as (a?: unknown) => Promise<unknown>)(arg);
type PickRes = { ok: true; hero: Record<string, unknown> | null };

beforeEach(() => {
  s.sql = [];
  s.fresh = true;
  s.inserted = true;
  s.instance = null;
});

describe("ответ выбора героя острова", () => {
  it("выданный герой: предмет, экземпляр, шаблон, имя, картинка, редкость, спец, раса", async () => {
    const res = (await call(api.pickIslandHero, { data: { templateId: "hero_bee" } })) as PickRes;
    expect(res.ok).toBe(true);
    expect(res.hero).toEqual({
      itemId: "ugi_isle_x",
      instanceId: null,
      templateId: "hero_bee",
      name: { ru: "Fedr - Stubborn Mage", en: "Fedr - Stubborn Mage" },
      image: "/f.webp",
      rarity: { id: "common", ru: "Обычный", en: "Common" },
      specialization: { id: "Маг", ru: "Маг", en: "Mage" },
      race: { id: "Пчела", ru: "Пчела", en: "Bee" },
      main: false,
      alreadyHad: false,
    });
    // Читаем только своего героя острова.
    const read = s.sql.find((x) => x.includes("LEFT JOIN yuplink.hero_instance")) ?? "";
    expect(read).toContain("u.id = 'ugi_isle_' || md5('acc_of_w_me')");
    expect(read).toContain("u.account_id = 'acc_of_w_me'");
  });

  it("герой уже был (повтор, обучение с нуля) — тот же, alreadyHad, второй вставки нет", async () => {
    s.fresh = false;
    const again = (await call(api.pickIslandHero, { data: { templateId: "hero_bee" } })) as PickRes;
    expect(again.hero).toMatchObject({ itemId: "ugi_isle_x", alreadyHad: true });
    // Вставку запретил снимок сброса — берём прежнего героя.
    s.inserted = false;
    s.sql = [];
    const blocked = (await call(api.pickIslandHero, {
      data: { templateId: "hero_bee" },
    })) as PickRes;
    expect(blocked.hero).toMatchObject({ itemId: "ugi_isle_x", alreadyHad: true });
    expect(s.sql.filter((x) => x.includes("INSERT INTO yuplink.user_game_item"))).toHaveLength(1);
    expect(s.sql.some((x) => x.includes("(xmax = 0) AS fresh"))).toBe(true);
  });

  it("«мой герой острова» — тот же ответ, без выдачи", async () => {
    s.instance = "hero_inst_1";
    const res = (await call(api.getMyIslandHero)) as { hero: Record<string, unknown> | null };
    expect(res.hero).toMatchObject({ instanceId: "hero_inst_1", alreadyHad: true });
    expect(s.sql.some((x) => /INSERT|UPDATE|DELETE/.test(x))).toBe(false);
  });

  it("редкость экземпляра важнее яруса шаблона; неизвестная раса — как есть", () => {
    const h = heroGrantedOf(
      {
        item_id: "i",
        instance_id: "h",
        template_id: "t",
        name: null,
        image_url: null,
        race: "Новая",
        specialization: null,
        level: 1,
        inst_rarity: "epic",
        main: "t",
      },
      false,
    );
    expect(h.rarity).toEqual({ id: "epic", ru: "Эпический", en: "Epic" });
    expect(h.race).toEqual({ id: "Новая", ru: "Новая", en: "Новая" });
    expect(h.specialization).toBeNull();
    expect(h.main).toBe(true);
  });
});
