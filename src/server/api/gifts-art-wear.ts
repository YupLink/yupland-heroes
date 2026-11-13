// Износ артефакта в подарке (player_gift.item_wear, миграция artifact-wear-01).
//
// Пишет его только выигрыш лота игрока на аукционе: победитель получает
// артефакт таким, каким его выставил продавец (lib/hero/artWear). У остальных
// подарков колонки нет в деле — NULL, предмет новый, 100 %.
//
// Отдельный модуль и отдельный запрос, а не колонка в общем SELECT подарков:
// список и клейм всех прочих видов (лайки, паки, энергия) износа не касаются.
import { mcpExec } from "../db/mcpClient";
import { sqlStr } from "./chips-utils";

/** Износ подарков-артефактов для списка. Сбой — пусто: полоса покажет 100 %. */
export async function giftWears(ids: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (ids.length === 0) return out;
  const rows = (await mcpExec(
    `SELECT id, item_wear::float8 AS wear FROM yuplink.player_gift
      WHERE id IN (${ids.map(sqlStr).join(",")}) AND item_wear IS NOT NULL;`,
    { wrapJson: true },
  ).catch(() => [])) as Array<{ id: string; wear: number | null }>;
  for (const r of rows ?? []) out.set(r.id, Number(r.wear) || 0);
  return out;
}

/**
 * Износ, с которым выдать артефакт подарка. Сбой чтения ЛЕТИТ наверх: выдать
 * изношенный целым — значит починить его подарком; клейм откатится и
 * повторится.
 */
export async function giftWearForDelivery(giftId: string): Promise<number> {
  const rows = (await mcpExec(
    `SELECT item_wear::float8 AS wear FROM yuplink.player_gift WHERE id = ${sqlStr(giftId)};`,
    { wrapJson: true },
  )) as Array<{ wear: number | null }>;
  return Math.max(0, Math.min(100, Number(rows?.[0]?.wear) || 0));
}

/** Зачарование экземпляра из подарка (лот игрока на аукционе, player_gift.item_enchant). */
export type GiftEnchant = { pct: number; spellId: string | null; spellName: string | null };

/** Зачарования выигранных артефактов; колонки ещё нет или пусто — []. Сбой — наверх. */
export async function giftEnchantsForDelivery(giftId: string): Promise<GiftEnchant[]> {
  const rows = (await mcpExec(
    `SELECT item_enchant FROM yuplink.player_gift WHERE id = ${sqlStr(giftId)};`,
    { wrapJson: true },
  )) as Array<{ item_enchant: unknown }>;
  const list = rows?.[0]?.item_enchant;
  return Array.isArray(list)
    ? list.filter((e): e is GiftEnchant => !!e && Number.isFinite(Number((e as GiftEnchant).pct)))
    : [];
}

/** Зачарования — на выданные экземпляры по порядку (повтор не задвоит: ключ — id предмета). */
export async function applyGiftEnchants(
  itemIds: string[],
  account: string,
  giftId: string,
  enchants: GiftEnchant[],
): Promise<void> {
  const n = Math.min(itemIds.length, enchants.length);
  if (n === 0) return;
  const values = Array.from({ length: n }, (_, i) => {
    const e = enchants[i];
    return `(${sqlStr(itemIds[i])}, ${sqlStr(account)}, ${Math.round(Number(e.pct) || 0)},
      ${e.spellId ? sqlStr(e.spellId) : "NULL"}, ${e.spellName ? sqlStr(e.spellName) : "NULL"},
      ${sqlStr(`gift:${giftId}`)})`;
  }).join(", ");
  await mcpExec(
    `INSERT INTO yuplink.item_enchant (item_id, account_id, pct, spell_id, spell_name, op_ref)
     VALUES ${values} ON CONFLICT (item_id) DO NOTHING;`,
    { wrapJson: false },
  );
}
