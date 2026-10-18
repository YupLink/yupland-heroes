// Восстановление карты с галочкой «С USDT» (ПРАВИЛА §8.49а): поднятые объекты снова
// обещают живые деньги. Сколько USDT вернётся на карту — до подъёма; не помещается в
// свободное с запасом — кнопка отказывает целиком, ничего не поднимая.
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { assertSpendableUsdt } from "../usdt-guard";
import { CELL_LAYER, RUNNER_LAYER } from "./runners";
import { BOSS_TEMPLATE_JOIN, resourceSumSql } from "./restore-reward-sql";

const MYSTIC_JOIN = (o: string) => `LEFT JOIN yuplink.mystic_item_template t
            ON t.id = CASE WHEN ${o}.object_id LIKE '%:%'
                           THEN split_part(${o}.object_id, ':', 2) ELSE ${o}.object_id END`;

/** Павшие объекты под фильтрами кнопки, слой клеток и беглецов. */
const layerSum = (mapId: string, o: "c" | "rn", kindFilter: string, resourceOk: string) => {
  const table = o === "c" ? "yuplink.raid_map_cells" : "yuplink.beta_raid_runner";
  const layer = o === "c" ? CELL_LAYER : RUNNER_LAYER;
  return `(SELECT COALESCE(sum(${resourceSumSql(o, "usdt")}), 0)
     FROM yuplink.beta_raid_object_hp h
     JOIN ${table} ${o} ON ${o}.map_id = h.map_id AND ${o}.q = h.q AND ${o}.r = h.r
     ${MYSTIC_JOIN(o)}
     ${BOSS_TEMPLATE_JOIN(o)}
    WHERE h.map_id = ${sqlStr(mapId)} AND h.cycle_no = ${layer} AND h.killed_at IS NOT NULL
      AND (${kindFilter}) AND (${resourceOk}))`;
};

export async function assertRestoreUsdt(
  mapId: string,
  kindFilter: string,
  resourceOk: (o: "c" | "rn") => string,
): Promise<void> {
  const runnerKinds = kindFilter.replace(/\bc\./g, "rn.");
  const rows = (await mcpExec(
    `SELECT (${layerSum(mapId, "c", kindFilter, resourceOk("c"))}
           + ${layerSum(mapId, "rn", runnerKinds, resourceOk("rn"))})::text AS usdt;`,
    { wrapJson: true },
  )) as Array<{ usdt: string }> | null;
  if (!rows?.[0]) throw new Error("Сумма USDT к подъёму не прочиталась — восстановление отложено");
  const usdt = Number(rows[0].usdt) || 0;
  if (usdt > 0) await assertSpendableUsdt(usdt, "восстановление объектов с USDT");
}
