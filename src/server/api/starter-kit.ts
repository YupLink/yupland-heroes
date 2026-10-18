// Стартовый набор игрока (владелец, 06.10.2026): коммон-герой и 10 тренировочных
// фишек 1–3★. Новичок получает его при первом входе (hallway-skip), а тем, кто
// пришёл раньше, его дали разово (migrations/starter-01-backfill.sql) — та же
// логика: героя дают, только если нет ни одного; фишки — до 10 штук.
//
// Коммон-герой — случайный из активных шаблонов уровня 1 (сейчас «Fedr — Stubborn
// Mage» и «An — Sad Face», заведены владельцем в конструкторе). Новый коммон-шаблон
// попадёт в выбор сам. Герой ложится в инвентарь, как подарочный: экземпляр
// (hero_instance) заводится при первом выборе героя.
import { nanoid } from "nanoid";
import { mcpExec } from "../db/mcpClient";
import { sqlStr } from "./raid-shared";

/** Метка источника: по ней видно, откуда у игрока стартовый герой. */
export const STARTER_HERO_SOURCE = "starter";

/**
 * Выдать коммон-героя, если у аккаунта героя нет вовсе — ни в инвентаре, ни
 * экземпляром. Одной вставкой с проверкой: повторный вызов второго не даст.
 * Коммон-шаблонов нет — ничего не выдаём (false), вход в игру не ломаем.
 */
export async function grantStarterHero(accountId: string, wallet: string): Promise<boolean> {
  const acc = sqlStr(accountId);
  const rows = (await mcpExec(
    `WITH tpl AS (
       SELECT array_agg(id ORDER BY id) AS ids
         FROM yuplink.mystic_item_template
        WHERE kind = 'hero' AND active AND level = 1)
     INSERT INTO yuplink.user_game_item
       (id, account_id, wallet, template_id, kind, source, obtained_at)
     SELECT ${sqlStr(`ugi_${nanoid(12)}`)}, ${acc}, ${sqlStr(wallet)},
            tpl.ids[1 + floor(random() * array_length(tpl.ids, 1))::int],
            'hero', ${sqlStr(STARTER_HERO_SOURCE)}, now()
       FROM tpl
      WHERE array_length(tpl.ids, 1) > 0
        AND NOT EXISTS (SELECT 1 FROM yuplink.user_game_item g
                         WHERE g.account_id = ${acc} AND g.kind = 'hero')
        AND NOT EXISTS (SELECT 1 FROM yuplink.hero_instance h WHERE h.account_id = ${acc})
     RETURNING id;`,
    { wrapJsonCte: true },
  )) as Array<{ id: string }>;
  return (rows ?? []).length > 0;
}
