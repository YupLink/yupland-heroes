// Текст кода занят — в ЛЮБОЙ из двух систем. Профиль спрашивает сначала новые
// промокоды, потом коды на лайки: одинаковый текст в обеих сделал бы код на
// лайки недостижимым. Поэтому заводить нельзя ни новый поверх старого (это
// проверяет createSql), ни код на лайки поверх нового (здесь —
// adminCreateLikePromocode зовёт эту проверку).
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import { isMissingSchema } from "./promo-sql";

export const codeTakenSql = (code: string): string =>
  `SELECT (EXISTS (SELECT 1 FROM yuplink.like_promocodes WHERE code = ${sqlStr(code)})
        OR EXISTS (SELECT 1 FROM yuplink.promo_code WHERE code = ${sqlStr(code)})) AS taken`;

type Row = { taken?: boolean };

/** Код (уже нормализованный) занят кодом на лайки или новым промокодом. */
export async function codeTaken(code: string): Promise<boolean> {
  let rows: Row[];
  try {
    rows = (await mcpExec(codeTakenSql(code), { wrapJson: true })) as Row[];
  } catch (e) {
    // Миграция promo-01 ещё не накатана — новых кодов нет, смотрим только лайки.
    if (!isMissingSchema(e)) throw e;
    rows = (await mcpExec(
      `SELECT EXISTS (SELECT 1 FROM yuplink.like_promocodes WHERE code = ${sqlStr(code)}) AS taken`,
      { wrapJson: true },
    )) as Row[];
  }
  return rows?.[0]?.taken === true;
}
