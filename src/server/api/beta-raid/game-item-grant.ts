// Выдача штучных предметов в инвентарь (yuplink.user_game_item) с
// ДЕТЕРМИНИРОВАННЫМ id строки.
//
// ПОЧЕМУ отдельный модуль. Этим трактом ходят двое: артефакты (art-stock) и
// герои (market-deliver). У артефактов ключ строки с рождения собран из nonce
// сделки, а герой рядом брал случайный nanoid — и слепой повтор запроса мостом
// выдавал ВТОРОГО героя за те же деньги. Одна формула id на обоих: повтор
// упирается в ON CONFLICT (id) и не удваивает выдачу.
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";

/** Вид штучного предмета инвентаря — совпадает с колонкой user_game_item.kind. */
export type GameItemKind = "artifact" | "hero";

/**
 * Кладёт n предметов и возвращает, СКОЛЬКО их теперь в инвентаре из
 * запрошенных. Раньше функция ничего не возвращала, а вызывающий рапортовал
 * «выдано qty» вслепую: при нуле вставок игрок платил и не получал товара, а
 * ответ был «успех».
 *
 * Считаем две величины сразу: вставленные этим запросом (ins) и те, что уже
 * лежали (already). Вторая — не бухгалтерия ради бухгалтерии: мост повторяет
 * запрос вслепую, повтор упирается в ON CONFLICT и вставляет ноль строк, хотя
 * предметы у игрока есть. Без слагаемого already честный ответ превратился бы
 * в ложный отказ и вернул игроку деньги за уже выданный товар. Подзапрос видит
 * снимок ДО этого оператора, поэтому свои же вставки в него не попадают и
 * ничего не задваивается.
 */
export async function grantGameItems(opts: {
  wallet: string;
  account: string;
  templateId: string;
  kind: GameItemKind;
  qty: number;
  /** Уникальный кусок сделки: id строк = `ugi_<nonce>_<i>`. Тот же nonce на
   *  повторе даёт те же id, и вторая вставка уходит в DO NOTHING. */
  nonce: string;
  /** Откуда предмет — колонка source. По умолчанию покупка в маркете. */
  source?: string;
}): Promise<number> {
  const n = Math.max(0, Math.floor(Number(opts.qty) || 0));
  // Без nonce детерминизма нет — лучше не выдать, чем выдать дважды.
  if (n <= 0 || !opts.templateId || !opts.nonce) return 0;
  const source = opts.source ?? "market";
  const ids = Array.from({ length: n }, (_, i) => `ugi_${opts.nonce}_${i}`);
  const values = ids
    .map(
      (id) =>
        `(${sqlStr(id)}, ${sqlStr(opts.wallet)}, ${sqlStr(opts.account)},
        ${sqlStr(opts.templateId)}, ${sqlStr(opts.kind)}, ${sqlStr(source)}, now())`,
    )
    .join(",");
  const rows = (await mcpExec(
    `WITH ins AS (
       INSERT INTO yuplink.user_game_item
         (id, wallet, account_id, template_id, kind, source, obtained_at)
       VALUES ${values}
       ON CONFLICT (id) DO NOTHING
       RETURNING id
     )
     SELECT (SELECT count(*) FROM ins)::int AS inserted,
            (SELECT count(*) FROM yuplink.user_game_item
              WHERE id IN (${ids.map(sqlStr).join(",")}))::int AS already;`,
  )) as Array<{ inserted: number; already: number }>;
  const row = rows?.[0];
  return Math.min(n, Number(row?.inserted ?? 0) + Number(row?.already ?? 0));
}
