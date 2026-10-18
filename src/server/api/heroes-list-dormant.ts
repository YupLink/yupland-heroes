// Герои, которые лежат в инвентаре предметом, но экземпляра ещё не имеют.
//
// Экземпляр (hero_instance) заводится лениво — при первой прокачке или при
// превращении фишки. Герой из мистик-бокса до этого живёт только предметом в
// user_game_item, и в списке героев его не было: у владельца 38 предметов, а
// на экране 12 записей — все строители, например, оказались невидимыми.
//
// Отдаём их «спящими»: уровень 0, редкость по ярусу шаблона (5★ легендарный,
// 4★ эпический, иначе редкий) — та же формула, по которой экземпляр создаётся
// при прокачке, чтобы редкость не поменялась в момент пробуждения.
import { heroAbilityOf } from "@/lib/hero/heroAbilities";
import { mcpExec } from "../db/mcpClient";
import { sqlStr } from "./raid-shared";
import { MAX_LEVEL_BY_RARITY, nextLevelCost, type HeroRarity } from "@/lib/heroLevels";
import { heroStatsAt } from "@/lib/heroStats";
import { heroSkillCard } from "./heroes-skill-card";

type Row = {
  item_id: string;
  template_id: string;
  name: string | null;
  image_url: string | null;
  race: string | null;
  specialization: string | null;
  ability: string | null;
  level: number | string | null;
};

/** Редкость по ярусу шаблона — тот же расчёт, что при создании экземпляра.
 *  Common — level 1..2 (стартовые «обычные» герои, из фишек не сделать). */
export function rarityOfTemplateLevel(level: number | null | undefined): HeroRarity {
  const l = Number(level) || 0;
  if (l >= 5) return "legendary";
  if (l >= 4) return "epic";
  if (l >= 3) return "rare";
  return "common";
}

/**
 * Спящие — это КОПИИ предмета, у которых нет своего экземпляра.
 *
 * Раньше список строился по шаблонам: есть хоть один прокачанный герой — все
 * остальные копии того же шаблона исчезали, а прокачка второй копии уходила в
 * первую («перебрасывает на героя, который выше уровнем»). Теперь у каждой
 * копии своя строка и свой id предмета.
 */
export async function listDormantHeroes(account: string) {
  const list = sqlStr(account);
  if (!list) return [];
  // Спящие = копии предмета, у которых своего инста нет. Исключаем ещё и
  // случай, когда у шаблона все инсты «безымянные» (item_id IS NULL — старая
  // связка): один такой инст уже соответствует одной копии, и лишний
  // спящий не нужен, иначе список показывал ЧЕТВЕРЫХ вместо троих
  // (жалоба «нажимаю на 7-й уровень, а показывает 20-й» = второй Zuzu
  // рендерил ключ вместе с первым и путал состояние).
  const rows = (await mcpExec(
    `WITH tpl_stats AS (
       SELECT u.template_id,
              COUNT(*) FILTER (WHERE u.kind = 'hero') AS items,
              (SELECT COUNT(*) FROM yuplink.hero_instance h
                WHERE h.account_id IN (${list})
                  AND h.template_id = u.template_id) AS insts
         FROM yuplink.user_game_item u
        WHERE u.account_id IN (${list}) AND u.kind = 'hero'
        GROUP BY u.template_id
     )
     SELECT u.id AS item_id, u.template_id, t.name, t.image_url, t.race,
            t.specialization, t.meta->>'ability' AS ability, t.level
       FROM yuplink.user_game_item u
       JOIN yuplink.mystic_item_template t ON t.id = u.template_id
       JOIN tpl_stats s ON s.template_id = u.template_id
      WHERE u.account_id IN (${list}) AND u.kind = 'hero'
        AND NOT EXISTS (
          SELECT 1 FROM yuplink.hero_instance h WHERE h.item_id = u.id)
        AND s.insts < s.items
      ORDER BY t.level DESC NULLS LAST, t.name, u.id;`,
    { wrapJson: true },
  ).catch(() => [])) as Row[];

  return (rows ?? []).map((r) => {
    const rarity = rarityOfTemplateLevel(Number(r.level));
    return {
      // id нет: экземпляр появится в момент выбора или первой прокачки.
      id: null as string | null,
      /** Конкретная копия предмета — по ней и будят героя. */
      itemId: r.item_id,
      templateId: r.template_id,
      name: r.name ?? "Герой",
      imageUrl: r.image_url ?? null,
      race: r.race ?? null,
      specialization: r.specialization ?? null,
      /** Способность героя (§8.52); нет — null. */
      ability: heroAbilityOf({ ability: r.ability }),
      rarity,
      level: 0,
      maxLevel: MAX_LEVEL_BY_RARITY[rarity] ?? 20,
      nextCost: nextLevelCost(rarity, 0),
      likesSpent: 0,
      equipped: {} as Record<string, string>,
      stats: heroStatsAt(r.race ?? null, r.specialization ?? null, 0),
      // Те же поля очков, что у поднятых (на нулевом уровне — нули).
      ...heroSkillCard(rarity, 0, null),
      copies: 1,
    };
  });
}
