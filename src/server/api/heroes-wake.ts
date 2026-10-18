// Разбудить героя: завести экземпляр для того, кто лежит предметом.
//
// Экземпляр (hero_instance) появляется лениво — при первой прокачке. Но выбрать
// основным можно и «спящего»: игрок открыл бокс, увидел строителя и хочет
// сразу его на карту. Заводим запись на лету, той же формулой редкости, что и
// прокачка, — иначе герой пробуждался бы с другой редкостью и другим потолком.
import { mcpExec } from "../db/mcpClient";
import { sqlStr } from "./raid-shared";
import { rarityOfTemplateLevel } from "./heroes-list-dormant";

/**
 * Найти экземпляр по шаблону или создать его. Возвращает id.
 * Предмет обязан лежать в инвентаре игрока — иначе героя ему не давали.
 */
export async function wakeHeroInstance(
  wallet: string,
  account: string,
  /** Копия предмета из инвентаря — именно она становится героем. */
  itemId: string,
): Promise<string> {
  const list = sqlStr(account);
  // Экземпляр ищем по КОПИИ, а не по шаблону: у игрока их бывает несколько, и
  // поиск по шаблону подсовывал чужой (уже прокачанный) экземпляр.
  const have = (await mcpExec(
    `SELECT id FROM yuplink.hero_instance
      WHERE account_id IN (${list}) AND item_id = ${sqlStr(itemId)} LIMIT 1;`,
    { wrapJson: true },
  ).catch(() => [])) as Array<{ id: string }>;
  if (have?.[0]?.id) return have[0].id;

  const owned = (await mcpExec(
    `SELECT u.template_id, t.level FROM yuplink.user_game_item u
       JOIN yuplink.mystic_item_template t ON t.id = u.template_id
      WHERE u.id = ${sqlStr(itemId)} AND u.account_id IN (${list}) AND u.kind = 'hero'
      LIMIT 1;`,
    { wrapJson: true },
  ).catch(() => [])) as Array<{ template_id: string; level: number | string | null }>;
  if (!owned?.length) throw new Error("Это не твой герой");

  const rarity = rarityOfTemplateLevel(Number(owned[0].level));
  const id = `hero_${Math.random().toString(36).slice(2, 12)}`;
  const rows = (await mcpExec(
    `INSERT INTO yuplink.hero_instance
       (id, wallet, template_id, item_id, rarity, level, likes_spent, equipped, source, source_chip_id)
     VALUES (${sqlStr(id)}, ${sqlStr(wallet)}, ${sqlStr(owned[0].template_id)}, ${sqlStr(itemId)},
             ${sqlStr(rarity)}, 0, 0, '{}'::jsonb, 'inventory_item', NULL)
     RETURNING id;`,
    { wrapJsonCte: true },
  )) as Array<{ id: string }>;
  return rows?.[0]?.id ?? id;
}

/**
 * Ссылка на СПЯЩЕГО героя в списках: экземпляра нет, есть копия предмета.
 * Списки отдают такой id, а ручка выбора будит героя по нему — клиенту не
 * приходится знать про два вида героев.
 */
export const WAKE_PREFIX = "wake:";

export const wakeRef = (itemId: string): string => `${WAKE_PREFIX}${itemId}`;

/**
 * Настоящий id экземпляра: обычный id возвращается как есть, «wake:<шаблон>» —
 * будит героя (проверка владения внутри wakeHeroInstance).
 */
export async function resolveHeroInstanceId(
  wallet: string,
  account: string,
  ref: string,
): Promise<string> {
  if (!ref.startsWith(WAKE_PREFIX)) return ref;
  const itemId = ref.slice(WAKE_PREFIX.length).trim();
  if (!itemId) throw new Error("Это не твой герой");
  return wakeHeroInstance(wallet, account, itemId);
}
