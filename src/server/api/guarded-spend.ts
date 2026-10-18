// Списание, которое переживает и параллельное нажатие, и слепой повтор.
//
// Два требования тянут в разные стороны.
//   • Гонка: «прочитал остаток → записал абсолют» пропускает два нажатия по
//     одному числу. Лечится относительным `SET x = x - цена` с условием.
//   • Повтор: mcpExec шлёт пишущий запрос ЗАНОВО, если ответ потерялся
//     (таймаут, обрыв SSE, 502) — и относительное списание применяется дважды.
//
// Отметка снимает противоречие. В `updated_at` пишем МЕТКУ ЭТОЙ операции, а в
// условие ставим «метка ещё не наша». Тогда:
//   первый заход — строка меняется, метка встаёт;
//   повтор того же запроса — условие ложно, ноль строк, но метка уже наша, и
//     по ней видно, что списание состоялось;
//   чужое нажатие — метка не наша, остаток другой, честный отказ.
import { mcpExec } from "../db/mcpClient";
import { sqlStr } from "./chips-utils";

/** Уникальная метка операции. Микросекунды + случайный хвост. */
function marker(): string {
  const rnd = Math.floor(Math.random() * 900_000) + 100_000;
  // Метка живёт в timestamptz, поэтому это должна быть валидная дата.
  // Микросекундный хвост делает её уникальной для этой операции.
  const base = new Date().toISOString().replace("Z", "");
  return `${base}${String(rnd).slice(0, 3)}+00`;
}

export type SpendResult = { ok: boolean; row: Record<string, unknown> | null };

/**
 * Одно списание с условием. `table` и `where` подставляются как есть — их
 * задаёт код, не игрок; все значения из запроса обязаны пройти sqlStr/Number
 * на стороне вызывающего.
 *
 * @param set   присваивания без updated_at, например
 *              `awareness = awareness - 10, chest_open_count = chest_open_count + 1`
 * @param cond  условие, при котором списание допустимо, например `awareness >= 10`
 * @param ret   что вернуть, например `chest_open_count`
 */
export async function guardedSpend(opts: {
  table: string;
  where: string;
  set: string;
  cond: string;
  ret: string;
}): Promise<SpendResult> {
  const mk = marker();
  const rows = (await mcpExec(
    `UPDATE ${opts.table}
        SET ${opts.set}, updated_at = ${sqlStr(mk)}::timestamptz
      WHERE ${opts.where} AND ${opts.cond}
        AND updated_at IS DISTINCT FROM ${sqlStr(mk)}::timestamptz
      RETURNING ${opts.ret};`,
    { wrapJsonCte: true },
  )) as Array<Record<string, unknown>> | null;
  if (rows?.length) return { ok: true, row: rows[0] };

  // Ноль строк — либо не хватило, либо это повтор нашего же запроса. Метка
  // отвечает однозначно.
  const mine = (await mcpExec(
    `SELECT ${opts.ret} FROM ${opts.table}
      WHERE ${opts.where} AND updated_at = ${sqlStr(mk)}::timestamptz LIMIT 1;`,
    { wrapJson: true },
  )) as Array<Record<string, unknown>> | null;
  if (mine?.length) return { ok: true, row: mine[0] };
  return { ok: false, row: null };
}
