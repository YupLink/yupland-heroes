// Стартовый набор игрока (владелец, 06.10.2026): коммон-герой и 10 тренировочных
// фишек 1–3★. Фишки новичок получает при первом входе (hallway-skip), а тем, кто
// пришёл раньше, набор дали разово (migrations/starter-01-backfill.sql).
//
// Героя с 22.10.2026 выбирают (Архан через владельца, задача #497194: «на старте
// даёт возможность выбрать расу одного из шести героев»): при создании аккаунта
// его больше не дают, новичок жмёт «Начать игру» в меню входа и выбирает расу —
// обычный герой (уровень 1) этой расы ложится сюда тем же путём, что и раньше
// случайный: в инвентарь, source 'starter', экземпляр (hero_instance) заводится
// при первом выборе героя. Отметка «игру начал» (yuplink.game_start) пишется той
// же вставкой: выбор разовый на аккаунт (migrations/start-01-game-start.sql).
import { nanoid } from "nanoid";
import { mcpExec } from "../db/mcpClient";
import { sqlStr } from "./raid-shared";

/** Метка источника: по ней видно, откуда у игрока стартовый герой. */
export const STARTER_HERO_SOURCE = "starter";

/**
 * Выдать выбранного коммон-героя, если у аккаунта героя нет вовсе — ни в
 * инвентаре, ни экземпляром — и игру он ещё не начинал. Одной вставкой с
 * отметкой: повтор (двойное нажатие, слепой повтор сети) второго не даст —
 * отметка уже стоит, вставка героя идёт только из её новой строки.
 * Шаблон не обычный герой или выключен — ничего не выдаём (false).
 */
export async function grantStarterHero(
  accountId: string,
  wallet: string,
  templateId: string,
): Promise<boolean> {
  const acc = sqlStr(accountId);
  // Без обёртки в JSON: вставка внутри CTE должна стоять на верхнем уровне,
  // а обёртка (wrapJsonCte) увела бы её внутрь.
  const rows = (await mcpExec(
    `WITH tpl AS (
       SELECT id FROM yuplink.mystic_item_template
        WHERE id = ${sqlStr(templateId)} AND kind = 'hero' AND active AND level = 1),
     mark AS (
       INSERT INTO yuplink.game_start (account_id, template_id)
       SELECT ${acc}, tpl.id FROM tpl
        WHERE NOT EXISTS (SELECT 1 FROM yuplink.user_game_item g
                           WHERE g.account_id = ${acc} AND g.kind = 'hero')
          AND NOT EXISTS (SELECT 1 FROM yuplink.hero_instance h WHERE h.account_id = ${acc})
       ON CONFLICT (account_id) DO NOTHING
       RETURNING template_id),
     hero AS (
       INSERT INTO yuplink.user_game_item
         (id, account_id, wallet, template_id, kind, source, obtained_at)
       SELECT ${sqlStr(`ugi_${nanoid(12)}`)}, ${acc}, ${sqlStr(wallet)}, mark.template_id,
              'hero', ${sqlStr(STARTER_HERO_SOURCE)}, now()
         FROM mark
       RETURNING id)
     SELECT id FROM hero;`,
  )) as Array<{ id: string }>;
  return (rows ?? []).length > 0;
}
