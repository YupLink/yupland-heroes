// «Эта выдача уже начиналась?» — единственный ответ на вопрос для видов
// подарка, у которых своего ключа повтора нет.
//
// У лайков ключ есть (like_grant_log), у билетов и токенов — леджер с парой
// (kind, ref). А `add_energy`, `grantPackToUser` и вставка предмета в инвентарь
// дедупа не знают вовсе: слепой повтор моста выдал бы второй раз. Поэтому перед
// такой выдачей ставим метку здесь, и второй заход её уже не получит.
import { mcpExec } from "../db/mcpClient";
import { sqlStr } from "./chips-utils";

/**
 * Занять право на выдачу. `true` — метка наша, выдавать можно.
 * `false` — выдача по этому ключу уже начиналась, повторять нельзя.
 */
export async function claimDeliverOnce(op: string, giftId: string): Promise<boolean> {
  const rows = (await mcpExec(
    `INSERT INTO yuplink.gift_deliver_op (op, gift_id)
     VALUES (${sqlStr(op)}, ${sqlStr(giftId)})
     ON CONFLICT (op) DO NOTHING
     RETURNING op;`,
    { wrapJsonCte: true },
  )) as Array<{ op: string }>;
  return !!rows?.[0];
}

/**
 * Снять метку: выдача честно не состоялась (упала ДО того, как что-то ушло
 * игроку). Тогда следующий клейм повторит её с чистого листа.
 */
export async function releaseDeliverOnce(op: string): Promise<void> {
  await mcpExec(`DELETE FROM yuplink.gift_deliver_op WHERE op = ${sqlStr(op)};`).catch(
    () => undefined,
  );
}
