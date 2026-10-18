// Герой за NFT Heroes of Valdir — из самого NFT (владелец, 17.10.2026):
//   портрет и имя — героя NFT (портрет — картина без рамки карточки, eth_hov_hero);
//   редкость — выпавшая: Лириан — легендарный 100 %, остальные — редкий 90 % / эпический 10 %;
//   раса — по соответствию рас коллекции нашим (HOV_RACE);
//   специализация и способность — случайные.
// Шаблон такого героя неактивен — в боксы, превращения и стартовые наборы он не попадает,
// у владельца при этом живёт как любой герой. Одинаковые сочетания делят один шаблон.
import { nanoid } from "nanoid";
import { SPECIALIZATIONS } from "@/components/heroMeta";
import { HERO_ABILITY_IDS } from "@/lib/hero/heroAbilities";
import { RACE_STATS } from "@/lib/heroStats";
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";

export type HovRarity = "legendary" | "epic" | "rare";

const LEVEL: Record<HovRarity, number> = { legendary: 5, epic: 4, rare: 3 };

/** Расы коллекции → наши (владелец, 17.10.2026). Вихотка в базе — ДраКошка. */
export const HOV_RACE: Record<string, string> = {
  Orc: "Кабан",
  Elf: "Единорог",
  Human: "Юпик",
  Demon: "Дракон",
  Beastman: "ДраКошка",
  Undead: "Пчела",
};

/** Редкость героя за токен: Лириан — легендарный, остальные — 90/10 редкий/эпический. */
export function rollHovRarity(lirian: boolean, rnd: () => number = Math.random): HovRarity {
  if (lirian) return "legendary";
  return rnd() < 0.1 ? "epic" : "rare";
}

const pick = <T>(list: readonly T[], rnd: () => number): T => list[Math.floor(rnd() * list.length)];

export type HovHeroPlan = {
  name: string;
  image: string | null;
  race: string;
  spec: string;
  ability: string;
  rarity: HovRarity;
};

/** Каким будет герой за этот токен. null — раса коллекции без соответствия. */
export function planHovHero(
  token: { heroName: string | null; nftRace: string | null; portrait: string | null; lirian: boolean },
  rnd: () => number = Math.random,
): HovHeroPlan | null {
  const race = HOV_RACE[token.nftRace ?? ""];
  if (!race || !RACE_STATS[race]) return null;
  return {
    name: (token.heroName ?? "").trim() || "Hero of Valdir",
    image: token.portrait,
    race,
    spec: pick(SPECIALIZATIONS, rnd),
    ability: pick(HERO_ABILITY_IDS, rnd),
    rarity: rollHovRarity(token.lirian, rnd),
  };
}

/** Шаблон героя под план: такой же уже есть — он, нет — новый (неактивный). */
export async function hovHeroTemplate(p: HovHeroPlan): Promise<string> {
  const found = ((await mcpExec(
    `SELECT id FROM yuplink.mystic_item_template
      WHERE kind = 'hero' AND meta->'nft'->>'hero' = ${sqlStr(p.name)}
        AND level = ${LEVEL[p.rarity]} AND race = ${sqlStr(p.race)}
        AND specialization = ${sqlStr(p.spec)} AND meta->>'ability' = ${sqlStr(p.ability)}
      LIMIT 1;`,
    { wrapJson: true },
  )) ?? []) as Array<{ id: string }>;
  if (found[0]?.id) return found[0].id;
  const id = `hero_nft_${nanoid(10)}`;
  const meta = JSON.stringify({ ability: p.ability, nft: { collection: "hov", hero: p.name } });
  await mcpExec(
    `INSERT INTO yuplink.mystic_item_template
       (id, kind, name, description, image_url, rarity, level, race, specialization, meta, active, created_at)
     VALUES (${sqlStr(id)}, 'hero', ${sqlStr(p.name)}, 'Heroes of Valdir', ${p.image ? sqlStr(p.image) : "NULL"},
             NULL, ${LEVEL[p.rarity]}, ${sqlStr(p.race)}, ${sqlStr(p.spec)}, ${sqlStr(meta)}::jsonb, false, now());`,
    { wrapJson: false },
  );
  return id;
}
