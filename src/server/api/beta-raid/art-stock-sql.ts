// SQL-кирпичи инвентаря артефактов — вынесено из art-stock.ts (правило ≤250
// строк): там остались сами операции (список, снятие, возврат, выдача), здесь —
// общие куски запросов, одинаковые у всех четырёх.
import { sqlStr } from "../raid-shared";
import { droppable, notMount } from "../craft/crafted-sql";

/** Чем ограничен выбор: редкостью, конкретным шаблоном, износом. wear задан —
 *  только экземпляры ровно с ним (маркет берёт целые: 0; ломбард — выбранную
 *  игроком группу, market-art-pay). */
export type ArtPick = {
  rarity?: string | null;
  templateId?: string | null;
  wear?: number | null;
  /** Зачарование (§8.87): не задано — любые; null — только незачарованные; число — только с
   *  этим процентом (аукцион, 31.10.2026: зачарованный уходит лотом отдельно, со своим ✦). */
  enchantPct?: number | null;
};

/** Условие по зачарованию экземпляра u; не задано — пусто (любые). */
export function enchantNarrowSql(pct: number | null | undefined): string {
  if (pct === undefined) return "";
  const has = (extra: string) =>
    `EXISTS (SELECT 1 FROM yuplink.item_enchant e WHERE e.item_id = u.id${extra})`;
  return pct === null ? `NOT ${has("")}` : has(` AND e.pct = ${Math.round(Number(pct) || 0)}`);
}

/** Сколько штук снять по одной группе выбора (ломбард сдаёт несколько групп разом). */
export type ArtTake = { pick: ArtPick; qty: number };

export const wearSql = (w: unknown): string => String(Math.max(0, Math.min(100, Number(w) || 0)));

export const int = (n: number): number => Math.max(0, Math.floor(Number(n) || 0));

/** Надетое ЭТИМ аккаунтом: значения hero_instance.equipped всех его героев. */
export const wornSql = (account: string): string =>
  `SELECT e.value AS item_id
     FROM yuplink.hero_instance h, jsonb_each_text(h.equipped) e
    WHERE h.account_id = ${sqlStr(account)} AND h.equipped IS NOT NULL`;

/** Условие «свободный артефакт аккаунта» + сужение выбора. Без сужения — все.
 *  Артефакт из лаборатории (§8.81) свободным не считается: им не платят, его не
 *  закладывают и не выставляют — ломбард выставил бы шаблон на полку, и
 *  «одна вещь на свете» размножилась бы у покупателей. */
export function freeSql(account: string, pick: ArtPick): string {
  const narrow = [
    pick.templateId ? `u.template_id = ${sqlStr(pick.templateId)}` : "",
    pick.rarity ? `t.rarity = ${sqlStr(pick.rarity)}` : "",
    pick.wear != null ? `u.wear = ${wearSql(pick.wear)}` : "",
    enchantNarrowSql(pick.enchantPct),
    // «Любой артефакт редкости» коня не берёт (§8.84), даже если шаблон прислал игрок:
    // у такой позиции всегда есть редкость. Именная позиция и аукцион — без редкости.
    pick.rarity ? notMount("t") : "",
  ].filter(Boolean);
  return `FROM yuplink.user_game_item u
     JOIN yuplink.mystic_item_template t ON t.id = u.template_id
    WHERE u.account_id = ${sqlStr(account)} AND u.kind = 'artifact'
      AND t.kind = 'artifact' AND ${droppable("t")}
      ${narrow.length ? `AND ${narrow.join(" AND ")}` : ""}
      AND NOT EXISTS (SELECT 1 FROM worn w WHERE w.item_id = u.id)`;
}

/**
 * Кандидаты на снятие: по каждой группе — самые старые свободные, своим LIMIT.
 * Одна группа — прежний запрос как есть; несколько — UNION ALL подзапросов в
 * скобках. Группы не пересекаются (вызывающий схлопывает одинаковые), поэтому
 * строка в кандидатах не задваивается.
 */
export function freeTakeSql(account: string, groups: ArtTake[]): string {
  const one = (g: ArtTake): string =>
    `SELECT u.id, u.template_id, u.wear
         ${freeSql(account, g.pick)}
        ORDER BY u.obtained_at ASC, u.id ASC
        LIMIT ${int(g.qty)}`;
  return groups.length === 1 && groups[0]
    ? one(groups[0])
    : groups.map((g) => `(${one(g)})`).join("\n       UNION ALL ");
}
