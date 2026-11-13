// Карточки инвентаря (items.listMyItems) с зачарованием экземпляра: статы
// зачарованного артефакта — уже умноженные (enchantStatsOf), плюс его процент.
// Один запрос на весь список; сбой чтения карточек не роняет — показываем как есть.
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import { enchantStatsOf, type EnchantableStats } from "@/lib/enchant/enchantGear";

type Card = EnchantableStats & { id: string; kind: string };

/** Процент зачарования по id экземпляров. */
export async function enchantPcts(ids: string[]): Promise<Map<string, number>> {
  if (!ids.length) return new Map();
  const rows = (await mcpExec(
    `SELECT item_id AS id, pct::float8 AS pct FROM yuplink.item_enchant
      WHERE item_id IN (${ids.map(sqlStr).join(",")})`,
    { wrapJson: true },
  )) as Array<{ id: string; pct: number }>;
  return new Map((rows ?? []).map((r) => [String(r.id), Number(r.pct)]));
}

export async function enchantItemCards<T extends Card>(
  cards: T[],
): Promise<Array<T & { enchantPct: number | null }>> {
  const ids = cards.filter((c) => c.kind === "artifact").map((c) => c.id);
  const pcts = await enchantPcts(ids).catch((e) => {
    console.warn("[enchant] зачарование карточек не прочитано:", e);
    return new Map<string, number>();
  });
  return cards.map((c) => {
    const pct = pcts.get(c.id) ?? null;
    return { ...enchantStatsOf(c, pct), enchantPct: pct };
  });
}
