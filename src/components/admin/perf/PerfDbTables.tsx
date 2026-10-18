// Что видит сама база: дорогие запросы и таблицы, которые она читает перебором.
import type { PerfReport } from "@/server/api/perf";

export function PerfDbTables({ report }: { report: PerfReport }) {
  return (
    <>
      <section className="space-y-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Дорогие запросы базы
        </h2>
        {report.заметка && <p className="text-xs text-muted-foreground">{report.заметка}</p>}
        {report.запросыБазы.length > 0 && (
          <div className="space-y-1.5">
            {report.запросыБазы.map((q, i) => (
              <div key={i} className="rounded-lg border border-border/60 px-2 py-1.5 text-[11px]">
                <div className="flex gap-3 text-muted-foreground">
                  <span className="tabular-nums">{q.вызовов} вызовов</span>
                  <span className="tabular-nums">средн. {q.среднее} мс</span>
                  <span className="tabular-nums">всего {Math.round(q.всего / 1000)} с</span>
                </div>
                <div className="mt-0.5 break-all font-mono text-[10px] opacity-80">{q.запрос}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Читаются перебором
        </h2>
        {report.переборы.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Таких таблиц нет — база везде ходит по индексам.
          </p>
        ) : (
          <div className="space-y-1">
            {report.переборы.map((s) => (
              <div
                key={s.таблица}
                className="flex items-center gap-3 rounded-lg border border-amber-500/40 px-2 py-1.5 text-[11px]"
              >
                <span className="font-medium">{s.таблица}</span>
                <span className="text-muted-foreground tabular-nums">
                  {s.переборов} переборов, по {s.строкЗаПеребор.toLocaleString("ru")} строк
                </span>
                <span className="ml-auto text-muted-foreground tabular-nums">
                  по индексу {s.поИндексу}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
