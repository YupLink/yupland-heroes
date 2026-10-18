// Какие вышки этот игрок уже отработал.
//
// Вышка одноразовая: посмотрел округу — и всё, второй раз она ничего не даёт.
// Но на карте она оставалась постройкой, а тап по постройке открывает окно, а
// не ведёт героя. Получалось «на клетку не зайти»: игрок жал по вышке, видел
// «уже смотрел» и стоял на месте. Клиенту нужен список отработавших вышек,
// чтобы дальше вести по ним как по обычной клетке.
import { createServerFn } from "@tanstack/react-start";
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { requireBetaRaid } from "./gate";
import { myMapId } from "./encounter-where";
import { raidOwner } from "./owner";

export const towerUsedCells = createServerFn({ method: "GET" }).handler(async () => {
  const wallet = await requireBetaRaid();
  const mapId = await myMapId(wallet);
  const owner = await raidOwner(wallet);
  const rows = (await mcpExec(
    `SELECT q, r FROM yuplink.beta_raid_building_use
      WHERE owner = ${sqlStr(owner)} AND map_id = ${sqlStr(mapId)}
        AND kind = 'watchtower';`,
    { wrapJson: true },
  ).catch(() => [])) as Array<{ q: number; r: number }>;
  // Ключи «q:r» — клиенту удобнее искать в множестве, чем перебирать пары.
  return { used: (rows ?? []).map((c) => `${Number(c.q)}:${Number(c.r)}`) };
});
