// Рыба от красного динамита при «Открыть» (владелец, 30.10.2026; lib/raid/dynamiteFish):
// «там ещё башмак — тогда, когда открываешь рыбу забрать, пусть пишет „Упс,
// показалось“». Рыба — мешочек (§8.21), и открывают её тем же платным входом (§8.23);
// внутри башмака — одна порция-метка FISH_BOOT_KEY.
//
// Метку снимает ТОТ ЖЕ оператор, что пишет оплаченный вход (open-pass/pass-sql): лок
// мешочка, порция башмака — в ноль (живых порций нет — рыба исчезает у всех), ответ
// boot. Строка с нулём остаётся до сборщика (10 минут тишины мешочка): повтор того же
// нажатия — и слепой повтор моста, и повтор ручки, когда рыбы уже «нет», — снова видит,
// что это был башмак, и снова отвечает «Упс, показалось», ничего не списав.
// Здесь только SQL; комментарии внутри SQL — только блочные.
import { sqlStr } from "@/server/api/raid-shared";
import { FISH_BOOT_KEY } from "@/lib/raid/dynamiteFish";
import { bagLockSql } from "@/server/api/beta-raid/loot-bag/bag-sql";

/** Порция-метка башмака мешочка `bag` (SQL-литерал id), живая или уже снятая. */
const bootRow = (bag: string): string =>
  `EXISTS (SELECT 1 FROM yuplink.raid_loot_bag_item bi
            WHERE bi.bag_id = ${bag} AND bi.stack_key = ${sqlStr(FISH_BOOT_KEY)})`;

/** Лок мешочка перед входом — отдельным оператором (как у «Забрать»). */
export const bootLockSql = (bagId: string): string => bagLockSql(bagId);

/**
 * CTE снятия метки: вход этого нажатия записан (put) или даром (free — повтор, живой
 * вход) — порция башмака в ноль, мешочку — новая версия (сборщик ждёт тишины).
 * Ставится после CTE put и free оператора входа.
 */
export function bootCtes(bagId: string): string {
  const id = sqlStr(bagId);
  return `boot AS (
       UPDATE yuplink.raid_loot_bag_item bi SET count = 0
        WHERE bi.bag_id = ${id} AND bi.stack_key = ${sqlStr(FISH_BOOT_KEY)} AND bi.count > 0
          AND (EXISTS (SELECT 1 FROM put) OR EXISTS (SELECT 1 FROM free))
       RETURNING bi.bag_id
     ),
     boot_touch AS (
       UPDATE yuplink.raid_loot_bag lb SET updated_at = now()
        WHERE lb.id = ${id} AND EXISTS (SELECT 1 FROM boot)
       RETURNING 1
     )`;
}

/** Колонка ответа входа: открыли (или повторили) рыбу, которая была башмаком. */
export const bootAnswerSql = (bagId: string): string =>
  `((EXISTS (SELECT 1 FROM put) OR EXISTS (SELECT 1 FROM free)) AND ${bootRow(sqlStr(bagId))})`;

/**
 * Повтор ручки «Открыть», когда рыбы уже не видно (метку сняло это же нажатие): вход
 * этого нажатия записан и у мешочка есть строка башмака — ответ «Упс, показалось».
 */
export const bootAgainSql = (o: {
  account: string;
  /** Цель входа мешочка (pass-sql.bagTarget). */
  target: string;
  bagId: string;
  op: string;
}): string =>
  `SELECT (EXISTS (SELECT 1 FROM yuplink.raid_open_pass p
                    WHERE p.account_id = ${sqlStr(o.account)} AND p.target = ${sqlStr(o.target)}
                      AND p.op = ${sqlStr(o.op)})
           AND ${bootRow(sqlStr(o.bagId))}) AS boot;`;
