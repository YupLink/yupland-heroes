// Карточка героя из инвентаря: уровень, статы и цена следующего уровня.
//
// Вынесено из heroes-read.ts ради лимита в 250 строк — там остались список
// героев и прокачка. Логика не менялась.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { nanoid } from "nanoid";
import { pg } from "../db/pg";
import { getCurrentWallet } from "../auth";
import { readOwnedById, accountOf } from "./user-shared";
import {
  convertRuleForChipLevel,
  nextLevelCost,
  MAX_LEVEL_BY_RARITY,
  type HeroRarity,
} from "@/lib/heroLevels";
import {
  requireHeroLevelUp,
  createHeroAtomic,
  levelUpHeroAtomic,
  type HeroRow,
} from "./heroes-shared";
import { rarityOfTemplateLevel } from "./heroes-list-dormant";
import { activeRest } from "./hero-rest";
import { heroCardStats, heroSkillCard } from "./heroes-skill-card";

/**
 * Карточка героя ИЗ ИНВЕНТАРЯ: уровень, статы и цена следующего уровня.
 * Герой мог попасть в инвентарь предметом (дроп, мистик-бокс) — тогда
 * экземпляр в hero_instance ещё не заведён, и мы показываем нулевой уровень.
 */
export const heroCardForTemplate = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        templateId: z.string().min(1),
        /** Копия предмета: карточку рисуем ИМЕННО её, а не самого прокачанного
         *  тёзку — иначе карточка показывает один экземпляр, а прокачка (она
         *  ходит по itemId) уходит в другой (баг: качало не того героя). */
        itemId: z.string().min(1).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const wallet = getCurrentWallet();
    if (!wallet) throw new Error("Кошелёк не подключён");
    const account = await accountOf(wallet);

    const tpl = (await pg.mysticItemTemplates.findOne({ id: data.templateId })) as {
      name?: string;
      image_url?: string | null;
      race?: string | null;
      specialization?: string | null;
      level?: number | null;
    } | null;
    if (!tpl) throw new Error("Шаблон героя не найден");

    // Тот же выбор экземпляра, что и в levelUpHeroTemplate: с itemId — эта
    // копия, без него (старый клиент) — самый прокачанный тёзка.
    const q = pg.heroInstances.raw().select("*").eq("account_id", account);
    const { data: rows } = data.itemId
      ? await q.eq("item_id", data.itemId)
      : await q.eq("template_id", data.templateId).order("level", { ascending: false });
    const inst = ((rows ?? []) as HeroRow[])[0] ?? null;

    // Редкость: у экземпляра — своя, у ещё не разбуженного героя — по ярусу
    // шаблона той же формулой, что и в listDormantHeroes (1..2★ = common,
    // 3★ rare, 4★ epic, 5★ legendary). Без common стартовый герой common
    // рисовался «Редким, ур. X/20» — потолок и редкость под rare.
    const rarity: HeroRarity =
      (inst?.rarity as HeroRarity) ?? rarityOfTemplateLevel(Number(tpl.level));
    const level = inst?.level ?? 0;
    const race = tpl.race ?? null;
    const spec = tpl.specialization ?? null;
    // Повышенные уровни: статы стоят на обычном потолке, сверх — вложенные очки.
    const sk = heroSkillCard(rarity, level, inst?.skills);
    return {
      heroId: inst?.id ?? null,
      name: tpl.name ?? "Герой",
      imageUrl: tpl.image_url ?? null,
      race: tpl.race ?? null,
      specialization: tpl.specialization ?? null,
      rarity,
      level,
      maxLevel: MAX_LEVEL_BY_RARITY[rarity] ?? 20,
      nextCost: nextLevelCost(rarity, level),
      likesSpent: Number(inst?.likes_spent ?? 0),
      stats: heroCardStats(race, spec, rarity, level, sk.skills),
      /** Статы, какими станут после следующего уровня — для подсказки «что даст».
       *  На повышенном уровне совпадают с текущими: он даёт только очко навыка. */
      statsNext: heroCardStats(race, spec, rarity, level + 1, sk.skills),
      ...sk,
      /** До какого момента отдыхает (ISO). null — не отдыхает. */
      restUntil: activeRest(inst?.rest_until),
    };
  });

/**
 * Поднять уровень героя, лежащего в инвентаре предметом. Если экземпляр
 * ещё не заведён — создаём его на лету (первый уровень «оживляет» героя).
 */
