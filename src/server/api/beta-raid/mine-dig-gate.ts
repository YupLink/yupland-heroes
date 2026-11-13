// Лопатой на клетке шахты нельзя ничего (ПРАВИЛА §8.59 п. 9): ни закопать, ни
// выкопать.
//
// «Копать» пустую землю и «Закопать» под любым зданием и так закрыты признаком
// здания (cell-sql.buildingHeldSql: ground-dig-sql, bag-actor
// .requireNotUnderBuilding). А вот «Выкопать» под зданием нарочно открыто —
// иначе бугорок под новым зданием застрял бы навсегда (владелец 03.10). Для
// шахты владелец сказал иначе, и эта проверка закрывает именно её: отказ до
// денег и лопаты, тем же признаком шахты, что у шага (mineCellSql).
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import { MINE_NO_DIG, mineCellSql } from "@/server/api/beta-raid/mine-cell-sql";

export async function requireNotOnMine(mapId: string, q: number, r: number): Promise<void> {
  const rows = (await mcpExec(
    `SELECT ${mineCellSql("c")} AS mine FROM yuplink.raid_map_cells c
      WHERE c.map_id = ${sqlStr(mapId)} AND c.q = ${Math.floor(q)} AND c.r = ${Math.floor(r)}
      LIMIT 1;`,
    { wrapJson: true },
  )) as Array<{ mine: boolean }>;
  if (rows?.[0]?.mine === true) throw new Error(MINE_NO_DIG);
}
