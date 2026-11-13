// Закладки героев в таверне — на аккаунте, а не на устройстве (жалоба игрока
// 04.11.2026: закрепил на одном устройстве — на другом пусто).
//
// Лежат рядом с остальным «что игрок видит»: yuplink.account_view.tavern_pins
// (migrations/view-02-tavern-pins.sql). Пишем правкой (закрепить/открепить), а
// не целым списком: два открытых устройства не затирают закладки друг друга.
// Каждая запись заново сверяет хозяина: в списке остаются только свои герои.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mcpExec } from "../db/mcpClient";
import { sqlStr } from "./raid-shared";
import { currentAccount, requireAccount } from "../auth";
import { MAX_TAVERN_PINS, TAVERN_PIN_KEY, pinKeys } from "@/lib/hero/tavernPins";

type Row = { tavern_pins: unknown };

const textArray = (list: readonly string[]) =>
  list.length ? `ARRAY[${list.map(sqlStr).join(",")}]::text[]` : `'{}'::text[]`;

/**
 * Список после правки одним выражением SQL: `base` плюс новые, минус снятые,
 * только герои этого аккаунта, по порядку закрепления, не больше потолка.
 */
export function prunedPinsSql(
  account: string,
  base: string,
  add: readonly string[],
  remove: readonly string[],
): string {
  const acc = sqlStr(account);
  return `(SELECT coalesce(array_agg(p.k ORDER BY p.pos), '{}'::text[]) FROM (
      SELECT t.k, min(t.o) AS pos
        FROM unnest(array_cat(${base}, ${textArray(add)})) WITH ORDINALITY AS t(k, o)
       WHERE t.k <> ALL(${textArray(remove)})
         AND ((t.k LIKE 'hero:%' AND EXISTS (SELECT 1 FROM yuplink.hero_instance h
                WHERE h.id = substr(t.k, 6) AND h.account_id = ${acc}))
           OR (t.k LIKE 'item:%' AND (
                EXISTS (SELECT 1 FROM yuplink.hero_instance h
                  WHERE h.item_id = substr(t.k, 6) AND h.account_id = ${acc})
                OR EXISTS (SELECT 1 FROM yuplink.user_game_item u
                  WHERE u.id = substr(t.k, 6) AND u.account_id = ${acc} AND u.kind = 'hero'))))
       GROUP BY t.k ORDER BY pos LIMIT ${MAX_TAVERN_PINS}) p)`;
}

export const getTavernPins = createServerFn({ method: "GET" }).handler(
  async (): Promise<string[]> => {
    const acc = await currentAccount();
    if (!acc) return [];
    try {
      const rows = (await mcpExec(
        `SELECT tavern_pins FROM yuplink.account_view WHERE account_id=${sqlStr(acc)} LIMIT 1;`,
        { wrapJson: true },
      )) as Row[];
      return pinKeys(rows?.[0]?.tavern_pins);
    } catch (e) {
      // Колонку ещё не завели (view-02 не применена) — закладок просто нет.
      // Прочие сбои пробрасываем: пустой список вместо настоящего врал бы.
      if (/does not exist/i.test(e instanceof Error ? e.message : String(e))) return [];
      throw e;
    }
  },
);

const keyList = z.array(z.string().regex(TAVERN_PIN_KEY)).max(MAX_TAVERN_PINS);

export const saveTavernPins = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ add: keyList, remove: keyList }).strict().parse(d))
  .handler(async ({ data }): Promise<string[]> => {
    const acc = await requireAccount();
    const rows = (await mcpExec(
      `INSERT INTO yuplink.account_view AS v (account_id, tavern_pins)
       VALUES (${sqlStr(acc)}, ${prunedPinsSql(acc, `'{}'::text[]`, data.add, data.remove)})
       ON CONFLICT (account_id) DO UPDATE SET
         tavern_pins = ${prunedPinsSql(acc, "v.tavern_pins", data.add, data.remove)},
         updated_at = now()
       RETURNING v.tavern_pins;`,
      { wrapJsonCte: true },
    )) as Row[];
    return pinKeys(rows?.[0]?.tavern_pins);
  });
