// Откуда герой берётся в бете: строка выбранного героя и шаблоны надетого.
// Чтение и только чтение — гейт и кэш живут в hero-power.ts.
//
// Экипировка лежит в hero_instance.equipped ({«Слот»: id_предмета}): своей
// таблицы под слоты мы не заводили. Отсюда главное свойство загрузчика — он
// обязан пережить висячий id. Предмет сожгли, продали или увели на другой
// кошелёк: бонуса нет, бой из-за этого не падает.
import { heroAbilityOf, type HeroAbility } from "@/lib/hero/heroAbilities";
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { raidOwner } from "./owner";
import { SQUAD_SLOTS } from "../heroes-squad";
import type { GearPiece } from "@/lib/hero/heroStatSources";
import { parseSkills, type HeroSkills } from "@/lib/hero/heroSkills";
import type { SquadEntry } from "@/lib/heroSquadMatch";
import { achievementBonus, parseAchCounts, type AchBonus } from "@/lib/achievements/tracks";
import { artDisabled } from "@/lib/hero/artWear";
import { withEnchant } from "@/lib/enchant/enchantGear";
import { enchantPctSql } from "@/server/api/beta-raid/enchant/enchant-sql";

/** Надетый артефакт: числа для статов плюс данные для карточки слота. */
export type LoadedGearPiece = GearPiece & {
  itemId: string;
  templateId: string;
  imageUrl: string | null;
  rarity: string | null;
  /**
   * Сколько ВСЕГО таких предметов у игрока. Из инвентаря тянутся не все
   * экземпляры одного шаблона (надеть можно максимум по числу слотов), но
   * показать в списке надо честное количество.
   */
  dupTotal?: number;
  /** Человеческое имя земли из шаблона местности (id в карточке нечитаем). */
  landName?: string | null;
  /** Износ, % снятого (user_game_item.wear): 100 — сломан; даёт ли что-то — artDisabled. */
  wear?: number;
  /** Вид коня (meta.mount шаблона, §8.84); не конь — пусто. */
  mount?: string | null;
  /** Зачарование экземпляра, % (item_enchant): числа выше уже умножены (withEnchant). */
  enchantPct?: number | null;
};

export type LoadedHero = {
  heroId: string;
  name: string;
  imageUrl: string | null;
  race: string | null;
  spec: string | null;
  level: number;
  rarity: string;
  /** Вложенные очки навыков повышенных уровней (hero_instance.skills). */
  skills: HeroSkills;
  /** Как лежит в базе: слот → id предмета. Висячие id тоже здесь. */
  equipped: Record<string, string>;
  /** Рабочие надетые предметы, что нашлись у игрока. Сломанный — тоже, пока нет штрафа. */
  gear: LoadedGearPiece[];
  /** Надетые, но выключенные поломкой (artDisabled): в слоте, статов не дают. До ремонта — пусто. */
  broken?: LoadedGearPiece[];
  squad: SquadEntry[];
  /** Сытость (hero_instance.satiety): пусто — шкала полная (lib/hero/satiety). */
  satiety?: number | null;
  /** Прибавки ачивок аккаунта (§8.57) — постоянные, всем героям аккаунта. */
  achBonus?: AchBonus;
  /** Способность шаблона (meta.ability, lib/hero/heroAbilities); нет — null. */
  ability?: HeroAbility | null;
};

/** numeric из БД приходит и числом, и строкой — приводим руками. */
type SqlNum = number | string | null;
type Str = string | null;
type HeroSqlRow = {
  id: string;
  level: SqlNum;
  satiety?: SqlNum;
  rarity: Str;
  skills: unknown;
  equipped: unknown;
  squad: unknown;
  name: Str;
  image_url: Str;
  race: Str;
  specialization: Str;
  ability?: Str;
  ach?: unknown;
};
/**
 * Колонки берём сразу в camelCase и numeric приводим к числу в самом SQL —
 * тогда строка ответа И ЕСТЬ LoadedGearPiece, и перекладывать её незачем.
 */
type GearSqlRow = LoadedGearPiece;

const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);
/** Слот → id предмета. Всё, что не пара строк, молча отбрасываем. */
export function parseEquipped(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [slot, id] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof id === "string" && id.trim()) out[slot] = id.trim();
  }
  return out;
}

/** Отряд из jsonb. Мусорные записи выбрасываем, чтобы бой не спотыкался. */
function parseSquad(raw: unknown): SquadEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: SquadEntry[] = [];
  for (const it of raw) {
    if (!it || typeof it !== "object") continue;
    const o = it as Record<string, unknown>;
    const templateId = typeof o.templateId === "string" ? o.templateId.trim() : "";
    if (!templateId) continue;
    out.push({
      templateId,
      level: num(o.level),
      serialNo: o.serialNo == null ? null : num(o.serialNo),
    });
  }
  return out.slice(0, SQUAD_SLOTS);
}

/** Владелец в SQL-виде: аккаунт игрока. */
async function walletList(wallet: string): Promise<string> {
  return sqlStr(await raidOwner(wallet));
}

/** Шаблоны надетых предметов. Чужое и исчезнувшее сюда не попадает. */
async function loadGear(
  itemIds: string[],
  list: string,
  strict = false,
): Promise<LoadedGearPiece[]> {
  if (itemIds.length === 0) return [];
  const ids = itemIds.map(sqlStr).join(",");
  const rows = (await mcpExec(
    `SELECT u.id AS "itemId", u.template_id AS "templateId", t.name, t.slot, t.rarity,
            t.image_url AS "imageUrl", t.stat_type AS "statType",
            t.stat_amount::float8 AS "statAmount", t.race, t.race_amount::float8 AS "raceAmount",
            t.specialization, t.spec_amount::float8 AS "specAmount",
            t.land, t.land_amount::float8 AS "landAmount", t.immunities,
            COALESCE(t.fish_bonus_pct, 0)::float8 AS "fishBonusPct", u.wear::float8 AS wear,
            ${enchantPctSql()} AS "enchantPct"
       FROM yuplink.user_game_item u
       JOIN yuplink.mystic_item_template t ON t.id = u.template_id
      WHERE u.id IN (${ids}) AND u.account_id IN (${list});`,
    { wrapJson: true },
  ).catch((error) => {
    if (strict) throw error;
    return [];
  })) as GearSqlRow[];
  // Зачарованный экземпляр (лавка зачарования) — статы × (1 + pct/100) вверх.
  return (rows ?? []).map(withEnchant);
}

/** Выбранный герой аккаунта. */
export async function loadSelectedHero(wallet: string): Promise<LoadedHero | null> {
  return loadHero(wallet);
}

/** Explicit read: never selects or wakes a hero. Ownership is checked in the SQL. */
export async function loadOwnedHero(wallet: string, heroId: string): Promise<LoadedHero> {
  if (!heroId.trim()) throw new Error("Hero unavailable / Герой недоступен");
  const hero = await loadHero(wallet, heroId);
  if (!hero) throw new Error("Hero unavailable / Герой недоступен");
  return hero;
}

async function loadHero(wallet: string, heroId?: string): Promise<LoadedHero | null> {
  const list = await walletList(wallet);
  const rows = (await mcpExec(
    `SELECT h.id, h.level, h.rarity, h.skills, h.equipped, h.squad, h.satiety,
            t.name, t.image_url, t.race, t.specialization, t.meta->>'ability' AS ability,
            (SELECT jsonb_object_agg(a.track, a.count) FROM yuplink.account_achievement a
              WHERE a.account_id = h.account_id) AS ach
       FROM yuplink.hero_instance h
       LEFT JOIN yuplink.mystic_item_template t ON t.id = h.template_id
      WHERE h.account_id IN (${list}) AND ${heroId ? `h.id = ${sqlStr(heroId)}` : "h.selected_at IS NOT NULL"}
      ORDER BY h.selected_at DESC LIMIT 1;`,
    { wrapJson: true },
  ).catch((error) => {
    if (heroId) throw error;
    return [];
  })) as HeroSqlRow[];

  const row = rows?.[0];
  if (!row) return null;

  const equipped = parseEquipped(row.equipped);
  // Статы, иммунитеты, рыбалка/торговля/алхимия считаются от gear, поэтому
  // выключенный поломкой делим здесь, в одной точке. Пока ремонта нет, штрафа
  // нет (BROKEN_ART_PENALTY, владелец 23.10): сломанный работает как целый.
  const pieces = await loadGear(Object.values(equipped), list, !!heroId);
  return {
    heroId: row.id,
    name: row.name ?? "Герой",
    imageUrl: row.image_url ?? null,
    race: row.race ?? null,
    spec: row.specialization ?? null,
    level: num(row.level),
    rarity: row.rarity ?? "common",
    skills: parseSkills(row.skills),
    equipped,
    gear: pieces.filter((p) => !artDisabled(p.wear)),
    broken: pieces.filter((p) => artDisabled(p.wear)),
    squad: parseSquad(row.squad),
    satiety: row.satiety == null ? null : Number(row.satiety),
    achBonus: achievementBonus(parseAchCounts(row.ach)),
    ability: heroAbilityOf({ ability: row.ability }),
  };
}
