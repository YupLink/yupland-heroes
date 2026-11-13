// Отметка выпуска «Вестника героев» в yuplink.settings: vestnik_sent:<выпуск>.
// Значение — «состояние|секунды|попытки»:
//   sending — кто-то шлёт; дольше 15 минут — процесс умер посреди, можно заново;
//   failed  — Telegram отказал; через 4 минуты повтор, всего до 3 попыток;
//   sent    — вышел; unknown — связь оборвалась, ушло ли — неизвестно: не
//             повторяем (второй выпуск в чате хуже), админам — сигнал.
// Захват — одним запросом: из процессов выпуск шлёт только взявший отметку.
import { sqlStr } from "@/server/api/raid-shared";
import { issueKey, type IssueWindow } from "@/lib/news/vestnikWindow";

export const MAX_ATTEMPTS = 3;
const NOW = "extract(epoch from now())::bigint";

const keyOf = (w: IssueWindow) => sqlStr(`vestnik_sent:${issueKey(w)}`);
const part = (n: number) => `split_part(s.value, '|', ${n})`;
/** Номер попытки; пусто — 0 (на случай чужого значения в строке). */
const tries = `COALESCE(NULLIF(${part(3)}, '')::int, 0)`;

/** Взять выпуск: свежий, отказанный (пауза 4 мин) или брошенный посреди (15 мин). */
export function claimSql(w: IssueWindow): string {
  return `INSERT INTO yuplink.settings AS s (key, value)
     VALUES (${keyOf(w)}, 'sending|' || ${NOW} || '|1')
     ON CONFLICT (key) DO UPDATE
        SET value = 'sending|' || ${NOW} || '|' || (${tries} + 1)
      WHERE ${tries} < ${MAX_ATTEMPTS}
        AND ((${part(1)} = 'failed' AND ${part(2)}::bigint < ${NOW} - 240)
          OR (${part(1)} = 'sending' AND ${part(2)}::bigint < ${NOW} - 900))
     RETURNING 1 AS ok`;
}

export type MarkState = "sent" | "failed" | "unknown";

/** Итог отправки; отдаёт номер попытки — по нему видно, последняя ли. */
export function finishSql(w: IssueWindow, state: MarkState): string {
  return `UPDATE yuplink.settings AS s
     SET value = '${state}|' || ${NOW} || '|' || ${tries}
   WHERE s.key = ${keyOf(w)}
   RETURNING ${tries} AS attempts`;
}
