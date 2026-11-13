// Зачарованные артефакты на аукционе (владелец через тестера, 31.10.2026: «улучшенные
// артефакты помечать — чтобы на аукционе было видно и при выставлении»).
//
//  · Пикер: группа — шаблон + износ + процент зачарования (§8.87). Зачарованный —
//    своей строкой с ✦, обычные — своей: в залог не уйдёт «не тот».
//  · Лот: escrow.enchant — процент группы (null — обычные); карточка рисует ✦.
//  · Победитель: зачарование взятых в залог экземпляров (памятка лота) едет в
//    подарке (player_gift.item_enchant) и ложится на выданные предметы. Лот вернулся
//    продавцу — экземпляры те же (id), и зачарование при них осталось.
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { recallTaken } from "../beta-raid/art-memo";
import { freeSql, int, wornSql } from "../beta-raid/art-stock-sql";
import { enchantPctSql } from "../beta-raid/enchant/enchant-sql";

export type AuctionArt = {
  templateId: string;
  name: string;
  imageUrl: string | null;
  rarity: string | null;
  count: number;
  wear: number;
  /** Процент зачарования группы; null — обычные. */
  enchantPct: number | null;
};

/** Зачарование одного экземпляра — то, что переносится к победителю. */
export type ItemEnchant = { pct: number; spellId: string | null; spellName: string | null };

/** Свободные артефакты для лота: шаблон + износ + зачарование. Сбой летит наверх. */
export async function listAuctionArts(account: string): Promise<AuctionArt[]> {
  const rows = (await mcpExec(
    `WITH worn AS (${wornSql(account)}),
     x AS (SELECT u.template_id, t.name, t.image_url, t.rarity, u.wear::float8 AS wear,
                  ${enchantPctSql()} AS pct
             ${freeSql(account, {})})
     SELECT template_id AS "templateId", name, image_url AS "imageUrl", rarity,
            count(*)::int AS count, wear, pct AS "enchantPct"
       FROM x
      GROUP BY template_id, name, image_url, rarity, wear, pct
      ORDER BY name, template_id, wear, pct NULLS FIRST;`,
    { wrapJson: true },
  )) as AuctionArt[];
  return (rows ?? []).map((r) => ({
    ...r,
    count: int(r.count),
    wear: Number(r.wear) || 0,
    enchantPct: r.enchantPct == null ? null : Number(r.enchantPct) || 0,
  }));
}

/** Сколько свободных ровно такой группы (шаблон, износ, зачарование). */
export async function freeAuctionArtCount(
  account: string,
  pick: { templateId: string; wear: number; enchantPct: number | null },
): Promise<number> {
  const rows = (await mcpExec(
    `WITH worn AS (${wornSql(account)})
     SELECT count(*)::int AS n ${freeSql(account, pick)};`,
    { wrapJson: true },
  )) as Array<{ n: number | string }>;
  return int(Number(rows?.[0]?.n) || 0);
}

/** Зачарования экземпляров, взятых в залог лота (по памятке), в порядке памятки. */
export async function lotEnchants(memoPrefix: string): Promise<ItemEnchant[]> {
  const taken = await recallTaken(memoPrefix);
  if (!taken.length) return [];
  const rows = (await mcpExec(
    `SELECT item_id, pct::float8 AS pct, spell_id, spell_name FROM yuplink.item_enchant
      WHERE item_id IN (${taken.map((a) => sqlStr(a.id)).join(", ")});`,
    { wrapJson: true },
  )) as Array<{ item_id: string; pct: number; spell_id: string | null; spell_name: string | null }>;
  const by = new Map((rows ?? []).map((r) => [r.item_id, r]));
  return taken.flatMap((a) => {
    const r = by.get(a.id);
    return r ? [{ pct: Number(r.pct) || 0, spellId: r.spell_id, spellName: r.spell_name }] : [];
  });
}
