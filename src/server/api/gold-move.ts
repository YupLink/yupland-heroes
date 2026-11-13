// Движение золота игрока (res_move, ресурс gold) — общая точка для всего, что
// раньше шло билетами (ПРАВИЛА §8.61). Повтор того же (вид, ключ) база второй раз
// не проводит; в минус не пускает — тогда «Не хватает золота: нужно N».
import { sb } from "../db/pg";
import { mcpExec } from "../db/mcpClient";
import { sqlStr } from "./raid-shared";

/** Золото на счёте аккаунта (yuplink.account_resources). */
export async function goldOf(account: string): Promise<number> {
  const rows = (await mcpExec(
    `SELECT amount FROM yuplink.account_resources
      WHERE account_id = ${sqlStr(account)} AND resource = 'gold';`,
    { wrapJson: true },
  )) as Array<{ amount: number | string }> | null;
  return Number(rows?.[0]?.amount) || 0;
}

/** Списать/начислить золото. delta < 0 — трата, > 0 — начисление.
 *  false — этот (вид, ключ) уже проведён раньше: второй раз база не двигает. */
export async function goldMove(
  account: string,
  delta: number,
  kind: string,
  ref: string,
): Promise<boolean> {
  if (!delta) return true;
  const { data, error } = await sb.rpc("res_move", {
    p_account: account,
    p_resource: "gold",
    p_delta: delta,
    p_kind: kind,
    p_ref: ref,
  });
  if (!error) return !!(data as Array<{ applied?: boolean }> | null)?.[0]?.applied;
  const msg = String(error.message ?? "");
  throw new Error(/в минус/.test(msg) ? `Не хватает золота: нужно ${Math.abs(delta)}` : msg);
}

/** Вернуть списанное (сорвалась выдача). Сбой возврата — в лог, не наверх. */
export async function goldRefund(account: string, amount: number, kind: string, ref: string) {
  if (!(amount > 0)) return;
  await goldMove(account, amount, `${kind}_undo`, ref).catch((e: unknown) =>
    console.error(`[gold] возврат ${amount} не прошёл ${account} ${kind} ${ref}:`, e),
  );
}
