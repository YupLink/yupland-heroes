// Очки навыков повышенных уровней: игрок кладёт одно очко в выбранный навык
// (владелец, 02.10.2026: «прикачать себе плюс одну торговлю — просто выбрать
// сам; каждый навык можно выбрать»). Сброса нет: вложенное только растёт.
//
// Лайков очко не стоит и отдых героя ему не мешает — это не прокачка за лайки,
// а распределение уже заработанного. Гейт тот же, что у прокачки.
//
// Запись — один UPDATE с условием (CAS): навык всё ещё равен from, и свободное
// очко есть. Заработанное (earned) считаем в TS по строке, прочитанной ДО
// апдейта: уровень только растёт, так что константа не обманет. Повтор (мост
// переслал, двойной тап) приходит с тем же from — навык уже from+1, это успех.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mcpExec } from "../db/mcpClient";
import { sqlStr } from "./raid-shared";
import { accountOf } from "./user-shared";
import { requireHeroLevelUp } from "./heroes-shared";
import { skillPointsAt } from "@/lib/heroLevels";
import {
  HERO_SKILL_KEYS,
  isSkillKey,
  parseSkills,
  skillOf,
  skillsFree,
  type HeroSkillKey,
  type HeroSkills,
} from "@/lib/hero/heroSkills";
import { normalizeHeroRarity } from "@/lib/hero/heroSlots";

/** Сброс кэша силы героя — через import(), как в heroes-level.ts (кольцо модулей). */
const heroPowerApi = () => import("./beta-raid/hero-power");

export const SKILL_CHANGED = "hero.skill_changed";
export const SKILL_NO_POINTS = "hero.skill_no_points";
const HERO_NOT_FOUND = "hero.not_found";

export type SpendSkillResult = { ok: true; skills: HeroSkills; free: number; earned: number };

type HeroSkillRow = { id: string; account_id: string; rarity: string; level: number; skills: unknown };

/** Целое ≥ 0 из текста jsonb; мусор — ноль (как parseSkills). */
const intSql = (txt: string) => `CASE WHEN ${txt} ~ '^[0-9]+$' THEN (${txt})::int ELSE 0 END`;

/** Вложено всего — в SQL, только известные навыки (как skillsSpent ∘ parseSkills). */
const SPENT_SQL = `(SELECT COALESCE(SUM(${intSql("v.value")}), 0)
    FROM jsonb_each_text(h.skills) v
   WHERE v.key IN (${HERO_SKILL_KEYS.map(sqlStr).join(", ")}))`;

/**
 * Один CAS: навык ещё равен from, и после +1 вложенного не больше earned.
 * 0 строк — либо уже применено (повтор), либо очко ушло/навык изменился.
 */
export function spendSkillSql(a: {
  heroId: string;
  account: string;
  skill: HeroSkillKey;
  from: number;
  earned: number;
}): string {
  const key = sqlStr(a.skill);
  const from = Math.max(0, Math.floor(a.from));
  return `UPDATE yuplink.hero_instance h
      SET skills = jsonb_set(h.skills, ARRAY[${key}], to_jsonb(${from + 1})), updated_at = now()
    WHERE h.id = ${sqlStr(a.heroId)} AND h.account_id = ${sqlStr(a.account)}
      AND jsonb_typeof(h.skills) = 'object'
      AND ${intSql(`COALESCE(h.skills->>${key}, '0')`)} = ${from}
      AND ${SPENT_SQL} + 1 <= ${Math.floor(a.earned)}
    RETURNING h.skills;`;
}

/** Строка героя: владелец, редкость, уровень и вложенное. */
async function readHero(heroId: string): Promise<HeroSkillRow | null> {
  const rows = (await mcpExec(
    `SELECT id, account_id, rarity, level, skills
       FROM yuplink.hero_instance WHERE id = ${sqlStr(heroId)};`,
    { wrapJson: true },
  )) as HeroSkillRow[];
  return rows?.[0] ?? null;
}

/**
 * Что делать с запросом при таком состоянии героя: уже применено (повтор),
 * навык изменился, очков нет — или можно класть.
 */
export function judgeSpend(
  row: Pick<HeroSkillRow, "rarity" | "level" | "skills">,
  skill: HeroSkillKey,
  from: number,
): "done" | "changed" | "no_points" | "go" {
  const skills = parseSkills(row.skills);
  const cur = skillOf(skills, skill);
  if (cur === from + 1) return "done";
  if (cur !== from) return "changed";
  if (skillsFree(normalizeHeroRarity(row.rarity), Number(row.level), skills) <= 0) return "no_points";
  return "go";
}

/** Ответ клиенту по актуальному вложенному. */
function result(row: Pick<HeroSkillRow, "rarity" | "level">, raw: unknown): SpendSkillResult {
  const rarity = normalizeHeroRarity(row.rarity);
  const skills = parseSkills(raw);
  const earned = skillPointsAt(rarity, Number(row.level));
  return { ok: true, skills, free: skillsFree(rarity, Number(row.level), skills), earned };
}

const fail = (v: "changed" | "no_points"): never => {
  throw new Error(v === "no_points" ? SKILL_NO_POINTS : SKILL_CHANGED);
};

type SpendInput = { heroId: string; skill: HeroSkillKey; from: number };

/** Проверка, CAS и разбор исхода. Повтор (навык уже from+1) — успех без записи. */
async function applySpend(hero: HeroSkillRow, account: string, d: SpendInput) {
  const before = judgeSpend(hero, d.skill, d.from);
  if (before === "done") return result(hero, hero.skills);
  if (before !== "go") return fail(before);

  const earned = skillPointsAt(normalizeHeroRarity(hero.rarity), Number(hero.level));
  const rows = (await mcpExec(
    spendSkillSql({ heroId: hero.id, account, skill: d.skill, from: d.from, earned }),
    { wrapJsonCte: true },
  )) as Array<{ skills: unknown }>;
  if (rows?.[0]) return result(hero, rows[0].skills);

  // Между чтением и записью кто-то успел: перечитываем и решаем заново.
  const now = await readHero(hero.id);
  if (!now) throw new Error(HERO_NOT_FOUND);
  const after = judgeSpend(now, d.skill, d.from);
  if (after !== "done") return fail(after === "go" ? "changed" : after);
  return result(now, now.skills);
}

/** Вложить одно очко навыка в героя. */
export const spendSkillPoint = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        heroId: z.string().min(1),
        // Навык — только из списка: в SQL он идёт ключом jsonb.
        skill: z.custom<HeroSkillKey>((v) => typeof v === "string" && isSkillKey(v)),
        /** Сколько было вложено в навык, когда игрок нажал «+». */
        from: z.number().int().min(0),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<SpendSkillResult> => {
    const wallet = await requireHeroLevelUp();
    const account = await accountOf(wallet);

    const hero = await readHero(data.heroId);
    if (!hero) throw new Error(HERO_NOT_FOUND);
    if (hero.account_id !== account) throw new Error("hero.not_yours");

    const out = await applySpend(hero, account, data);
    // Статы, Торговля и Алхимия выросли — бой, цена шага и рюкзак должны
    // увидеть это сразу, а не через 15 секунд кэша (как после прокачки).
    const { invalidateHeroPower } = await heroPowerApi();
    invalidateHeroPower(wallet);
    return out;
  });
