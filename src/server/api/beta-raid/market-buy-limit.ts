// Лимит покупок товара на игрока В ДЕНЬ (задачник 23.09: «не более одного
// артефакта»; владелец 04.10: «лимит в день ... пускай и будет такой лимит»).
// Сутки — UTC, как у остальных суточных вещей игры: новые сутки — новая строка
// счётчика (позиция, аккаунт, день), лимит снова целый.
//
// Резерв — ДО денег, как у запаса (market-stock): счётчик купленного растёт
// одним оператором с проверкой лимита, гонку двух вкладок решает база. Не
// выдали (сбой) — счётчик возвращается целиком, выдали часть — на недоданное.
// Мост может переслать оператор вслепую при обрыве — тогда счётчик уйдёт в
// «строгую» сторону (игрок упрётся в лимит раньше), но не наоборот.
//
// Лимит — на АККАУНТ (игрок = аккаунт), только на витрине покупки.
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import type { MarketItem } from "@/lib/marketItem";

export type BuyerHold = { release: (units: number) => Promise<void> } | null;

/** Действует ли на позицию лимит на игрока. */
export const hasBuyerLimit = (item: Pick<MarketItem, "side" | "perAccountLimit">): boolean =>
  item.side !== "sell" && item.perAccountLimit != null && item.perAccountLimit > 0;

/** Сегодня по UTC — один и тот же день для резерва, витрины и счётчика. */
const TODAY = "(now() AT TIME ZONE 'UTC')::date";

/** Вернуть недоданное в ТОТ день, в который его заняли (покупка могла пересечь полночь). */
async function releaseBuyer(itemId: string, account: string, day: string, units: number) {
  if (!(units > 0)) return;
  await mcpExec(
    `UPDATE yuplink.raid_market_buyer
        SET bought = GREATEST(0, bought - ${Math.floor(units)}), updated_at = now()
      WHERE item_id = ${sqlStr(itemId)} AND account_id = ${sqlStr(account)}
        AND day = ${sqlStr(day)}::date;`,
  ).catch((e) => console.warn("[market-limit] счётчик не вернулся:", itemId, account, e));
}

/**
 * Занять qty штук лимита игрока. Лимита нет — null (покупка как раньше).
 * Не помещается — отказ `market.limit_reached` до денег и до запаса.
 */
export async function holdBuyerLimit(
  item: MarketItem,
  account: string,
  qty: number,
): Promise<BuyerHold> {
  if (!hasBuyerLimit(item)) return null;
  const limit = Math.floor(Number(item.perAccountLimit));
  const n = Math.floor(qty);
  if (n > limit) throw new Error("market.limit_reached");
  const rows = (await mcpExec(
    `INSERT INTO yuplink.raid_market_buyer AS b (item_id, account_id, day, bought, updated_at)
     VALUES (${sqlStr(item.id)}, ${sqlStr(account)}, ${TODAY}, ${n}, now())
     ON CONFLICT (item_id, account_id, day) DO UPDATE
       SET bought = b.bought + EXCLUDED.bought, updated_at = now()
       WHERE b.bought + EXCLUDED.bought <= ${limit}
     RETURNING bought, day::text AS day;`,
    { wrapJsonCte: true },
  )) as Array<{ bought: number; day: string }>;
  const row = rows?.[0];
  if (!row) throw new Error("market.limit_reached");
  return { release: (units) => releaseBuyer(item.id, account, String(row.day), units) };
}

/** Покупка под лимитом: сбой возвращает весь резерв, частичная выдача — остаток. */
export async function withBuyerLimit<T extends { qty: number }>(
  hold: BuyerHold,
  qty: number,
  run: () => Promise<T>,
): Promise<T> {
  if (!hold) return run();
  let res: T;
  try {
    res = await run();
  } catch (e) {
    await hold.release(qty);
    throw e;
  }
  if (res.qty < qty) await hold.release(qty - res.qty);
  return res;
}

/** Сколько этот аккаунт купил СЕГОДНЯ по позициям с лимитом: id → штук. */
export async function boughtByAccount(
  account: string | null,
  items: Array<Pick<MarketItem, "id" | "side" | "perAccountLimit">>,
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const ids = items.filter(hasBuyerLimit).map((i) => i.id);
  if (!account || ids.length === 0) return out;
  const rows = (await mcpExec(
    `SELECT item_id, bought FROM yuplink.raid_market_buyer
      WHERE account_id = ${sqlStr(account)} AND day = ${TODAY}
        AND item_id IN (${ids.map(sqlStr).join(",")});`,
    { wrapJson: true },
  ).catch(() => [])) as Array<{ item_id: string; bought: number | string }>;
  for (const r of rows ?? []) out.set(String(r.item_id), Math.max(0, Number(r.bought) || 0));
  return out;
}
