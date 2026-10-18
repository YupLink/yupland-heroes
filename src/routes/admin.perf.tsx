// «Скорость» — что на сервере тормозит прямо сейчас. Только для владельца.
//
// Экран отвечает на вопрос, который иначе приходится решать гаданием: игрок
// говорит «ход стал долгим», а сервер на моей машине быстрый. Здесь видно
// каждую операцию с её худшими случаями, очередь к базе, повторы после
// обрывов и самые дорогие запросы глазами самой базы.
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Gauge, ShieldAlert, RotateCcw } from "lucide-react";
import { getPerfReport, resetPerfReport } from "@/server/api/perf";
import { getSession } from "@/server/api/user-auth";
import { PerfOpsTable } from "@/components/admin/perf/PerfOpsTable";
import { PerfDbTables } from "@/components/admin/perf/PerfDbTables";

export const Route = createFileRoute("/admin/perf")({ component: AdminPerf });

/** «5 мин» вместо 300000 мс. */
function human(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 90) return `${s} с`;
  const m = Math.round(s / 60);
  return m < 90 ? `${m} мин` : `${Math.round(m / 60)} ч`;
}

function AdminPerf() {
  const qc = useQueryClient();
  const session = useQuery({ queryKey: ["session"], queryFn: () => getSession() });
  const q = useQuery({
    queryKey: ["admin-perf"],
    queryFn: () => getPerfReport(),
    enabled: !!session.data?.isAdmin,
    // Экран смотрят, пока кто-то играет: свежие числа важнее экономии запроса.
    refetchInterval: 5000,
  });
  const reset = useMutation({
    mutationFn: () => resetPerfReport(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-perf"] }),
  });

  if (session.isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-gold" />
      </div>
    );
  }
  if (!session.data?.isAdmin) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 px-4 py-16 text-center">
        <ShieldAlert className="h-10 w-10 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Раздел только для админа.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5 px-4 py-5 pb-24">
      <div className="flex items-center gap-2">
        <Gauge className="h-5 w-5 text-gold" />
        <h1 className="font-display text-xl font-bold">Скорость</h1>
        {q.data && (
          <span className="ml-auto text-xs text-muted-foreground">
            копится {human(Date.now() - q.data.since)} · процесс живёт{" "}
            {human(q.data.uptimeMs)}
          </span>
        )}
      </div>

      <button
        onClick={() => reset.mutate()}
        disabled={reset.isPending}
        className="flex items-center gap-1.5 rounded-lg border border-border/60 px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground"
      >
        <RotateCcw className="h-3.5 w-3.5" />
        Обнулить счётчики
      </button>

      {q.isLoading && (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {q.data && (
        <>
          <section className="space-y-2">
            <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Операции сервера
            </h2>
            <PerfOpsTable rows={q.data.операции} />
            <p className="text-[11px] text-muted-foreground">
              «бд: запрос» — поход в базу вместе с повторами, «бд: очередь» — сколько он ждал
              своей очереди к мосту. У шага в примечании стоит разбивка по волнам.
            </p>
          </section>
          <PerfDbTables report={q.data} />
        </>
      )}
    </div>
  );
}
