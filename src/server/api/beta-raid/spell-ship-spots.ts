// Где призыву искать судно и куда его ставить — SQL-выборки «Призыва Корабля».
//
// Вынесено из spell-effects.ts (правило ≤250 строк): там остался сам порядок
// каста (занять → везти → освободить), здесь — выборка кандидатов по карте.
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import type { Cell } from "./encounter-where";

/**
 * Свободные живые суда карты, ближайшие к клетке — кандидаты на призыв.
 *
 * Радиуса у призыва нет — берёт с другого конца карты. Но судно, которое
 * только что починили или с которого только что сошли (updated_at у СВОБОДНОГО
 * борта меняется лишь на сходе, снятии экипажа, починке и переезде призывом),
 * две минуты не отдаём: рядом с ним ещё стоит тот, кто его чинил, — «починил
 * корабль, и он испарился» (20.09). Соседнее с кастующим оставляем в кандидатах
 * нарочно: по нему срабатывает отказ «корабль и так рядом» с возвратом энергии.
 */
export async function freeShipsNear(
  mapId: string,
  pos: Cell,
  limit: number,
): Promise<Array<{ id: string; q: number; r: number }>> {
  const dist = `(abs(s.q - ${pos.q}) + abs(s.r - ${pos.r})
                 + abs((s.q + s.r) - ${pos.q + pos.r})) / 2`;
  const rows = (await mcpExec(
    `SELECT s.id, s.q, s.r, ${dist} AS d
       FROM yuplink.beta_raid_ship s
      WHERE s.map_id = ${sqlStr(mapId)} AND s.crew_account IS NULL AND s.hp > 0
        AND (s.updated_at < now() - interval '2 minutes' OR ${dist} <= 1)
      ORDER BY d, s.created_at, s.id LIMIT ${Math.max(1, Math.floor(limit))};`,
    { wrapJson: true },
  ).catch(() => [])) as Array<{ id: string; q: number; r: number }>;
  return (rows ?? []).map((s) => ({ id: String(s.id), q: Number(s.q), r: Number(s.r) }));
}
