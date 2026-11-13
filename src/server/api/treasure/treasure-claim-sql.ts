// Клад — тому, чья копка забрала клетку (lib/treasure, §8.117). Эти CTE
// вставляются в оператор копки (ground-dig-sql groundMarkSql) после `mark`:
// клад «найден» тем же оператором, что пишет ямку и ключ нажатия. Записалось
// одно — записалось всё; ответ потерялся — повтор нажатия найдёт клад по
// found_op = ключ нажатия. Приз уходит из фонда здесь же.
import { sqlStr } from "@/server/api/raid-shared";

export function treasureClaimCtes(o: { treasureId: string; account: string; op: string }): string {
  return `trs AS (
       UPDATE yuplink.raid_treasure
          SET status = 'found', found_by = ${sqlStr(o.account)}, found_op = ${sqlStr(o.op)},
              found_at = now()
        WHERE id = ${sqlStr(o.treasureId)} AND status = 'live' AND expires_at > now()
          AND EXISTS (SELECT 1 FROM mark)
       RETURNING fund_id
     ),
     trf AS (
       UPDATE yuplink.raid_treasure_fund x SET used_at = now()
         FROM trs WHERE x.id = trs.fund_id AND x.used_at IS NULL
       RETURNING 1
     )`;
}
