import { useQuery } from "@tanstack/react-query";
import { getMaintenanceStatus } from "@/server/api/maintenance";

// Полноэкранный оверлей на время сервисных работ. Опрашивает статус и сам
// исчезает, когда работы закончены. Блокирует любое взаимодействие с UI.
// Раз в минуту (14.10.2026: было 15 с — лишние запросы и перерисовки в покое;
// работы включают редко, минута до оверлея ничего не ломает).
export function MaintenanceGate() {
  const { data } = useQuery({
    queryKey: ["maintenance-status"],
    queryFn: () => getMaintenanceStatus(),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
  if (!data?.on) return null;
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-background/95 px-6 backdrop-blur-md">
      <div className="max-w-sm text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-gold/30 bg-gold/10 text-3xl">
          🛠
        </div>
        <h1 className="mt-5 font-display text-2xl font-bold">Технические работы</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          {data.message}
        </p>
        <p className="mt-4 text-xs text-muted-foreground">
          Страница обновится сама, как только закончим.
        </p>
      </div>
    </div>
  );
}
