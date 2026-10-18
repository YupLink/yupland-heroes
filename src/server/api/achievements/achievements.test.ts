// Ачивки на сервере (§8.57): SQL счётчика, что считает шаг героя и прибавки
// взятых редкостей в характеристиках героя (числа владельца, 17.10).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { achievementBumpSql } from "./bump";
import { effectiveHeroStats } from "@/lib/hero/effectiveHeroStats";
import { heroAlchemy, heroTrade } from "@/lib/hero/heroExtraStats";
import { achievementBonus } from "@/lib/achievements/tracks";

const bumps = vi.hoisted(() => [] as Array<[string, number]>);
vi.mock("./bump", async () => ({
  ...(await vi.importActual<object>("./bump")),
  bumpAchievement: (_a: string, track: string, n: number) => void bumps.push([track, n]),
}));
vi.mock("../beta-raid/move-energy-spent", () => ({ bumpMoveEnergy: async () => {} }));
vi.mock("../tournament/tour-note", () => ({ noteTournament: async () => {} }));
vi.mock("../../raidLive", () => ({ publishRaid: () => {} }));

const { afterStep } = await import("../beta-raid/move-step-after");
const cell = { q: 0, r: 0 };
const step = (o: { sailing: boolean; onShip: boolean; ocean?: boolean }) =>
  afterStep({
    wallet: "w",
    mapId: "m",
    account: "acc",
    moveCost: 1,
    toll: null,
    from: cell,
    to: cell,
    boarding: false,
    big: false,
    ...o,
  });

beforeEach(() => {
  bumps.length = 0;
});

describe("счётчик ачивки", () => {
  it("прибавляет к своему занятию, ноль не пишет", () => {
    const sql = achievementBumpSql("'acc_1'", "lumber", "3");
    expect(sql).toContain("INSERT INTO yuplink.account_achievement");
    expect(sql).toContain("'lumber'");
    expect(sql).toContain("WHERE (3) > 0");
    expect(sql).toContain("count = yuplink.account_achievement.count + EXCLUDED.count");
  });
});

describe("шаг героя", () => {
  it("пешком — «Исследователь» +1", () => {
    step({ sailing: false, onShip: false });
    step({ sailing: false, onShip: true }); // сошёл с корабля на сушу
    expect(bumps).toEqual([
      ["explorer", 1],
      ["explorer", 1],
    ]);
  });

  it("на борту — «Мореплаватель»: вода +1, море +2; посадка не в счёт", () => {
    step({ sailing: true, onShip: true });
    step({ sailing: true, onShip: true, ocean: true });
    step({ sailing: true, onShip: false });
    expect(bumps).toEqual([
      ["sailor", 1],
      ["sailor", 2],
    ]);
  });
});

describe("прибавки героя от ачивок", () => {
  it("итог взятой редкости, не сумма: необычный Рыбак — +3 алхимии", () => {
    expect(achievementBonus({ fisher: 29 })).toEqual({});
    expect(achievementBonus({ fisher: 30 })).toEqual({ alchemy: 1 });
    expect(achievementBonus({ fisher: 100 })).toEqual({ alchemy: 3 });
    expect(achievementBonus({ lumber: 10000, minelord: 30000 })).toEqual({ hp: 24, trade: 24 });
  });

  it("идут отдельной графой в итог характеристик, в торговлю и алхимию", () => {
    const hero = { race: "Дракон", spec: "Воин", level: 5 };
    const plain = effectiveHeroStats(hero);
    const boosted = effectiveHeroStats({ ...hero, achBonus: { atk: 3, luck: 6 } });
    expect(boosted.ach.atk).toBe(3);
    expect(boosted.stats.atk).toBe(plain.stats.atk + 3);
    expect(boosted.stats.luck).toBe(plain.stats.luck + 6);
    const opts = { race: "Дракон", spec: "Воин", level: 5, gear: [] };
    expect(heroTrade({ ...opts, achBonus: { trade: 6 } })).toBe(heroTrade(opts) + 6);
    expect(heroAlchemy({ ...opts, achBonus: { alchemy: 3 } })).toBe(heroAlchemy(opts) + 3);
  });
});
