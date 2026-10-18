// Страница «Оптимизация»: одна кнопка, статистика и топ-10 медленных запросов.
//
// Пользуется, когда «народу больше и опять лагаем»: VACUUM ANALYZE горячих
// таблиц, сброс серверного снапшота карт, потом — pg_stat_statements top-10.
import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { Gauge, Loader2, Play } from "lucide-react";
import { toast } from "sonner";
import { runOptimization } from "@/server/api/admin-optimize";
import { humanError } from "@/lib/humanError";

export const Route = createFileRoute("/admin/optimize")({
  component: Page,
});

type Result = Awaited<ReturnType<typeof runOptimization>>;

function Page() {
  const run = useMutation<Result, Error, void>({
    mutationFn: () => runOptimization(),
    onSuccess: (r) => toast.success(`Готово · ${r.totalMs} мс, таблиц: ${r.tables.length}`),
    onError: (e) => toast.error(humanError(e)),
  });
  const r = run.data;
  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Gauge className="h-5 w-5 text-gold" />
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Админ
            </div>
            <h1 className="font-display text-xl font-bold">Оптимизация</h1>
          </div>
        </div>
        <button
          type="button"
          onClick={() => run.mutate()}
          disabled={run.isPending}
          className="inline-flex items-center gap-1.5 rounded-xl bg-gold px-4 py-2 text-sm font-bold text-background disabled:opacity-50"
        >
          {run.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          Прогнать оптимизацию
        </button>
      </header>

      <p className="rounded-2xl border border-border bg-card p-3 text-xs text-muted-foreground">
        VACUUM ANALYZE горячих таблиц (позиции, карта, ledger, инвентарь), сброс
        серверного снапшота карты и топ-10 самых тяжёлых запросов за смену.
        Работает под нагрузкой — VACUUM без FULL не блокирует запросы. Если
        играет много народу, будет медленно (это нормально): жди мс и не жми
        второй раз.
      </p>

      {r && (
        <>
          <section className="rounded-2xl border border-border bg-card p-3">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              Таблицы
            </div>
            <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
              {r.tables.map((t) => (
                <div
                  key={t.table}
                  className={
                    "flex items-center justify-between rounded border px-2 py-1 text-[11px] " +
                    (t.ok
                      ? "border-emerald-500/30 bg-emerald-500/5"
                      : "border-destructive/40 bg-destructive/10")
                  }
                >
                  <span className="truncate">{t.table}</span>
                  <span className="text-muted-foreground">{t.ms} мс</span>
                </div>
              ))}
            </div>
          </section>

          {r.indexes.length > 0 && (
            <section className="rounded-2xl border border-border bg-card p-3">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                Индексы
              </div>
              <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                {r.indexes.map((i) => (
                  <div
                    key={i.name}
                    className={
                      "flex items-center justify-between rounded border px-2 py-1 text-[11px] " +
                      (i.ok
                        ? "border-emerald-500/30 bg-emerald-500/5"
                        : "border-destructive/40 bg-destructive/10")
                    }
                    title={i.error}
                  >
                    <span className="truncate">{i.name}</span>
                    <span className="text-muted-foreground">{i.ms} мс</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {r.slow.length > 0 && (
            <section className="rounded-2xl border border-border bg-card p-3">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                Топ-10 тяжёлых запросов
              </div>
              <div className="space-y-2">
                {r.slow.map((s, i) => (
                  <div key={i} className="rounded-lg border border-border/60 p-2">
                    <div className="mb-1 flex items-center justify-between text-[10px] text-muted-foreground">
                      <span>вызовов: {s.calls}</span>
                      <span>
                        среднее {s.mean_ms} мс · всего {s.total_ms} мс
                      </span>
                    </div>
                    <code className="block whitespace-pre-wrap break-all text-[11px] text-muted-foreground">
                      {s.q}
                    </code>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
