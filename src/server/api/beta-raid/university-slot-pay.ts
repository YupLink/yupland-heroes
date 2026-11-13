// Плата за место под обучение в университете — золотом (§8.61: было 25 × n
// билетов, стало 12 500 × n золота; цена — lib/university.nextSlotPrice).
//
// Сначала деньги: золото списывается идемпотентно по номеру места, поэтому
// повтор запроса не снимет его дважды. Место не открылось — золото вернётся
// видом university_slot_undo тем же ключом. Следующая попытка того же места
// платит уже СВОИМ ключом (…:N — по числу прошлых возвратов): иначе res_move
// узнал бы израсходованный ключ и место открылось бы без оплаты — или не
// открылось бы никогда.
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { goldMove, goldRefund } from "../gold-move";

const KIND = "university_slot";

/** Списать цену места `slotNo`. Вернёт ключ операции — он же ключ возврата. */
export async function payUniversitySlot(
  account: string,
  gold: number,
  slotNo: number,
): Promise<string> {
  const base = `uni-slot:${account}:${slotNo}`;
  const rows = (await mcpExec(
    `SELECT count(*)::int AS n FROM yuplink.res_ledger
      WHERE kind = '${KIND}_undo' AND (ref = ${sqlStr(base)} OR ref LIKE ${sqlStr(`${base}:%`)});`,
    { wrapJson: true },
  )) as Array<{ n: number }> | null;
  const undone = Number(rows?.[0]?.n) || 0;
  const ref = undone > 0 ? `${base}:${undone}` : base;
  // applied=false — ключ уже проведён прошлой попыткой этого же нажатия:
  // место открывать нельзя, иначе оно досталось бы бесплатно.
  if (!(await goldMove(account, -gold, KIND, ref))) throw new Error("Это место уже оплачено");
  return ref;
}

/** Место не открылось — вернуть золото тем же ключом. */
export const refundUniversitySlot = (account: string, gold: number, ref: string) =>
  goldRefund(account, gold, KIND, ref);
