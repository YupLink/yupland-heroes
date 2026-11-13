// ИММУНИТЕТ как эффект зелья/заклинания/алтаря: пока висит, способность врага
// выбранного вида к герою не применяется — ровно как иммунитет от надетой вещи
// (HeroCombat.softImmune → resistedChance/resistedMinutes).
//
// Список видов НЕ пишется руками: он берётся из каталога способностей
// (ABILITY_KINDS), и новый дебафф босса попадает сюда сам, без правки кода.
// Исключений два: «Удар по всем» — это урон по передовой, а не дебафф, и
// иммунитет к нему обнулял бы сам удар босса; «Снятие иммунитетов» —
// иммунитета к нему нет по слову владельца (22.10.2026).
//
// Пункт «Все» хранится как вид "all" и раскрывается при ЧТЕНИИ: зелье «ко
// всему», выпитое сегодня, закроет и дебафф, который добавят завтра.
//
// Висящий дебафф иммунитет НЕ снимает (правило владельца 21.09): он лишь
// не даёт наложиться новому.
import { ABILITY_KINDS, ABILITY_META, type AbilityKind } from "@/server/api/beta-raid/abilities";
import { dict as braidDict } from "@/lib/translations/braid";
import { dict as fxDict } from "@/lib/translations/braid-boost-fx";

export const IMMUNE_ALL = "all" as const;

/** Что можно выбрать в эффекте: конкретный дебафф или «все». */
export type ImmuneTarget = AbilityKind | typeof IMMUNE_ALL;

/**
 * Дебаффы, к которым бывает иммунитет, — всё из каталога, кроме урона и
 * «Снятия иммунитетов»: иммунитета к нему нет (владелец, 22.10.2026), и «Все»
 * его тоже не закрывает.
 */
export const IMMUNE_KINDS: AbilityKind[] = ABILITY_KINDS.filter(
  (k) => k !== "cleave" && k !== "strip_immune",
);

/** Варианты для выпадающего списка админа: «Все» первым, дальше каталог. */
export const IMMUNE_TARGETS: ImmuneTarget[] = [IMMUNE_ALL, ...IMMUNE_KINDS];

export const isImmuneTarget = (v: unknown): v is ImmuneTarget =>
  typeof v === "string" && (IMMUNE_TARGETS as string[]).includes(v);

/** Вид строки в beta_raid_player_effects: immune_poison, immune_all. */
export const IMMUNE_PREFIX = "immune_";
export const immuneEffectKind = (t: ImmuneTarget): string => `${IMMUNE_PREFIX}${t}`;

/** Обратно: вид строки → цель. Чужое или устаревшее — null. */
export function immuneTargetOf(kind: string): ImmuneTarget | null {
  if (!kind.startsWith(IMMUNE_PREFIX)) return null;
  const t = kind.slice(IMMUNE_PREFIX.length);
  return isImmuneTarget(t) ? t : null;
}

/** Набор видов способностей, закрытых активными иммунитетами. */
export function expandImmune(targets: Iterable<ImmuneTarget>): Set<AbilityKind> {
  const out = new Set<AbilityKind>();
  for (const t of targets) {
    if (t === IMMUNE_ALL) for (const k of IMMUNE_KINDS) out.add(k);
    else if (IMMUNE_KINDS.includes(t)) out.add(t);
  }
  return out;
}

/** Название цели: «Яд» / «Poison», «Все дебаффы» / «All debuffs». */
export function immuneTargetLabel(t: ImmuneTarget, lang: "ru" | "en"): string {
  if (t === IMMUNE_ALL) return fxDict["braid.immune_all"][lang];
  const tr = braidDict[`braid.ab_${t}`];
  return tr?.[lang] ?? ABILITY_META[t]?.label ?? t;
}

/** «Иммунитет: Яд» / «Immunity: Poison» — одна подпись на тост, товар и значок. */
export const immuneText = (t: ImmuneTarget, lang: "ru" | "en"): string =>
  fxDict["braid.immune_to"][lang].replace("{name}", immuneTargetLabel(t, lang));
