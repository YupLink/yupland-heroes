// Чем показать объект на клетке, куда пришёл игрок.
//
// Вынесено из move-step (правило ≤250 строк): там остались сами волны шага, а
// это — справка по уже прочитанному object_id, без своих правил.
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";

export type ObjectInfo = { id: string; name: string; image_url: string | null; meta: unknown };

/**
 * Что за объект стоит на клетке, куда пришли. Спрашиваем по уже прочитанному
 * object_id: отдельный SELECT самой клетки после хода был лишним рейсом за
 * значением, которое уже приехало со сводкой цели.
 */
export async function objectInfoOf(rawObjectId: string | null): Promise<ObjectInfo | null> {
  if (!rawObjectId) return null;
  const cleanId = rawObjectId.includes(":") ? rawObjectId.split(":")[1] : rawObjectId;
  const isBoss = rawObjectId.startsWith("boss:");
  const rows = (await mcpExec(
    isBoss
      ? `SELECT id, name, image_url,
                jsonb_build_object('type', 'boss', 'hp', max_hp, 'rewards', reward_tiers) AS meta
           FROM yuplink.raid_boss_template WHERE id = ${sqlStr(cleanId)} LIMIT 1;`
      : `SELECT id, name, image_url, meta
           FROM yuplink.mystic_item_template WHERE id = ${sqlStr(cleanId)} LIMIT 1;`,
    { wrapJson: true },
  )) as ObjectInfo[];
  const row = rows?.[0];
  return row ? { ...row, id: rawObjectId } : null;
}
