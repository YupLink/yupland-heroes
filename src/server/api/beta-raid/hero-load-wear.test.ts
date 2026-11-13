// Сломанный артефакт (износ 100 %) остаётся на герое. Пока ремонта нет
// (BROKEN_ART_PENALTY, владелец 23.10.2026: «никаких дебафов не должно быть,
// пока мы не ввели ремонт»), он даёт всё, как целый: характеристики,
// иммунитеты, рыбалку/торговлю/алхимию.
import { describe, expect, it, vi } from "vitest";

const HERO = {
  id: "hero_1",
  level: 10,
  rarity: "rare",
  skills: null,
  equipped: { Голова: "it_ok", Тело: "it_broken" },
  squad: [],
  satiety: null,
  name: "Кабан",
  image_url: null,
  race: "Кабан",
  specialization: "Воин",
  ach: null,
};
const piece = (itemId: string, wear: number, statType = "attack") => ({
  itemId,
  templateId: `tpl_${itemId}`,
  name: itemId,
  slot: itemId === "it_ok" ? "Голова" : "Тело",
  rarity: "common",
  imageUrl: null,
  statType,
  statAmount: 5,
  immunities: itemId === "it_broken" ? ["Яд"] : [],
  fishBonusPct: itemId === "it_broken" ? 50 : 0,
  wear,
});
const sqls: string[] = [];
let brokenStat = "attack";

vi.mock("../../db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    sqls.push(sql);
    return sql.includes("FROM yuplink.hero_instance h")
      ? [HERO]
      : [piece("it_ok", 37.5), piece("it_broken", 100, brokenStat)];
  },
}));
vi.mock("./owner", () => ({ raidOwner: async () => "acc_1" }));
vi.mock("../heroes-squad", () => ({ SQUAD_SLOTS: 10 }));

const { loadSelectedHero } = await import("./hero-load");
const { effectiveHeroStats } = await import("@/lib/hero/effectiveHeroStats");
const { heroFishBonus } = await import("@/lib/raid/fishBonus");
const { heroTrade } = await import("@/lib/hero/heroExtraStats");
const { BROKEN_ART_PENALTY } = await import("@/lib/hero/artWear");

describe("сломанный артефакт на герое — без штрафа до ремонта", () => {
  it("флаг штрафа выключен (включится вместе с ремонтом — по слову владельца)", () => {
    expect(BROKEN_ART_PENALTY).toBe(false);
  });

  it("износ читается из самого предмета", async () => {
    await loadSelectedHero("w.near");
    expect(sqls.some((s) => s.includes("u.wear::float8 AS wear"))).toBe(true);
  });

  it("остаётся надетым и входит в рабочую экипировку вместе с целым", async () => {
    const hero = await loadSelectedHero("w.near");
    expect(hero?.equipped).toEqual({ Голова: "it_ok", Тело: "it_broken" });
    expect(hero?.gear.map((p) => p.itemId)).toEqual(["it_ok", "it_broken"]);
    expect(hero?.broken).toEqual([]);
    // Прочность едет в карточку как есть: полоса и «сломан» видны.
    expect(hero?.gear.find((p) => p.itemId === "it_broken")?.wear).toBe(100);
  });

  it("даёт характеристики, иммунитеты и рыбалку, как целый", async () => {
    const hero = (await loadSelectedHero("w.near"))!;
    const eff = effectiveHeroStats({
      race: hero.race,
      spec: hero.spec,
      level: 10,
      gear: hero.gear,
    });
    // +5 изношенного на 37,5 % и +5 сломанного — оба в деле.
    expect(eff.gear.atk).toBe(10);
    expect(eff.immune.has("poison")).toBe(true);
    expect(heroFishBonus({ gear: hero.gear, luck: 0 })).toBe(50);
  });

  it("ремесло тоже: «Торговля» сломанного растит рюкзак", async () => {
    brokenStat = "trade";
    try {
      const hero = (await loadSelectedHero("w.near"))!;
      const opts = { race: hero.race, spec: hero.spec, level: 10 };
      expect(heroTrade({ ...opts, gear: hero.gear })).toBe(5);
    } finally {
      brokenStat = "attack";
    }
  });
});
