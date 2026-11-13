// Золото за улучшение фишки: баланс, списание и возврат.
//
// Сначала ДЕНЬГИ, потом товар: списываем до крафта (res_move не уходит в
// минус — гард в базе), крафт сорвался — возвращаем тем же ключом операции
// видом craft_undo. Повтор того же (вид, ключ) res_move второй раз не проводит.
import { sb } from "../db/pg";
import { mcpExec } from "../db/mcpClient";
import { sqlStr } from "./raid-shared";

/** Золото на счёте аккаунта (yuplink.account_resources). */
export async function accountGold(account: string): Promise<number> {
  const rows = (await mcpExec(
    `SELECT amount FROM yuplink.account_resources
      WHERE account_id = ${sqlStr(account)} AND resource = 'gold';`,
    { wrapJson: true },
  )) as Array<{ amount: number | string }> | null;
  return Number(rows?.[0]?.amount) || 0;
}

/** Списать цену улучшения. Нехватка → «Не хватает золота: нужно N». */
export async function payCraftGold(account: string, cost: number, ref: string): Promise<void> {
  if (cost <= 0) return;
  const { error } = await sb.rpc("res_move", {
    p_account: account,
    p_resource: "gold",
    p_delta: -cost,
    p_kind: "craft",
    p_ref: ref,
  });
  if (!error) return;
  const msg = String(error.message);
  throw new Error(/в минус/.test(msg) ? `Не хватает золота: нужно ${cost}` : msg);
}

/** Вернуть цену: улучшение не состоялось. Сбой возврата — в лог, не наверх. */
export async function refundCraftGold(account: string, cost: number, ref: string): Promise<void> {
  if (cost <= 0) return;
  try {
    const { error } = await sb.rpc("res_move", {
      p_account: account,
      p_resource: "gold",
      p_delta: cost,
      p_kind: "craft_undo",
      p_ref: ref,
    });
    if (error) throw new Error(error.message);
  } catch (e: unknown) {
    console.error(`[craft] возврат ${cost} золота не прошёл ${account} ${ref}:`, e);
  }
}
