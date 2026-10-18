// Захват гранта пака перед вскрытием.
//
// Читать opened_at в одном месте и писать его через полторы сотни строк —
// приглашение на три параллельных нажатия: все трое видят NULL и все трое
// получают содержимое. В проде так и делали — 29 грантов, 53 лишние фишки.
//
// Метка захвата — свой nonce: повтор транспорта (mcpExec, MAX_TRIES=4) шлёт
// тот же SQL и узнаёт собственную бронь, чужое нажатие получает ноль строк.
import { nanoid } from "nanoid";
import { pg } from "../db/pg";
import { mcpExec } from "../db/mcpClient";
import { sqlStr } from "./chips-utils";

export async function claimChipPackGrant(grantId: string): Promise<string> {
  const nonce = `cl_${nanoid(14)}`;
  const claimed = (await mcpExec(
    `UPDATE yuplink.chip_pack_grants
        SET opened_at = COALESCE(opened_at, now()),
            result_chips = COALESCE(result_chips, jsonb_build_object('claim', ${sqlStr(nonce)}))
      WHERE id = ${sqlStr(grantId)}
        AND (opened_at IS NULL OR result_chips->>'claim' = ${sqlStr(nonce)})
      RETURNING id;`,
    // Именно wrapJsonCte: обычный wrapJson подставляет UPDATE в подзапрос
    // (`FROM (UPDATE ...)`), а так писать нельзя — postgres спотыкается на
    // первой же точке. Пишущие запросы с RETURNING заворачиваются в CTE.
    { wrapJsonCte: true },
  )) as Array<{ id: string }> | null;
  if (!claimed?.length) throw new Error("Пак уже открывается");
  return nonce;
}

/** Снять бронь: ролл не состоялся, пак должен остаться неоткрытым. */
export async function releaseChipPackGrant(grantId: string): Promise<void> {
  await pg.chipPackGrants
    .update({ id: grantId }, { opened_at: null, result_chips: null })
    .catch(() => undefined);
}
