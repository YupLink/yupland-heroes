// Откуда у героя берутся числа: раса со специализацией и надетые артефакты.
//
// Модуль боевой: его зовут effectiveHeroStats и через него — hero-power.ts.
// Чистые функции, БД и сети не касается, поэтому числа можно проверять
// скриптом (scripts/check-hero-power.ts) без поднятия приложения.
//
// Два разнобоя, которые модуль обязан пережить:
//   • раса в базе бывает старым именем («Кабаны»), а RACE_STATS знает только
//     новое («Кабан») — heroStatsAt на таком имени молча отдаёт нули;
//   • стат артефакта хранится по-английски и тоже с легаси («Strength»).
import { HERO_STAT_KEYS, type HeroStatKey, type HeroStats } from "@/lib/heroStats";

/** Эффекты боссов, от которых артефакт может дать защиту. */
export type HeroImmunity = "poison" | "stun" | "slow" | "burn_energy";

/** Небоевые статы артефакта: в бой не идут, растят рюкзак и сумку зелий. */
export type ExtraStatKey = "trade" | "alchemy";
const EXTRA_STATS: readonly string[] = ["trade", "alchemy"];

/** Старые названия рас из базы → ключи RACE_STATS. */
const RACE_ALIAS: Record<string, string> = {
  Кабаны: "Кабан",
  Драконы: "Дракон",
  Пчелы: "Пчела",
  "Драконо кошки": "ДраКошка",
  Вихотка: "ДраКошка",
};

/** Раса как её знает таблица статов. Пустое имя остаётся пустым. */
export function normalizeRace(race: string | null | undefined): string | null {
  const v = (race ?? "").trim();
  if (!v) return null;
  return RACE_ALIAS[v] ?? v;
}

/** Специализация: алиасов пока нет, но точка нормализации нужна одна. */
export function normalizeSpec(spec: string | null | undefined): string | null {
  const v = (spec ?? "").trim();
  return v || null;
}

/**
 * Стат артефакта → ключ характеристики героя. Канон — шесть английских имён
 * (heroMeta.ARTIFACT_STATS), остальные три живут в старых артефактах.
 */
export const ARTIFACT_STAT_TO_KEY: Record<string, HeroStatKey> = {
  attack: "atk",
  armor: "arm",
  intellect: "int",
  speed: "spd",
  health: "hp",
  luck: "luck",
  // Легаси: убраны из конструктора, но лежат в уже созданных артефактах.
  strength: "atk",
  damage: "atk",
  agility: "spd",
};

/** Иммунитет артефакта → способность босса (heroMeta.IMMUNITIES ↔ AbilityKind). */
export const IMMUNITY_TO_EFFECT: Record<string, HeroImmunity> = {
  Яд: "poison",
  Оглушение: "stun",
  Замедление: "slow",
  "Выжигание энергии": "burn_energy",
};

/** Артефакт так, как он лежит в mystic_item_template. */
export type GearPiece = {
  itemId?: string | null;
  name?: string | null;
  slot?: string | null;
  statType?: string | null;
  statAmount?: number | null;
  race?: string | null;
  raceAmount?: number | null;
  specialization?: string | null;
  specAmount?: number | null;
  land?: string | null;
  landAmount?: number | null;
  immunities?: string[] | null;
  /** Бонус к рыбалке, % к базе шанса (владелец, 14.10.2026). 0 — нет. */
  fishBonusPct?: number | null;
};

/** Из чего сложилась прибавка: основной стат и три условных бонуса. */
export type GearPartKind = "base" | "spec" | "race" | "land";

/**
 * Почему условная часть не сработала. Код, а не текст: строку игроку рисует
 * клиент на своём языке, а на сервере переводить нечем.
 *   mismatch        — раса/специализация/земля не та, что у героя;
 *   land_unsupported — землю клетки в силу героя пока не передают вообще.
 */
export type GearPartReason = "mismatch" | "land_unsupported";

/**
 * Одна строка карточки артефакта: сколько НАПИСАНО на предмете и достанется
 * ли это ЭТОМУ герою. Игрок должен видеть обе цифры сразу — иначе «Маг +2» на
 * герое-Воине выглядит работающим бонусом.
 */
export type GearPart = {
  kind: GearPartKind;
  statKey: HeroStatKey | ExtraStatKey;
  /** Значение с предмета: «Маг», «Единорог», «Горы». У основного стата null. */
  label: string | null;
  amount: number;
  applied: boolean;
  reason: GearPartReason | null;
};

/** Кому считаем: раса и специализация героя, земля клетки (пока не приходит). */
export type GearCtx = { race: string | null; spec: string | null; land?: string | null };

/** Разбор одного предмета. total — сколько реально достанется герою. */
export type GearBreakdown = {
  key: HeroStatKey | null;
  /** Небоевой стат (Торговля/Алхимия): key тогда null, total — его прибавка. */
  extra?: ExtraStatKey | null;
  parts: GearPart[];
  total: number;
  /** Что из условного применилось: раса, специализация, земля. */
  applied: string[];
  /** Почему предмет не дал ничего (для админского разбора). */
  reason: string | null;
};

/** Строка разбора: сколько дал предмет и почему условный бонус не сработал. */
export type GearLine = GearBreakdown & {
  itemId: string | null;
  name: string | null;
  slot: string | null;
  /** Сумма применённого — то же, что total; поле осталось от прежней формы. */
  amount: number;
};

const num = (v: number | null | undefined): number => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** Пустой набор характеристик — общий ноль для сложения. */
export function zeroStats(): HeroStats {
  const out = {} as HeroStats;
  for (const k of HERO_STAT_KEYS) out[k] = 0;
  return out;
}

/**
 * Что дают надетые артефакты. Условные бонусы (за расу, специализацию и
 * землю) идут в ТУ ЖЕ характеристику, что и основной стат предмета — так это
 * читается в карточке артефакта: «Маг (+1 Броня)».
 */
export function sumGearStats(
  gear: GearPiece[],
  ctx: GearCtx,
): { stats: HeroStats; immune: Set<HeroImmunity>; lines: GearLine[] } {
  const stats = zeroStats();
  const immune = new Set<HeroImmunity>();
  const lines: GearLine[] = [];

  for (const it of gear) {
    for (const im of it.immunities ?? []) {
      const eff = IMMUNITY_TO_EFFECT[(im ?? "").trim()];
      if (eff) immune.add(eff);
    }
    const b = explainGear(it, ctx);
    if (b.key) stats[b.key] += b.total;
    lines.push({
      ...b,
      itemId: it.itemId ?? null,
      name: it.name ?? null,
      slot: it.slot ?? null,
      amount: b.total,
    });
  }
  return { stats, immune, lines };
}

/**
 * Разбор ОДНОГО артефакта относительно героя.
 *
 * Считает и сумма статов для боя, и экран экипировки в замке — одним кодом,
 * иначе карточка предмета обещала бы одно, а бой давал другое.
 *
 * Части с нулевой прибавкой не отдаём: строка «Раса Единорог +0» — шум,
 * которого нет и на самом предмете.
 */
export function explainGear(it: GearPiece, ctx: GearCtx): GearBreakdown {
  // Торговля и Алхимия — НЕбоевые: в характеристики героя не идут (key=null),
  // но складываются по тем же правилам — основа + бонусы за расу/спец/землю.
  const raw = (it.statType ?? "").trim().toLowerCase();
  const extra = (EXTRA_STATS.includes(raw) ? raw : null) as ExtraStatKey | null;
  const key = extra ? undefined : ARTIFACT_STAT_TO_KEY[raw];
  if (!key && !extra) {
    return {
      key: null,
      parts: [],
      total: 0,
      applied: [],
      reason: it.statType ? `неизвестный стат «${it.statType}»` : "стат не задан",
    };
  }

  const statKey = (key ?? extra) as HeroStatKey | ExtraStatKey;
  const parts: GearPart[] = [];
  const applied: string[] = [];
  const add = (
    kind: GearPartKind,
    label: string | null,
    amount: number,
    ok: boolean,
    reason: GearPartReason | null,
  ) => {
    if (amount) parts.push({ kind, statKey, label, amount, applied: ok, reason: ok ? null : reason });
  };

  // Основной стат работает всегда — с него и начинается сумма.
  let total = num(it.statAmount);
  add("base", null, total, true, null);

  const race = (it.race ?? "").trim();
  if (race) {
    const hit = normalizeRace(race) === ctx.race;
    add("race", race, num(it.raceAmount), hit, "mismatch");
    if (hit) {
      total += num(it.raceAmount);
      applied.push("раса");
    }
  }
  const spec = (it.specialization ?? "").trim();
  if (spec) {
    const hit = normalizeSpec(spec) === ctx.spec;
    add("spec", spec, num(it.specAmount), hit, "mismatch");
    if (hit) {
      total += num(it.specAmount);
      applied.push("специализация");
    }
  }
  const land = (it.land ?? "").trim();
  if (land) {
    // Землю клетки в силу героя не передают (герой ходит, а сила кэшируется) —
    // поэтому бонус «на своей земле» честно помечается невыданным.
    const here = (ctx.land ?? "").trim();
    const hit = !!here && here === land;
    add("land", land, num(it.landAmount), hit, here ? "mismatch" : "land_unsupported");
    if (hit) {
      total += num(it.landAmount);
      applied.push("земля");
    }
  }

  const reason = total === 0 ? "нулевая прибавка" : null;
  return { key: key ?? null, extra, parts, total, applied, reason };
}
