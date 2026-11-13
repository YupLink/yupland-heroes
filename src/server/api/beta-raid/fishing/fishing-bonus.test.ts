// План бонуса к рыбалке (владелец, 14.10.2026, вечер: «зелье удачи действует
// только пока действует»): бонус сейчас и ступени по срокам баффов удачи. Удача —
// сборкой loadHeroView (герой с голодом → баффы → ослабление), мимо кэша.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LoadedHero } from "@/server/api/beta-raid/hero-load";

const db = vi.hoisted(() => ({
  hero: null as LoadedHero | null,
  buffs: [] as Array<{ value: unknown; endMs: unknown }>,
  weak: [] as Array<{ kind: string; value: number }>,
  enabled: true,
  sql: [] as string[],
}));

vi.mock("@/server/db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    db.sql.push(sql);
    if (sql.includes("kind = 'buff_luck'")) return db.buffs;
    if (sql.includes("weak_")) return db.weak;
    return [];
  },
}));
vi.mock("@/server/api/beta-raid/owner", () => ({ raidOwner: async () => "acc1" }));
vi.mock("@/server/api/beta-raid/hero-load", () => ({ loadSelectedHero: async () => db.hero }));
vi.mock("@/server/api/beta-raid/hero-power", async (orig) => ({
  ...(await orig<typeof import("@/server/api/beta-raid/hero-power")>()),
  heroPowerEnabled: async () => db.enabled,
}));

const { buildHeroPower } = await import("@/server/api/beta-raid/hero-power");
const { fishBonusOf, fishBonusPlan, luckAt, luckBuffsSql, parseLuckBuffs } =
  await import("./fishing-bonus");

const MIN = 60_000;
const hero = (gear: LoadedHero["gear"] = []): LoadedHero => ({
  heroId: "hero_1",
  name: "Кабан",
  imageUrl: null,
  race: "Кабан",
  spec: "Торговец",
  level: 15,
  rarity: "rare",
  skills: {},
  equipped: {},
  gear,
  squad: [],
  satiety: null,
});
/** Артефакт «Бонус к рыбалке +50 %» (остальное у предмета для удачи не важно). */
const ART = { fishBonusPct: 50 } as unknown as LoadedHero["gear"][number];
/** Своя удача героя без баффов. */
const own = () => buildHeroPower(hero()).info.stats.luck;
/** Бонус удачи: каждые полные 50 → +10 %. */
const step = (luck: number) => Math.floor(luck / 50) * 10;

beforeEach(() => {
  Object.assign(db, { hero: hero([ART]), buffs: [], weak: [], enabled: true, sql: [] });
});

describe("удача в миг попытки", () => {
  it("бафф живёт до срока: до него — с ним, в миг срока и позже — без", () => {
    const { info } = buildHeroPower(hero());
    const buffs = [
      { value: 100, endMs: 5 * MIN },
      { value: 60, endMs: 20 * MIN },
    ];
    expect(luckAt(info, buffs, {}, 0)).toBe(own() + 160);
    expect(luckAt(info, buffs, {}, 5 * MIN)).toBe(own() + 60);
    expect(luckAt(info, buffs, {}, 20 * MIN)).toBe(own());
  });

  it("ослабление снимает поверх баффа и не уводит ниже нуля", () => {
    const { info } = buildHeroPower(hero());
    const buffs = [{ value: 100, endMs: 5 * MIN }];
    expect(luckAt(info, buffs, { weak_luck: 30 }, 0)).toBe(own() + 70);
    expect(luckAt(info, buffs, { weak_luck: 10_000 }, 0)).toBe(0);
  });

  it("строки чтения: пункты целые, ноль и мусор отбрасываются", () => {
    expect(
      parseLuckBuffs([
        { value: "120.7", endMs: 1000 },
        { value: 0, endMs: 2000 },
        { value: 5, endMs: "x" },
      ]),
    ).toEqual([{ value: 120, endMs: 1000 }]);
    expect(luckBuffsSql("acc1")).toContain(
      "account_id = 'acc1' AND kind = 'buff_luck' AND expires_at > now()",
    );
  });
});

describe("план бонуса героя", () => {
  it("зелье удачи истекает через 4 минуты — ступень вниз в миг срока", async () => {
    db.buffs = [{ value: 200, endMs: 4 * MIN }];
    const plan = await fishBonusPlan("w1");
    expect(plan.bonusPct).toBe(50 + step(own() + 200));
    expect(plan.steps).toEqual([{ at: 4 * MIN, bonusPct: 50 + step(own()) }]);
    expect(await fishBonusOf("w1")).toEqual({ bonusPct: plan.bonusPct, addPct: 0 });
  });

  it("два баффа — по ступени на каждый срок, по возрастанию", async () => {
    db.buffs = [
      { value: 50, endMs: 30 * MIN },
      { value: 100, endMs: 10 * MIN },
    ];
    const plan = await fishBonusPlan("w1");
    expect(plan.bonusPct).toBe(50 + step(own() + 150));
    expect(plan.steps).toEqual([
      { at: 10 * MIN, bonusPct: 50 + step(own() + 50) },
      { at: 30 * MIN, bonusPct: 50 + step(own()) },
    ]);
  });

  it("сила героя закрыта флагом — удачи нет, артефакт считается, баффы не читаются", async () => {
    db.enabled = false;
    db.buffs = [{ value: 200, endMs: 4 * MIN }];
    expect(await fishBonusPlan("w1")).toEqual({ bonusPct: 50, steps: [], addPct: 0 });
    expect(db.sql.some((s) => s.includes("buff_luck"))).toBe(false);
  });

  it("героя нет — ноль без ступеней", async () => {
    db.hero = null;
    expect(await fishBonusPlan("w1")).toEqual({ bonusPct: 0, steps: [], addPct: 0 });
  });

  it("рыбак (09.11.2026) — +3 к базе, и при закрытой силе героя", async () => {
    db.hero = { ...hero([ART]), ability: "fisher" };
    expect((await fishBonusPlan("w1")).addPct).toBe(3);
    db.enabled = false;
    expect(await fishBonusOf("w1")).toEqual({ bonusPct: 50, addPct: 3 });
    db.hero = { ...hero(), ability: "killer" };
    expect((await fishBonusOf("w1")).addPct).toBe(0);
  });
});
