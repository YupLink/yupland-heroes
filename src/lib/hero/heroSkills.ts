// Очки навыков повышенных уровней (владелец, 02.10.2026): «человек может взять,
// прикачать себе плюс одну торговлю — просто выбрать сам; каждый навык можно
// выбрать». Одно очко — +1 к выбранному навыку. Навыки — шесть статов героя и
// небоевые Торговля и Алхимия. Сколько очков заработано — skillPointsAt
// (heroLevels.ts), что вложено — hero_instance.skills (jsonb «навык → очков»).
import { HERO_STAT_KEYS, type HeroStatKey } from "@/lib/heroStats";
import { skillPointsAt } from "@/lib/heroLevels";

export const HERO_SKILL_KEYS = [...HERO_STAT_KEYS, "trade", "alchemy"] as const;
export type HeroSkillKey = HeroStatKey | "trade" | "alchemy";
export type HeroSkills = Partial<Record<HeroSkillKey, number>>;

export const isSkillKey = (k: string): k is HeroSkillKey =>
  (HERO_SKILL_KEYS as readonly string[]).includes(k);

/** Вложенные очки из базы: только известные навыки, целые ≥ 0. */
export function parseSkills(raw: unknown): HeroSkills {
  let obj: unknown = raw;
  if (typeof raw === "string") {
    try {
      obj = JSON.parse(raw);
    } catch {
      return {};
    }
  }
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return {};
  const out: HeroSkills = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const n = Math.floor(Number(v));
    if (isSkillKey(k) && Number.isFinite(n) && n > 0) out[k] = n;
  }
  return out;
}

/** Сколько очков вложено всего. */
export const skillsSpent = (s: HeroSkills): number =>
  Object.values(s).reduce((a, b) => a + (b ?? 0), 0);

/** Свободные очки: заработано к уровню минус вложено (не меньше нуля). */
export function skillsFree(
  rarity: string | null | undefined,
  level: number,
  skills: HeroSkills,
): number {
  return Math.max(0, skillPointsAt(rarity, level) - skillsSpent(skills));
}

/** Вложенное в навык (0, если не вкладывали). */
export const skillOf = (s: HeroSkills | null | undefined, k: HeroSkillKey): number =>
  Math.max(0, Math.floor(Number(s?.[k]) || 0));
