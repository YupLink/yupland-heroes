// Первый отряд героя собирается сам — из лучших боеспособных фишек.
//
// Иначе выход механики «в мир» выглядел бы так: игрок превратил фишку в
// героя, пошёл бить босса и узнал, что состав пуст, а закрепляют его только
// в замке — то есть посреди карты, куда ещё надо дойти. Засеваем при первом
// же обращении: дальше игрок меняет состав сам, когда доберётся до замка.
import { mcpExec } from "../db/mcpClient";
import { sqlStr } from "./raid-shared";
import { accountOf } from "./user-shared";
import { SQUAD_SLOTS, type SquadChip } from "./heroes-squad";

type Row = { template_id: string; level: number | string; serial_no: number | null };

/**
 * Подобрать лучшие фишки и записать их в отряд ВЫБРАННОГО героя.
 * Возвращает засеянный состав; пусто — если фишек нет или героя не выбрали.
 */
export async function seedHeroSquad(wallet: string): Promise<SquadChip[]> {
  const list = sqlStr(await accountOf(wallet));
  // Берём боеспособных: оглушённая или отдыхающая фишка в бой всё равно не
  // выйдет, а состав закрепляется надолго — сажать в него спящих незачем.
  const rows = (await mcpExec(
    `SELECT c.template_id, c.level, c.serial_no
       FROM yuplink.user_chip_inventory c
      WHERE c.account_id IN (${list}) AND c.status = 'owned'
        AND (c.rest_until IS NULL OR c.rest_until <= now())
        AND NOT EXISTS (
          SELECT 1 FROM yuplink.chip_effects e
           WHERE e.chip_id = c.id AND e.kind = 'stun' AND e.expires_at > now()
        )
      ORDER BY c.level DESC, c.serial_no NULLS LAST
      LIMIT ${SQUAD_SLOTS};`,
    { wrapJson: true },
  ).catch(() => [])) as Row[];

  const squad: SquadChip[] = (rows ?? []).map((r) => ({
    templateId: r.template_id,
    level: Number(r.level),
    serialNo: r.serial_no,
  }));
  if (squad.length === 0) return [];

  const saved = (await mcpExec(
    `UPDATE yuplink.hero_instance
        SET squad = ${sqlStr(JSON.stringify(squad))}::jsonb, updated_at = now()
      WHERE account_id IN (${list}) AND selected_at IS NOT NULL
        AND (squad IS NULL OR jsonb_array_length(COALESCE(squad, '[]'::jsonb)) = 0)
      RETURNING id;`,
    { wrapJsonCte: true },
  ).catch(() => [])) as Array<{ id: string }>;
  // Никого не обновили — герой не выбран либо отряд уже собран: не наш случай.
  return saved && saved.length > 0 ? squad : [];
}
