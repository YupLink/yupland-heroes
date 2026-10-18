// /admin/mines — сводный отчёт по шахтам карты.
//
// Игроки просили «сводный отчёт о работе шахт: сколько и какого типа сырья
// добывается всего». Одна цифра «всего/час», сколько клеток шахт, сколько
// захвачено, сколько под охраной. Ниже — таблица по видам сырья.
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Pickaxe } from "lucide-react";
import { getMinesReport } from "@/server/api/beta-raid/admin-mines-report";

export const Route = createFileRoute("/admin/mines")({
  component: MinesReportPage,
});

const fmt = (n: number): string =>
  Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);

function MinesReportPage() {
  const q = useQuery({
    queryKey: ["admin-mines-report"],
    queryFn: () => getMinesReport(),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  return (
    <div className="mx-auto max-w-3xl p-4">
      <header className="mb-4">
        <div className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          Админ · шахты
        </div>
        <h1 className="font-display text-2xl font-bold">Сводный отчёт по шахтам</h1>
      </header>

      {q.isLoading || !q.data ? (
        <div className="flex h-32 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <section className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Card label="Шахт на карте" value={q.data.totalCells} />
            <Card label="Захвачено" value={q.data.ownedCells} tone="own" />
            <Card label="Под охраной" value={q.data.guardedCells} tone="guarded" />
            <Card
              label="Всего/час"
              value={fmt(q.data.totalPerHour)}
              tone="gold"
            />
          </section>

          <section className="rounded-2xl border border-border bg-card">
            <header className="border-b border-border px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              По видам сырья
            </header>
            {q.data.byResource.length === 0 ? (
              <p className="p-4 text-center text-sm text-muted-foreground">
                Шахт с настроенной добычей нет.
              </p>
            ) : (
              <table className="w-full text-[12px]">
                <thead className="bg-background text-[10px] uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold">
                      <Pickaxe className="mr-1 inline h-3 w-3" />
                      Сырьё
                    </th>
                    <th className="px-2 py-2 text-right font-semibold">
                      Шахт всего
                    </th>
                    <th className="px-2 py-2 text-right font-semibold">Захвач.</th>
                    <th className="px-2 py-2 text-right font-semibold">/час (все)</th>
                    <th className="px-2 py-2 text-right font-semibold">/час (акт.)</th>
                  </tr>
                </thead>
                <tbody>
                  {q.data.byResource.map((r) => (
                    <tr key={r.name} className="border-t border-border/60">
                      <td className="px-3 py-1.5 font-semibold">{r.name}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">
                        {r.count}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-emerald-300">
                        {r.ownedCount}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                        {fmt(r.perHour)}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums font-semibold text-gold">
                        {fmt(r.ownedPerHour)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <p className="mt-3 text-[10px] text-muted-foreground">
            «/час (акт.)» — реально сейчас капает: считаем только те шахты, у
            которых есть владелец (raid_mine_state.owner_account IS NOT NULL).
            «/час (все)» — потенциал, если бы все шахты были захвачены. Данные
            обновляются раз в минуту.
          </p>
        </>
      )}
    </div>
  );
}

function Card({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone?: "own" | "guarded" | "gold";
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
      <div
        className={
          "mt-1 font-display text-2xl font-bold tabular-nums " +
          (tone === "own"
            ? "text-emerald-300"
            : tone === "guarded"
              ? "text-amber-300"
              : tone === "gold"
                ? "text-gold"
                : "")
        }
      >
        {value}
      </div>
    </div>
  );
}
