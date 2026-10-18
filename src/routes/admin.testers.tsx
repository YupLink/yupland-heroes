// Раздел «Тестеры» — ТОЛЬКО для владельца (тот же гейт, что у «Выплат»).
// Группа игроков, которым закрытые механики открываются раньше остальных:
// список кошельков + переключатели механик. Ресурсы и служебные админ-вещи
// сюда не попадают — только игровые механики.
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Loader2, FlaskConical, ShieldAlert } from "lucide-react";
import { adminListTesters } from "@/server/api/testers-admin";
import { getSession } from "@/server/api/user-auth";
import { TesterList } from "@/components/admin/testers/TesterList";
import { TesterFeatureToggles } from "@/components/admin/testers/TesterFeatureToggles";
import { TesterEnergyPanel } from "@/components/admin/testers/TesterEnergyPanel";

export const Route = createFileRoute("/admin/testers")({
  component: AdminTesters,
});

function AdminTesters() {
  const session = useQuery({ queryKey: ["session"], queryFn: () => getSession() });
  const q = useQuery({
    queryKey: ["admin-testers"],
    queryFn: () => adminListTesters(),
    enabled: !!session.data?.isPayoutsAdmin,
  });

  if (session.isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-gold" />
      </div>
    );
  }

  if (!session.data?.isPayoutsAdmin) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 px-4 py-16 text-center">
        <ShieldAlert className="h-10 w-10 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Раздел только для владельца.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5 px-4 py-5">
      <div className="flex items-center gap-2">
        <FlaskConical className="h-5 w-5 text-gold" />
        <h1 className="font-display text-xl font-bold">Тестеры</h1>
        {q.data && (
          <span className="ml-auto text-xs text-muted-foreground">
            {q.data.testers.length} чел.
          </span>
        )}
      </div>

      {q.isLoading && (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {q.data && (
        <>
          <section className="space-y-2">
            <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Что открыто группе
            </h2>
            <TesterFeatureToggles catalog={q.data.catalog} features={q.data.features} />
            <p className="text-[11px] text-muted-foreground">
              Выдача ресурсов и админские настройки сюда не входят — только механики.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Энергия
            </h2>
            <TesterEnergyPanel count={q.data.testers.length} />
          </section>

          <section className="space-y-2">
            <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Кошельки
            </h2>
            <TesterList testers={q.data.testers} />
          </section>
        </>
      )}
    </div>
  );
}
