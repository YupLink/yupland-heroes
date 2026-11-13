// Чтение под экран экипировки: что есть, что надето и что предмет даст ИМЕННО
// этому герою. Разбор считает сервер (explainGear — та же функция, что кормит
// бой), иначе карточка и бой разошлись бы в числах.
import { mcpExec } from "../db/mcpClient";
import { sqlStr } from "./raid-shared";
import { accountOf } from "./user-shared";
import {
  heroSlots,
  normalizeHeroRarity,
  type HeroRarity,
  type HeroSlotDef,
} from "@/lib/hero/heroSlots";
import { heroCombat, heroField, type HeroCombat, type HeroField } from "@/lib/hero/heroPowerCurve";
import { zeroStats } from "@/lib/hero/heroStatSources";
import { heroAlchemy, heroTrade } from "@/lib/hero/heroExtraStats";
import { bestGearFor } from "@/lib/hero/bestGear";
import { artDisabled } from "@/lib/hero/artWear";
import { artLocked } from "@/lib/hero/artBroken";
import { withEnchant } from "@/lib/enchant/enchantGear";
import { enchantPctSql } from "@/server/api/beta-raid/enchant/enchant-sql";
import type { HeroStats } from "@/lib/heroStats";
import { buildHeroPower } from "./beta-raid/hero-power";
import type { LoadedGearPiece, LoadedHero } from "./beta-raid/hero-load";
import { weakenHero, type WeakenMap } from "./beta-raid/hero-weaken";
import { buffHero } from "./beta-raid/hero-buff";
import type { HeroBoosts } from "@/lib/hero/boost";
import {
  buildOptions,
  bySlot,
  itemView,
  type Ctx,
  type GearBlocked,
  type GearItemView,
} from "./heroes-gear-items";

export type { GearBlocked, GearItemView } from "./heroes-gear-items";

// Потолка НЕТ по решению владельца: инвентарь читается целиком.
//
// История: лимит стоял на сырых экземплярах (1000) с сортировкой по имени и
// резал инвентарь по алфавиту — у коллекционера с 1083 артефактами всё, что
// после буквы «Y», исчезало из окна снаряжения, и «Yupik War Sword» перестал
// существовать (жалоба 06.09). Любой потолок рано или поздно повторит это, а
// объём тут посильный: 1083 предмета — это 344 КБ и один запрос.
// Скорость держит индекс (account_id, kind) — migrations/acc-43.

/** По проводам: как HeroCombat, но Set не ездит. Тип ВЫВОДИТСЯ из HeroCombat. */
type CombatView = Omit<HeroCombat, "softImmune"> & { softImmune: string[] };

/** Место под артефакт вместе с тем, что в нём лежит. */
export type GearSlotView = HeroSlotDef & { item: GearItemView | null };

export type HeroGearView = {
  heroId: string | null;
  /** Раса героя не найдена в таблице статов: числа нулевые не просто так. */
  unknownRace: boolean;
  /** У шаблона нет спеца — база по запасному Воину; подпись игроку, что шаблон надо дочинить. */
  specFallback: boolean;
  /** Редкость героя — от неё зависит, сколько у него мест. */
  rarity: HeroRarity;
  /** Места по порядку: у эпика и лега дублей больше, чем у рара. */
  slots: GearSlotView[];
  /** Что можно надеть, по слотам. Надетое сюда не попадает. */
  available: Record<string, GearItemView[]>;
  /** Есть, но надеть нечем: игроку объясняют, почему предмета нет в слотах. */
  noSlot: GearBlocked[];
  base: HeroStats;
  /** Вложенные очки навыков повышенных уровней (база стоит на обычном потолке). */
  skill: HeroStats;
  gear: HeroStats;
  /** Постоянные прибавки ачивок аккаунта (§8.57). */
  ach?: HeroStats;
  /** Временные эффекты: бусты плюсом, ослабления боссов минусом. */
  effects: HeroStats;
  stats: HeroStats;
  combat: CombatView;
  field: HeroField;
  /** Прирост суммы характеристик, если надеть лучшее (0 — уже надето): клиент
   * рисует по нему стрелку, сам он это не посчитает — нет таблицы статов. */
  bestGain: number;
  /** Торговля героя (НЕбоевой стат): уровень Торговца + очки + сумма с артефактов. */
  trade: number;
  /** Алхимия героя (НЕбоевой стат): уровень Ассасина + очки + сумма с артефактов. */
  alchemy: number;
};

/** Колонки артефакта — те же в обоих запросах, чтобы строка И ЕСТЬ GearPiece. */
const GEAR_COLS = `u.id AS "itemId", u.template_id AS "templateId", t.name, t.slot, t.rarity,
        t.image_url AS "imageUrl", t.stat_type AS "statType",
        t.stat_amount::float8 AS "statAmount", t.race, t.race_amount::float8 AS "raceAmount",
        t.specialization, t.spec_amount::float8 AS "specAmount",
        t.land, t.land_amount::float8 AS "landAmount", t.immunities,
            COALESCE(t.fish_bonus_pct, 0)::float8 AS "fishBonusPct",
        lt.name AS "landName", u.wear::float8 AS wear, t.meta->>'mount' AS mount,
        ${enchantPctSql()} AS "enchantPct"`;

/** Имя местности — из её же шаблона: в карточке «Земля terrain_7w9…» нечитаемо. */
const GEAR_JOIN_LAND = `LEFT JOIN yuplink.mystic_item_template lt ON lt.id = t.land`;

async function walletList(wallet: string): Promise<string> {
  return sqlStr(await accountOf(wallet));
}

/**
 * Артефакты аккаунта — ВСЕ. Один запрос на два случая: весь инвентарь и один id
 * (тогда `extra` сужает выборку до одной строки).
 */
async function loadArtifacts(w: string, extra: string): Promise<LoadedGearPiece[]> {
  const rows = (await mcpExec(
    `SELECT ${GEAR_COLS}
       FROM yuplink.user_game_item u
       JOIN yuplink.mystic_item_template t ON t.id = u.template_id
       ${GEAR_JOIN_LAND}
      WHERE u.account_id IN (${await walletList(w)}) AND u.kind = 'artifact' ${extra}
      ORDER BY t.name, u.id;`,
    { wrapJson: true },
  ).catch(() => [])) as LoadedGearPiece[];
  return (rows ?? []).map(withEnchant); // зачарованный — со статами × (1 + pct/100)
}

/** Артефакт игрока по id. null: чужой или такого нет. */
export async function ownedArtifact(w: string, itemId: string): Promise<LoadedGearPiece | null> {
  const rows = await loadArtifacts(w, `AND u.id = ${sqlStr(itemId)}`);
  return rows[0] ?? null;
}

/** ВСЕ артефакты аккаунта, без потолка. */
export const loadOwnedArtifacts = (wallet: string): Promise<LoadedGearPiece[]> =>
  loadArtifacts(wallet, "");

/**
 * Записать экипировку целиком — мест максимум 14, диффы ни к чему. После запуска
 * поломки (art_repair_open) сломанное отбрасывается в самой записи: удар мог снять
 * его, пока набор собирался из прочитанного раньше (§8.63 п.3).
 */
export async function writeEquipped(heroId: string, eq: Record<string, string>): Promise<void> {
  const next = `${sqlStr(JSON.stringify(eq))}::jsonb`;
  const rows = (await mcpExec(
    `UPDATE yuplink.hero_instance
        SET equipped = CASE WHEN EXISTS (SELECT 1 FROM yuplink.settings s
                                          WHERE s.key = 'art_repair_open' AND s.value = 'true')
              THEN (SELECT COALESCE(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
                      FROM jsonb_each_text(${next}) e
                     WHERE NOT EXISTS (SELECT 1 FROM yuplink.user_game_item u
                                        WHERE u.id = e.value AND u.wear >= 100))
              ELSE ${next} END,
            updated_at = now()
      WHERE id = ${sqlStr(heroId)}
      RETURNING id;`,
    { wrapJsonCte: true },
  )) as Array<{ id: string }>;
  if (!rows || rows.length === 0) throw new Error("Герой не найден");
}

/** Ответ «надевать нечего»: флаг выключен либо герой не выбран. */
export function emptyGear(): HeroGearView {
  const zero = zeroStats();
  return {
    heroId: null,
    unknownRace: false,
    specFallback: false,
    rarity: "rare",
    slots: heroSlots("rare").map((d) => ({ ...d, item: null })), // базовая раскладка пустой
    available: bySlot<GearItemView[]>(() => []),
    noSlot: [],
    base: zero,
    skill: zero,
    gear: zero,
    effects: zero,
    stats: zero,
    combat: { ...heroCombat(zero), softImmune: [] },
    field: heroField(zero),
    bestGain: 0,
    trade: 0,
    alchemy: 0,
  };
}

/**
 * Что надето, что даёт и что можно надеть. Через buildHeroPower, а не
 * loadHeroPower: тот на нераспознанной расе отдаёт null, а игроку надо увидеть,
 * ПОЧЕМУ у него нули. */
export function gearView(
  hero: LoadedHero,
  all: LoadedGearPiece[],
  /** Что сейчас сбито боссом — те же пункты, что уносит в бой loadHeroPower. */
  weaken?: WeakenMap,
  /** Временные бусты с алтарей и товаров — то же, что подмешивает бой. */
  buffs?: HeroBoosts,
  /** Механика поломки запущена (§8.63 п.3): сломанное в «лучшее» не кандидат. */
  brokenOn = false,
): HeroGearView {
  const rarity = normalizeHeroRarity(hero.rarity);
  // Сломанный лежит в слоте как есть (полоса на нуле). Выключенный поломкой
  // (artDisabled) статов не даёт: в hero.gear его нет (hero-load), и в лучший
  // набор он не кандидат. Пока ремонта нет — работает как целый.
  const byId = new Map([...hero.gear, ...(hero.broken ?? [])].map((p) => [p.itemId, p]));
  const eq = hero.equipped;
  // Раскладываем ДО подсчёта статов: сумма обязана совпасть с тем, что игрок
  // видит в слотах. Висячую запись не чистим — надевашка перепишет equipped.
  const slots = heroSlots(rarity);
  const filled = slots.map((d) => ({ ...d, piece: byId.get(eq[d.key] ?? "") ?? null }));
  const worn = new Set(filled.map((f) => f.piece?.itemId).filter((v): v is string => !!v));

  // Предмет из «лишнего» места (редкость ниже) не считается, но и НЕ теряется.
  const kept = hero.gear.filter((p) => worn.has(p.itemId));
  const forStats = kept.length === hero.gear.length ? hero : { ...hero, gear: kept };
  const built = buildHeroPower(forStats);
  const unknownRace = built.unknownRace;
  // Ослабление от босса снимает пункты и на этом экране: он и есть то место,
  // где игрок сверяет «−20 брони» с реальностью. Карта эффектов приходит
  // готовой — считает её вызывающий, у которого есть кошелёк.
  // Тот же порядок, что в бою: сначала свои бусты, потом ослабление босса.
  const info = weakenHero(buffHero(built.info, buffs ?? {}), weaken ?? {});
  const ctx: Ctx = { race: info.race, spec: info.spec };
  // На ТЕХ ЖЕ данных, что показываем: иначе стрелка обещала бы предмет не из списка.
  // Сломанный при запущенной механике надеть нельзя — стрелка его не обещает.
  const ok = (p: LoadedGearPiece) => !artDisabled(p.wear) && !artLocked(p.wear, brokenOn);
  const best = bestGearFor({
    slots,
    items: [...all.filter(ok), ...kept.filter(ok)],
    equipped: eq,
    ctx,
  });

  return {
    heroId: info.heroId,
    unknownRace,
    specFallback: built.specFallback,
    rarity,
    ...buildOptions(all, worn, ctx),
    slots: filled.map(({ piece, ...d }) => ({
      ...d,
      item: piece ? itemView(piece, ctx, [piece.itemId]) : null,
    })),
    base: info.base,
    skill: info.skill,
    gear: info.gear,
    ach: info.ach,
    effects: info.effects,
    stats: info.stats,
    combat: { ...info.combat, softImmune: [...info.combat.softImmune] },
    field: info.field,
    bestGain: best.gain,
    // По НАДЕТЫМ артефактам + очки + баффы — как в resolveBackpack: число = ёмкость.
    trade: heroTrade(hero) + (buffs?.trade ?? 0),
    alchemy: heroAlchemy(hero) + (buffs?.alchemy ?? 0),
  };
}
