// Таблица операций: сколько раз, сколько заняло, где худший случай.
import type { PerfRow } from "@/server/perf/trace";

/** Порог, выше которого строку стоит смотреть глазами. */
const WARN_MS = 400;

export function PerfOpsTable({ rows }: { rows: PerfRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Пока пусто — счётчики наполняются по мере того, как в игру кто-то играет.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-border/60">
      <table className="w-full text-left text-xs">
        <thead className="bg-muted/40 text-[10px] uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-2 py-1.5">Операция</th>
            <th className="px-2 py-1.5 text-right">Раз</th>
            <th className="px-2 py-1.5 text-right">Средн.</th>
            <th className="px-2 py-1.5 text-right">Медиана</th>
            <th className="px-2 py-1.5 text-right">95%</th>
            <th className="px-2 py-1.5 text-right">Худш.</th>
            <th className="px-2 py-1.5 text-right">Сбоев</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name} className="border-t border-border/40 align-top">
              <td className="px-2 py-1.5">
                <span className={r.p95 >= WARN_MS ? "text-amber-400" : ""}>{r.name}</span>
                {r.slow.length > 0 && (
                  <div className="mt-0.5 space-y-0.5 text-[10px] text-muted-foreground">
                    {r.slow.slice(-3).map((s, i) => (
                      <div key={i}>
                        {s.ms} мс{s.note ? ` · ${s.note}` : ""}
                      </div>
                    ))}
                  </div>
                )}
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums">{r.n}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{r.avg}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{r.p50}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">
                <span className={r.p95 >= WARN_MS ? "font-semibold text-amber-400" : ""}>
                  {r.p95}
                </span>
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums">{r.max}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">
                {r.errors > 0 ? <span className="text-red-400">{r.errors}</span> : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
