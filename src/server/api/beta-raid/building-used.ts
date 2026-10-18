// «Уже пользовался этот игрок этой постройкой?» — для одноразовых построек
// (вышка, дерево уровней). Вынесено из building-extra.ts, чтобы тот держался
// в лимите ≤250 строк; building-extra ре-экспортит функцию — старые импорты
// `./building-extra` не меняются.
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";

/** Уже пользовался этот игрок этой постройкой? */
export async function buildingUsed(
  owner: string,
  mapId: string,
  q: number,
  r: number,
  kind: string,
): Promise<boolean> {
  const rows = (await mcpExec(
    `SELECT 1 AS hit FROM yuplink.beta_raid_building_use
      WHERE owner = ${sqlStr(owner)} AND map_id = ${sqlStr(mapId)}
        AND q = ${q} AND r = ${r} AND kind = ${sqlStr(kind)} LIMIT 1;`,
    { wrapJson: true },
  )) as Array<{ hit: number }>;
  return !!rows?.[0];
}
