// Разбудить героя: завести экземпляр для того, кто лежит предметом.
//
// Экземпляр (hero_instance) появляется лениво — при первой прокачке. Но выбрать
// основным можно и «спящего»: игрок открыл бокс, увидел строителя и хочет
// сразу его на карту. Заводим запись на лету, той же формулой редкости, что и
// прокачка, — иначе герой пробуждался бы с другой редкостью и другим потолком.
import { mcpExec } from "../db/mcpClient";
import { sqlStr } from "./raid-shared";
import { rarityOfTemplateLevel } from "./heroes-list-dormant";
import { heroItemLockSql } from "./hero-item-lock";

/**
 * Завести экземпляр копии — под замком копии (hero-item-lock; его же держит
 * ломбард, снимая копию). Вставка сама проверяет, что копия всё ещё лежит у
 * игрока и экземпляра у неё нет: сданную в ломбард за миг до нас не разбудить,
 * а двое будящих разом не заведут два экземпляра одной копии. 0 строк — не
 * вставили (решает вызывающий).
 */
export function wakeInsertSql(o: {
  id: string;
  wallet: string;
  list: string;
  itemId: string;
  rarity: string;
}): string {
  const item = sqlStr(o.itemId);
  return `${heroItemLockSql(o.itemId)}
WITH ins AS (
  INSERT INTO yuplink.hero_instance
    (id, wallet, template_id, item_id, rarity, level, likes_spent, equipped, source, source_chip_id)
  SELECT ${sqlStr(o.id)}, ${sqlStr(o.wallet)}, u.template_id, u.id, ${sqlStr(o.rarity)},
         0, 0, '{}'::jsonb, 'inventory_item', NULL
    FROM yuplink.user_game_item u
   WHERE u.id = ${item} AND u.account_id IN (${o.list}) AND u.kind = 'hero'
     AND NOT EXISTS (SELECT 1 FROM yuplink.hero_instance h
                      WHERE h.account_id IN (${o.list}) AND h.item_id = ${item})
  RETURNING id
)
SELECT id FROM ins;`;
}

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
  const findHave = async (): Promise<string | null> => {
    const have = (await mcpExec(
      `SELECT id FROM yuplink.hero_instance
        WHERE account_id IN (${list}) AND item_id = ${sqlStr(itemId)} LIMIT 1;`,
      { wrapJson: true },
    ).catch(() => [])) as Array<{ id: string }>;
    return have?.[0]?.id ?? null;
  };
  const have = await findHave();
  if (have) return have;

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
  const made = (await mcpExec(wakeInsertSql({ id, wallet, list, itemId, rarity }))) as Array<{
    id?: string;
  }>;
  if (made?.[0]?.id) return String(made[0].id);
  // Не вставили: соседний запрос разбудил копию раньше — берём его экземпляр;
  // копии уже нет (сдана в ломбард, продана) — героя у игрока нет.
  const woken = await findHave();
  if (woken) return woken;
  throw new Error("Это не твой герой");
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
