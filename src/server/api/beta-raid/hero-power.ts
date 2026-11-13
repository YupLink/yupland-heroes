// Сила героя в бета-рейде: единственная точка, через которую бой и карта
// узнают, есть ли у игрока герой и что он даёт.
//
// Всё держится на трёх «нет»:
//   • нет флага hero_power — loadHeroPower отдаёт null, и вызывающий код
//     идёт прежней веткой байт в байт;
//   • нет выбранного героя — то же самое;
//   • раса героя не найдена в таблице статов — null ДЛЯ БОЯ: нулевой герой
//     снаружи неотличим от честного и молча ослабил бы отряд. Карте и замку
//     такой герой отдаётся (loadHeroView): чинить нераспознанную расу можно
//     только в замке, а без блока hero туда нет и кнопки.
// Бонусы В БОЯХ С БОССАМИ отделены вторым флагом (hero_power_bosses) и
// аварийным рубильником: фонд босса делится по вкладу урона, и усиленный герой
// отбирает DARAI у остальных — см. heroBossBonusEnabled.
// Четвёртое «нет» мягче: отряд героя не собран — герой на карте есть, а в бою
// его множители нулевые (см. computeHeroPower).
import { pg } from "../../db/pg";
import { swrCache } from "../../cache/swr";
import { canUseFeature } from "../testers";
import { loadSelectedHero, type LoadedHero } from "./hero-load";
import { invalidateHeroEnergy } from "./hero-energy-sync";
import { effectiveHeroStats } from "@/lib/hero/effectiveHeroStats";
import { heroCombat, heroField, type HeroCombat, type HeroField } from "@/lib/hero/heroPowerCurve";
import { zeroStats, type GearLine } from "@/lib/hero/heroStatSources";
import type { HeroStats } from "@/lib/heroStats";
import type { SquadEntry } from "@/lib/heroSquadMatch";
import type { AbilityKind } from "./abilities";
import { HUNGER_FACTOR, satietyOf, type Satiety } from "@/lib/hero/satiety";
import { dropHeroMount } from "./hero-mount";

export type HeroPowerInfo = {
  heroId: string;
  name: string;
  imageUrl: string | null;
  race: string | null;
  spec: string | null;
  level: number;
  rarity: string;
  /** Раса и специализация на своём уровне (не выше обычного потолка редкости). */
  base: HeroStats;
  /** Вложенные очки навыков повышенных уровней. */
  skill: HeroStats;
  /** Вклад надетых артефактов. */
  gear: HeroStats;
  /** Постоянные прибавки ачивок аккаунта (§8.57). */
  ach?: HeroStats;
  /**
   * ВРЕМЕННЫЕ эффекты: бусты со знаком «+», ослабления боссов со знаком «−».
   * Именно эту колонку игрок видит в разборе «Откуда числа».
   */
  effects: HeroStats;
  /** База + очки + артефакты + эффекты: с этим герой и идёт в бой. */
  stats: HeroStats;
  /** Построчный разбор экипировки — для админского экрана. */
  lines: GearLine[];
  combat: HeroCombat;
  field: HeroField;
  squad: SquadEntry[];
  /** Сытость героя; на нуле — голод, характеристики ×0,5 (lib/hero/satiety). */
  satiety: Satiety;
};

/**
 * Герой вместе с признаком «раса не распознана». Один тип на два потребителя:
 * карта и замок берут героя как есть (бонусы нулевые), бой — только через
 * loadHeroPower, который такого героя не пропускает.
 */
export type HeroPowerView = {
  info: HeroPowerInfo;
  unknownRace: boolean;
  /** Спеца у шаблона нет — база посчитана по запасному (heroStats.FALLBACK_SPEC). В бой такой герой ИДЁТ. */
  specFallback: boolean;
  /** Герой до ослаблений (бусты внутри) и временные иммунитеты — для fight-weaken. */
  fightBase?: { buffed: HeroPowerInfo; immune: Set<AbilityKind> };
};

/** Открыты ли герою статы, артефакты, отряд и замок. */
export async function heroPowerEnabled(wallet: string): Promise<boolean> {
  return canUseFeature(wallet, "hero_power");
}

/**
 * Аварийный рубильник: settings 'hero_power_kill_bosses' = 'true' гасит бонусы
 * по боссам ВСЕМ разом, включая админа.
 *
 * Зачем он существует: фонд босса делится по вкладу урона, и усиленный герой
 * забирает DARAI у остальных игроков. Пока в закрытом тесте два-три кошелька,
 * перекос незаметен; если он полезет в статистике, механику надо гасить сразу,
 * а не ждать выката — одна строка в settings, и следующий бой идёт без героя.
 */
const KILL_BOSSES_KEY = "hero_power_kill_bosses";
/** Читается на каждый удар по боссу — держим короткий кэш, как у тестеров. */
const KILL_TTL_MS = 30_000;
let killCache: { at: number; on: boolean } | null = null;

async function bossBonusKilled(): Promise<boolean> {
  if (killCache && Date.now() - killCache.at < KILL_TTL_MS) return killCache.on;
  // Настройка недоступна — рубильник считаем ОТКЛЮЧЁННЫМ: молча снимать
  // бонусы из-за сбоя чтения хуже, чем на 30 секунд опоздать с аварийным
  // выключением (его всё равно включают руками и смотрят на результат).
  const row = await pg.settings.findOne({ key: KILL_BOSSES_KEY }).catch(() => null);
  const on = String(row?.value ?? "").trim() === "true";
  killCache = { at: Date.now(), on };
  return on;
}

/**
 * Работают ли бонусы героя ПО БОССАМ. Отдельный флаг поверх основного:
 * без hero_power бонусов нет вообще, включать их только по боссам нельзя.
 *
 * Раньше второй флаг читался СЫРЫМ переключателем группы, мимо canUseFeature:
 * так его можно было выключить даже админу. Побочный эффект оказался хуже
 * задумки — у владельца бонусы по боссам не работали никогда, и в сводке боя
 * висело «по боссам бонусы героя выключены», хотя всё остальное у героя жило.
 * Теперь флаг проходит обычным путём (админ — всегда, тестер — по
 * переключателю), а «выключить всем» умеет отдельный рубильник выше.
 */
export async function heroBossBonusEnabled(wallet: string): Promise<boolean> {
  if (!(await canUseFeature(wallet, "hero_power"))) return false;
  if (await bossBonusKilled()) return false;
  return canUseFeature(wallet, "hero_power_bosses");
}

/**
 * Собрать силу из уже загруженной строки героя. Отдельно от loadHeroPower,
 * чтобы экран экипировки мог показать разбор и тому герою, чья раса не
 * распознана: игроку нужно понять, ПОЧЕМУ у него нули.
 *
 * Земля клетки сюда не передаётся: игрок ходит, а результат кэшируется на
 * 15 секунд — бонус «на своей земле» включим, когда бой начнёт присылать
 * землю клетки вместе с боем.
 */
export function buildHeroPower(hero: LoadedHero): HeroPowerView {
  const eff = effectiveHeroStats({
    race: hero.race,
    spec: hero.spec,
    level: hero.level,
    gear: hero.gear,
    // Повышенные уровни: прибавки — до обычного потолка, сверх — очки навыков.
    rarity: hero.rarity,
    skills: hero.skills,
    achBonus: hero.achBonus,
  });
  // Голод (сытость на нуле): все характеристики ×0,5. Урезаем здесь, в общей
  // точке: бой, цена шага, окно героя и книга заклинаний считаются отсюда.
  // Снятая половина видна в колонке «эффекты» разбора «Откуда числа».
  const satiety = satietyOf(hero.satiety, hero.rarity, eff.spec ?? hero.spec);
  const stats = { ...eff.stats };
  const effects = zeroStats();
  if (satiety.hungry) {
    for (const k of Object.keys(stats) as Array<keyof typeof stats>) {
      const full = Number(stats[k]) || 0;
      stats[k] = Math.round(full * HUNGER_FACTOR * 100) / 100;
      effects[k] = stats[k] - full;
    }
  }
  return {
    unknownRace: eff.unknownRace,
    specFallback: eff.specFallback,
    info: {
      heroId: hero.heroId,
      name: hero.name,
      imageUrl: hero.imageUrl,
      race: eff.race,
      spec: eff.spec,
      level: eff.level,
      rarity: hero.rarity,
      base: eff.base,
      skill: eff.skill,
      gear: eff.gear,
      ach: eff.ach,
      // Временные эффекты подмешивают buffHero и weakenHero — они живут на
      // игроке и меняются чаще, чем кэш силы героя; здесь — только голод.
      effects,
      stats,
      lines: eff.lines,
      combat: heroCombat(stats, eff.immune),
      field: heroField(stats),
      squad: hero.squad,
      satiety,
    },
  };
}

/**
 * Кэш на кошелёк. Каждый шаг по карте и каждый удар в бою спрашивают героя,
 * а меняется он редко — 15 секунд достаточно, чтобы надетый артефакт доехал
 * до боя «сразу», и хватает, чтобы не таскать два SELECT на каждый шаг.
 *
 * Обновляется ФОНОМ: пятнадцать секунд назад значение устарело, но ход, который
 * выпал на эту границу, ждать цепочку запросов о герое не должен. Раньше ждал —
 * и раз в пятнадцать секунд ровно один шаг стоил вчетверо дороже соседних.
 */
const TTL_MS = 15_000;
const cache = swrCache<HeroPowerView | null>({ ttl: TTL_MS, load: computeHeroView });

/**
 * Сброс после смены героя, его УРОВНЯ, отряда или экипировки.
 *
 * Чистим ВЕСЬ кэш, а не один ключ: ключ здесь — кошелёк, а герой аккаунтный,
 * и с сестринского кошелька в бой ещё 15 секунд выходил бы прежний герой.
 * Узнать сёстры можно только запросом в базу, а зовут эту функцию синхронно
 * из нескольких мест — дешевле выбросить всё: кэш живёт 15 секунд, режим
 * закрытый, а переодеваются реже, чем ходят по карте.
 */
export function invalidateHeroPower(wallet?: string): void {
  cache.drop();
  dropHeroMount(); // конь — темп шага и прыжок (§8.84)
  // Сразу тянем заново, ФОНОМ: игрок только что переоделся и вот-вот пойдёт
  // ходить — пусть цепочку запросов оплатит эта миллисекунда, а не его шаг.
  if (wallet) cache.warm(wallet);
  // Второй кэш той же природы: интеллект героя лежит в user_energy, а syncHeroEnergy
  // минуту не ходит в базу при «тех же» числах — без сброса максимум энергии отставал.
  invalidateHeroEnergy();
}

/**
 * Герой для КАРТЫ и ЗАМКА: null только если флаг закрыт или героя нет.
 *
 * Нераспознанная раса героя здесь не отменяет: раньше она отменяла, и игрок
 * оставался без блока hero — а значит без кнопки входа в замок, то есть без
 * единственного места, где героя меняют, собирают отряд и надевают артефакты.
 * Тупик чинился ниоткуда. Бонусы у такого героя всё равно нулевые.
 */
export async function loadHeroView(wallet: string): Promise<HeroPowerView | null> {
  return cache.get(wallet);
}

/**
 * Герой этого игрока со всеми множителями — или null, если героя нет.
 *
 * Для БОЯ и для цены шага. Герой с нераспознанной расой отсюда не выходит:
 * его нули снаружи неотличимы от честных, и бой обязан идти прежней веткой.
 */
export async function loadHeroPower(wallet: string): Promise<HeroPowerInfo | null> {
  const view = await loadHeroView(wallet);
  return view && !view.unknownRace ? view.info : null;
}

async function computeHeroView(wallet: string): Promise<HeroPowerView | null> {
  if (!(await heroPowerEnabled(wallet))) return null;
  const hero = await loadSelectedHero(wallet).catch(() => null);
  if (!hero) return null;
  const { info, unknownRace, specFallback } = buildHeroPower(hero);
  // Сила героя больше НЕ зависит от того, закреплён ли отряд в замке: сбор
  // отряда как обязанность откатили, фишки снова выбирают в окне боя. Герой
  // усиливает тех, кто вышел в бой, — и точка.
  //
  // Ослабление от босса снимается ЗДЕСЬ, в единственной точке: иначе бой шёл
  // бы с одними числами, а окно героя и карта показывали другие — игрок
  // справедливо не верил, что «−20 брони» вообще работает.
  const { loadWeakenFor, weakenHero } = await import("./hero-weaken");
  // Порядок важен: сначала прибавляем свои бусты, потом босс снимает своё.
  // Наоборот вышло бы, что бафф «лечит» ослабление задним числом.
  const { buffHero, loadBuffsFor } = await import("./hero-buff");
  // Временный иммунитет (зелье/заклинание) — поверх иммунитетов от вещей.
  const { immuneHero, loadImmuneFor } = await import("./hero-immune");
  const [weaken, buffs, immune] = await Promise.all([
    loadWeakenFor(wallet),
    loadBuffsFor(wallet),
    loadImmuneFor(wallet),
  ]);
  const buffed = buffHero(info, buffs);
  const withEffects = weakenHero(buffed, weaken);
  const fightBase = { buffed, immune };
  return { unknownRace, specFallback, info: immuneHero(withEffects, immune), fightBase };
}
