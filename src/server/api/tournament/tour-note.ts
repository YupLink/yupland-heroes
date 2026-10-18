// Живые очки турнира: хук в месте события (рубка топором, шаг).
//
// Хук стоит в горячих путях (шаг — самый частый запрос игры), поэтому сначала
// спрашиваем память процесса: какие категории сейчас идут. Кэш до 30 секунд
// (и не дольше ближайшего старта по расписанию);
// нет идущих турниров этой категории — ни одного запроса к базе.
// «Идёт» — пока турнир не подведён: и после конца до захвата выплаты, и на
// выплате (аудит 14.10.2026). Очко со временем штук (улов) за поимки до конца
// ложится и тогда (tour-sql.noteTimedSql); прочие очки отсекает сам оператор
// (status 'running', конец не наступил).
//
// Сама запись — один оператор (tour-sql.noteSql): очко во все идущие турниры
// категории с ключом-доказательством и прибавка к счёту только за реально
// вставленное. Ошибку наружу не бросаем: турнир не имеет права сломать шаг
// или рубку (как журнал сделок, ПРАВИЛА §8.13).
import { mcpExec } from "../../db/mcpClient";
import type { TourMetric } from "@/lib/tournament/types";
import { noteSql, noteTimedSql } from "@/server/api/tournament/tour-sql";

const TTL_MS = 30_000;
/** Начало по расписанию наступило, а тикер ещё не запустил — спрашиваем чаще. */
const DUE_TTL_MS = 2_000;
let live: { until: number; metrics: Set<string> } | null = null;
let loading: Promise<Set<string>> | null = null;

type LiveRow = { metric: string | null; next_ms?: number | string | null; due?: boolean | null };

/**
 * Что идёт + когда ближайший старт по расписанию. Кэш не переживает этот
 * старт: иначе процесс, спросивший в 23:59:50, до 00:00:20 не видел бы турнир,
 * запущенный соседним воркером, и шаги этих секунд пропадали бы.
 */
async function loadLive(): Promise<{ metrics: Set<string>; until: number }> {
  const at = Date.now();
  const rows = (await mcpExec(
    `SELECT DISTINCT metric, NULL::float8 AS next_ms, NULL::boolean AS due FROM yuplink.tournament
      WHERE status IN ('running', 'paying') AND started_at <= now()
     UNION ALL
     SELECT NULL, extract(epoch from min(start_at) FILTER (WHERE start_at > now())) * 1000,
            bool_or(start_at <= now())
       FROM yuplink.tournament
      WHERE status = 'draft' AND start_at > now() - interval '2 minutes';`,
    { wrapJson: true },
  )) as LiveRow[] | null;
  let until = at + TTL_MS;
  for (const r of rows ?? []) {
    const next = Number(r.next_ms);
    if (r.next_ms != null && Number.isFinite(next)) until = Math.min(until, next + 1_000);
    if (r.due === true) until = Math.min(until, at + DUE_TTL_MS);
  }
  const metrics = new Set((rows ?? []).filter((r) => r.metric).map((r) => String(r.metric)));
  return { metrics, until: Math.max(at + 1_000, until) };
}

/** Какие категории идут или ещё не подведены (из памяти процесса, до 30 с). Сбой базы — «никакие». */
export async function liveTourMetrics(): Promise<Set<string>> {
  if (live && Date.now() < live.until) return live.metrics;
  if (!loading) {
    loading = loadLive()
      .catch(() => ({ metrics: new Set<string>(), until: Date.now() + TTL_MS }))
      .then((got) => {
        live = got;
        return got.metrics;
      })
      .finally(() => {
        loading = null;
      });
  }
  return loading;
}

/** Турнир запустили или закончили — прежний ответ «что идёт» больше не годится. */
export function dropTourCache(): void {
  live = null;
}

/**
 * Очко игроку во все идущие турниры категории. ref — ключ события (уникален на
 * событие): повтор с тем же ключом не засчитается второй раз. times — время
 * каждой штуки (мс; улов): тогда в зачёт только штуки внутри турнира и не
 * раньше записи, а не все qty «сейчас».
 */
export async function noteTournament(
  account: string,
  metric: TourMetric,
  qty: number,
  ref: string,
  times?: readonly number[],
): Promise<void> {
  if (!account || !(qty > 0) || !Number.isFinite(qty)) return;
  const metrics = await liveTourMetrics();
  if (!metrics.has(metric)) return;
  const sql = times?.length
    ? noteTimedSql({ metric, account, ref, times })
    : noteSql({ metric, account, qty, ref });
  await mcpExec(sql).catch((e) =>
    console.warn("[tour] очко не записалось:", e instanceof Error ? e.message : e),
  );
}
