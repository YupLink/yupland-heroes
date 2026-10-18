// Сгоревший турнирный приз в DARAI — назад в пул карты (слово владельца:
// 48 часов на забор; не забрал — DARAI возвращается в пул, остальное сгорает).
//
// Зовётся из зачистки подарков (gifts-expire.ts) после перевода просроченных
// в 'expired'. Одним оператором по всем сгоревшим турнирным подаркам, а не
// только по только что сгоревшим: клейм тоже переводит просроченный подарок в
// 'expired' (whyNotClaimed), и такие строки подхватит ближайшая зачистка.
// Ключ возврата 'tour-x:<id подарка>' — UNIQUE ref пула: повтор не вернёт дважды.
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { TOUR_DARAI } from "@/lib/tournament/types";

export const TOUR_GIFT_PREFIX = "tour:";

export const expiredTourDaraiSql = (): string =>
  `INSERT INTO yuplink.darai_pool_move (id, pool, kind, amount, ref, note, op_id)
   SELECT 'dp_' || substr(md5(random()::text || g.id), 1, 16), 'map', 'map_release', g.amount,
          'tour-x:' || g.id, left('Турнир: приз сгорел — ' || COALESCE(g.title, ''), 500),
          'dpm_' || substr(md5(g.id), 1, 12)
     FROM yuplink.player_gift g
    WHERE g.status = 'expired'
      AND left(g.source_ref, ${TOUR_GIFT_PREFIX.length}) = ${sqlStr(TOUR_GIFT_PREFIX)}
      AND g.kind = 'token' AND g.ref_id = ${sqlStr(TOUR_DARAI)} AND g.amount > 0
   ON CONFLICT (ref) DO NOTHING;`;

/** Вернуть DARAI сгоревших турнирных призов. Фон: ошибку не бросаем. */
export async function returnExpiredTourDarai(): Promise<void> {
  await mcpExec(expiredTourDaraiSql()).catch((e) =>
    console.warn("[tour] возврат сгоревших призов в пул:", e instanceof Error ? e.message : e),
  );
}
