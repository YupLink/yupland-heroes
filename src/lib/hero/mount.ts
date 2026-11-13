// Конь героя (владелец, 25–26.10.2026; ПРАВИЛА §8.84). Общий модуль сервера и клиента.
//
//  · Конь — артефакт с местом «Конь» (slot шаблона); вид — meta.mount шаблона. Лежит на
//    аккаунте, надет на героя (hero_instance.equipped), продаётся в лавке и скупается
//    ломбардом как любой артефакт; надетого не продать. Не изнашивается, в случайные
//    выдачи (лавки «любой артефакт», турниры, раскладка по карте) не попадает.
//  · Скорость бега по карте: без коня ×0,75 · обычный ×1 · редкий ×1,2 · эпический ×1,5 ·
//    легендарный (единорог) ×1,75 · уникальный (пегас) ×1,75 и прыгает через клетку.
//    «Без коня» — то, что у всех было до 26.10: коней не выдаём («по факту да, медленнее»).
//  · Прыжок пегаса — на 2 клетки по прямой через ЛЮБУЮ клетку, если есть куда встать;
//    10 энергии («стоит 10 энергии»).
//  · Зачарование коня (§8.87; владелец 03.11.2026: «по коню — буст тоже надо учитывать»)
//    множит его скорость, как характеристики артефакта: эпический ×1,5 с +20 % — ×1,8.
//    Минус-зачарование медленнее «без коня» не делает (не ниже ×0,75).

/** Место коня у героя — ключ в hero_instance.equipped и slot шаблона. */
export const MOUNT_SLOT = "Конь";

export type MountTier = "none" | "common" | "rare" | "epic" | "legendary" | "unique";

/** Виды коня, что ставит админ (meta.mount шаблона); «none» — нет коня. */
export const MOUNT_TIERS: readonly Exclude<MountTier, "none">[] = [
  "common",
  "rare",
  "epic",
  "legendary",
  "unique",
];

/** Во сколько раз быстрее базы (обычный конь) бежит герой. */
export const MOUNT_SPEED: Record<MountTier, number> = {
  none: 0.75,
  common: 1,
  rare: 1.2,
  epic: 1.5,
  legendary: 1.75,
  unique: 1.75,
};

/** Скорость коня с зачарованием pct, % (до двух знаков); без коня — ×0,75 всегда. */
export function mountSpeed(tier: MountTier, pct = 0): number {
  if (tier === "none") return MOUNT_SPEED.none;
  const boost = Number.isFinite(pct) ? pct : 0;
  const v = Math.round(MOUNT_SPEED[tier] * (1 + boost / 100) * 100) / 100;
  return Math.max(MOUNT_SPEED.none, v);
}

/** Шаг обычного коня — прежний шаг всех героев до коней. */
export const BASE_STEP_MS = 190;

/** Цена прыжка пегаса (без скидок и надбавок; остров режет, как всё). */
export const JUMP_ENERGY = 10;

/** Вид коня из meta шаблона; незнакомое или пусто — null (не конь). */
export function mountTierOfMeta(meta: unknown): Exclude<MountTier, "none"> | null {
  const raw = (meta as { mount?: unknown } | null)?.mount;
  return MOUNT_TIERS.find((t) => t === raw) ?? null;
}

/** Вид из строки (ответ сервера, кэш); незнакомое — «без коня». */
export const mountTier = (raw: unknown): MountTier =>
  raw === "none" ? "none" : (mountTierOfMeta({ mount: raw }) ?? "none");

/** Сколько длится шаг героя на карте, мс (с зачарованием коня pct, %). */
export const mountStepMs = (tier: MountTier, pct = 0): number =>
  Math.round(BASE_STEP_MS / mountSpeed(tier, pct));

/** Прыгает ли через клетку (только пегас). */
export const mountJumps = (tier: MountTier): boolean => tier === "unique";

/** Окно тормоза частоты шагов на сервере. */
export const STEP_WINDOW_MS = 3_000;

/**
 * Сколько шагов за окно пускает сервер: темп коня с запасом 15 % на разброс сети и ещё
 * 9 — на шаги, отправленные наперёд (клиент держит впереди до 2 пачек по 4, +1 на стык
 * окон). Без коня — 23, обычный — 28, пегас — 41. Скрипт быстрее своего коня не побежит.
 */
export const stepRateLimit = (tier: MountTier, pct = 0): number =>
  Math.ceil((STEP_WINDOW_MS / mountStepMs(tier, pct)) * 1.15) + 9;

type Hex = { q: number; r: number };

const DIRS: readonly Hex[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

/** Прыжок: ровно 2 клетки по прямой (через одну); не прыжок — null, иначе клетка под прыжком. */
export function jumpOver(from: Hex, to: Hex): Hex | null {
  const d = DIRS.find((x) => from.q + 2 * x.q === to.q && from.r + 2 * x.r === to.r);
  return d ? { q: from.q + d.q, r: from.r + d.r } : null;
}

/** Подпись скорости: «×1,5»; с зачарованием — уже умноженная («×1,8»). */
export const mountSpeedLabel = (tier: MountTier, lang: "ru" | "en", pct = 0): string =>
  `×${String(mountSpeed(tier, pct)).replace(".", lang === "ru" ? "," : ".")}`;
