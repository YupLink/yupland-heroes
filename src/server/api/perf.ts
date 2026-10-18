// Отчёт о скорости: что на сервере тормозит прямо сейчас.
//
// Секундомер (perf/trace) копит замеры в памяти процесса — здесь их забирает
// админский экран. Плюс два внешних источника, без которых картина неполная:
// самые дорогие запросы самой базы (pg_stat_statements) и таблицы, по которым
// она ходит перебором — именно так выглядит забытый индекс.
import { createServerFn } from "@tanstack/react-start";
import { requireAdmin } from "../auth";
import { mcpExec } from "../db/mcpClient";
import { perfSnapshot, perfReset, type PerfRow } from "../perf/trace";

/** Дорогой запрос глазами самой базы. */
export type SlowQuery = {
  вызовов: number;
  среднее: number;
  всего: number;
  запрос: string;
};

/** Таблица, по которой база ходит перебором чаще, чем по индексу. */
export type ScanWarning = {
  таблица: string;
  переборов: number;
  строкЗаПеребор: number;
  поИндексу: number;
};

export type PerfReport = {
  /** С какого момента копятся замеры (мс эпохи). */
  since: number;
  /** Сколько живёт процесс — после выката счётчики начинаются заново. */
  uptimeMs: number;
  операции: PerfRow[];
  запросыБазы: SlowQuery[];
  переборы: ScanWarning[];
  /** Почему список запросов пуст, если он пуст. */
  заметка?: string;
};

const startedAt = Date.now();

/**
 * pg_stat_statements живёт в схеме extensions (так поставлен на этом сервере),
 * и его может не быть вовсе — тогда просто пропускаем этот раздел.
 */
async function slowQueries(): Promise<{ rows: SlowQuery[]; note?: string }> {
  try {
    const rows = (await mcpExec(
      `SELECT calls, round(mean_exec_time::numeric, 1) AS mean_ms,
              round(total_exec_time::numeric) AS total_ms,
              left(regexp_replace(query, '\\s+', ' ', 'g'), 160) AS q
         FROM extensions.pg_stat_statements
        WHERE query NOT ILIKE '%pg_stat_statements%'
        ORDER BY total_exec_time DESC LIMIT 15;`,
      { wrapJson: true },
    )) as Array<{ calls: number; mean_ms: number; total_ms: number; q: string }>;
    return {
      rows: (rows ?? []).map((r) => ({
        вызовов: Number(r.calls) || 0,
        среднее: Number(r.mean_ms) || 0,
        всего: Number(r.total_ms) || 0,
        запрос: String(r.q ?? ""),
      })),
    };
  } catch (e) {
    return { rows: [], note: `Статистика запросов недоступна: ${(e as Error).message}` };
  }
}

/**
 * Перебор вместо индекса. Смотрим только на заметные таблицы: у маленьких
 * справочников перебор дешевле индекса, и ругаться на них — шум.
 */
async function scanWarnings(): Promise<ScanWarning[]> {
  try {
    const rows = (await mcpExec(
      `SELECT relname, seq_scan, idx_scan,
              CASE WHEN seq_scan > 0 THEN (seq_tup_read / seq_scan) ELSE 0 END AS per_scan
         FROM pg_stat_user_tables
        WHERE schemaname = 'yuplink' AND seq_scan > 50
          AND (seq_tup_read / GREATEST(seq_scan, 1)) > 5000
        ORDER BY seq_tup_read DESC LIMIT 10;`,
      { wrapJson: true },
    )) as Array<{ relname: string; seq_scan: number; idx_scan: number; per_scan: number }>;
    return (rows ?? []).map((r) => ({
      таблица: String(r.relname),
      переборов: Number(r.seq_scan) || 0,
      строкЗаПеребор: Number(r.per_scan) || 0,
      поИндексу: Number(r.idx_scan) || 0,
    }));
  } catch {
    return [];
  }
}

export const getPerfReport = createServerFn({ method: "GET" }).handler(
  async (): Promise<PerfReport> => {
    requireAdmin();
    const [snap, slow, scans] = await Promise.all([
      Promise.resolve(perfSnapshot()),
      slowQueries(),
      scanWarnings(),
    ]);
    return {
      since: snap.since,
      uptimeMs: Date.now() - startedAt,
      операции: snap.rows,
      запросыБазы: slow.rows,
      переборы: scans,
      заметка: slow.note,
    };
  },
);

/** Обнулить счётчики — чтобы померить «до и после» правки. */
export const resetPerfReport = createServerFn({ method: "POST" }).handler(async () => {
  requireAdmin();
  perfReset();
  return { ok: true as const };
});
