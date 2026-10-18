// Пачка, у которой не начался ни один шаг (ни обмен, ни перевод — шаг
// «sending» пишется прямо перед подписью), откатывается в корзину сама:
// следующая проверка попробует снова. Нужна прежде всего доле карты с
// USDT-оплат — она меняется сразу после покупки, и сбой Ref не должен
// останавливать её до ручного разбора.
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { firstRow } from "./grant";

const lastNotice = new Map<string, number>();
/** Письмо о самоповторе — не чаще раза в час на корзину: сбой Ref не спамит бота. */
export function shouldNotify(bucket: string): boolean {
  const now = Date.now();
  if (now - (lastNotice.get(bucket) ?? 0) < 3_600_000) return false;
  lastNotice.set(bucket, now);
  return true;
}

/** Вернуть пачку без шагов в корзину и закрыть. true — откатили. */
export async function revertIfUntouched(id: string, msg: string): Promise<boolean> {
  const rows = await mcpExec(
    `WITH b AS (
       UPDATE yuplink.money_batch SET status = 'closed', updated_at = now(),
              error = ${sqlStr(`не ушла, вернулась в корзину: ${msg}`.slice(0, 500))}
        WHERE id = ${sqlStr(id)} AND status = 'running' AND jsonb_array_length(steps) = 0
        RETURNING id, bucket, token, amount
     ), u AS (
       INSERT INTO yuplink.money_bucket_move (id, bucket, token, amount, kind, ref, note)
       SELECT 'mbm_undo_' || b.id, b.bucket, b.token, b.amount, 'adjust', 'batch:' || b.id || ':undo',
              'пачка не ушла — назад в корзину'
         FROM b
       ON CONFLICT (ref) DO NOTHING
       RETURNING 1
     )
     SELECT row_to_json(_t.*) AS _row FROM (SELECT (SELECT count(*) FROM u)::int AS n) _t;`,
  ).catch(() => null);
  return Number(firstRow<{ n: number }>(rows)?.n) > 0;
}
