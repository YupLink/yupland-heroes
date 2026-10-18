// Начисление энергии С ВИДОМ: покупка, возврат или награда.
//
// С таяния (acc-45-energy-decay.sql) вид начисления решает судьбу энергии:
// купленная (energy_market) ложится в user_energy.bought и не тает, возврат
// (energy_refund) восстанавливает купленный запас, награда (energy_reward)
// тает выше лимита. Раньше маркет, сундуки и откаты платы шли одним видом
// energy_reward без ref, и различить их было нельзя — SQL обязан знать
// разницу, поэтому вид передаётся явно, а ref — всегда.
import { sb } from "../db/pg";
import { mcpExec } from "../db/mcpClient";
import { sqlStr } from "./raid-shared";

export type EnergyCreditKind = "energy_market" | "energy_refund" | "energy_reward";

/**
 * Шим кладёт отказ базы в {error}, а не бросает; бросаем сами — вызывающие
 * держат на этом откат (рейд снимает отметку сундука, маркет возвращает цену).
 *
 * Про ref: currency_ledger держит UNIQUE (kind, ref), а energy_log_acc
 * глушит ошибку записи. Повтор той же пары (слепой ретрай моста, сундук
 * release→take) начислил бы энергию второй раз, а строку леджера потерял —
 * поэтому пара сверяется с леджером ДО начисления: уже есть — выдано,
 * выходим. Без ref повтор начислял дважды и молча.
 */
export async function creditEnergy(
  wallet: string,
  amount: number,
  kind: EnergyCreditKind,
  ref: string,
): Promise<void> {
  const seen = (await mcpExec(
    `SELECT 1 AS x FROM yuplink.currency_ledger
      WHERE token = 'Energy' AND kind = ${sqlStr(kind)} AND ref = ${sqlStr(ref)} LIMIT 1;`,
    { wrapJson: true },
  ).catch(() => null)) as Array<{ x: number }> | null;
  if (seen && seen.length > 0) return;
  const { error } = await sb.rpc("add_energy", {
    p_wallet: wallet,
    p_amount: amount,
    p_kind: kind,
    p_ref: ref,
  });
  if (error) throw new Error(error.message || "energy_grant_failed");
}

/**
 * Маркет: выдача товара идёт с ref `…:give` (market-deliver), всё остальное —
 * откаты цены (`:undo`, `:undo2`, `:undoPart`, `:part`) и выплаты. Признак по
 * суффиксу, а не «не undo»: частичный возврат `:part` иначе лёг бы покупкой.
 */
export const marketEnergyKind = (ref: string): EnergyCreditKind =>
  /:give$/.test(ref) ? "energy_market" : "energy_refund";
