// Герои: повышение уровня за лайки.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { pg } from "../db/pg";
import { accountOf } from "./user";
import {
  nextLevelCost,
  skillPointsAt,
  MAX_LEVEL_BY_RARITY,
  type HeroRarity,
} from "@/lib/heroLevels";
import { requireHeroLevelUp, levelUpHeroAtomic, type HeroRow } from "./heroes-shared";
import { requireHeroAwake } from "./hero-rest";

/**
 * Сброс кэша силы героя грузится через import(): hero-power читает отряд, и при
 * статическом импорте модули замкнулись бы в кольцо (так же сделано в
 * heroes-select.ts).
 */
const heroPowerApi = () => import("./beta-raid/hero-power");

/** Повысить уровень героя за лайки (цена — по таблице ступеней). */
export const levelUpHero = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ heroId: z.string().min(1) }).parse(d))
  .handler(async ({ data }) => {
    const wallet = await requireHeroLevelUp();
    const account = await accountOf(wallet);

    const hero = (await pg.heroInstances.findOne({ id: data.heroId })) as HeroRow | null;
    if (!hero) throw new Error("Герой не найден");
    if (hero.account_id !== account) throw new Error("Это не твой герой");
    // Отдыхающий после снятия с грядки не качается (hero-rest.ts).
    await requireHeroAwake(hero.id);

    const rarity = hero.rarity as HeroRarity;
    const cost = nextLevelCost(rarity, hero.level);
    if (cost == null) {
      throw new Error(`Достигнут максимум для ${rarity} — ${MAX_LEVEL_BY_RARITY[rarity]} ур.`);
    }
    // Атомарно: списание лайков и повышение уровня одним стейтментом (см.
    // levelUpHeroAtomic — раньше две записи теряли лайки при неудачном апдейте).
    const { newLevel, likesLeft } = await levelUpHeroAtomic(wallet, hero.id, cost, {
      fromLevel: hero.level,
      maxLevel: MAX_LEVEL_BY_RARITY[rarity],
    });
    // Кэш силы держит статы героя, а они считаются ОТ УРОВНЯ. Без сброса
    // следующие 15 секунд бой и цена шага шли бы по прежнему уровню: игрок
    // заплатил лайками и сразу увидел старые числа.
    const { invalidateHeroPower } = await heroPowerApi();
    invalidateHeroPower(wallet);
    // Повышенный уровень статов не растит — только очки навыков: тост об этом
    // и скажет (сколько очков пришло с этой ступени).
    const skillGain = skillPointsAt(rarity, newLevel) - skillPointsAt(rarity, newLevel - 1);
    return { ok: true, level: newLevel, spentLikes: cost, likesLeft, skillGain };
  });
