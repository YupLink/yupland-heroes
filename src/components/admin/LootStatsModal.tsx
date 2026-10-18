// Попап «Сколько залутали»: по каждому токену — выведено, на счетах, в очереди
// и итог «на руках у игроков». Открывается кнопкой из раздачи DARAI.
import { useQuery } from "@tanstack/react-query";
import { BarChart3, Loader2, X } from "lucide-react";
import { adminGetLootStats } from "@/server/api/admin-loot-stats";
import { humanError } from "@/lib/humanError";

const fmt = (n: number) => n.toLocaleString("ru-RU", { maximumFractionDigits: 2 });

export function LootStatsModal({ onClose }: { onClose: () => void }) {
  const q = useQuery({
    queryKey: ["admin", "loot-stats"],
    queryFn: () => adminGetLootStats(),
    refetchInterval: 60_000,
  });
  const rows = q.data?.rows ?? [];

  return (
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center bg-black/75 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-gold/30 bg-card p-4 pb-[calc(env(safe-area-inset-bottom)+16px)] sm:rounded-3xl sm:pb-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex shrink-0 items-center gap-2">
          <BarChart3 className="h-5 w-5 text-gold" />
          <h3 className="flex-1 font-display text-base font-bold">Сколько залутали игроки</h3>
          <button onClick={onClose} className="text-muted-foreground" aria-label="Закрыть">
            <X className="h-5 w-5" />
          </button>
        </div>

        {q.isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : q.isError ? (
          <p className="py-6 text-center text-sm text-rose-300">{humanError(q.error)}</p>
        ) : (
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
            <p className="text-[11px] text-muted-foreground">
              «На руках» = выведено на кошельки + лежит на счетах + заявки в работе.
            </p>
            {/* Раздача держателям NFT идёт мимо счетов, прямыми переводами со
                склада, и в эти числа не входит — потоки разные. */}
            <p className="text-[11px] text-muted-foreground">
              Считаются только заявки игроков. Раздача держателям (распределение)
              идёт отдельным потоком и сюда не входит.
            </p>
            {rows.map((r) => (
              <div key={r.token} className="rounded-2xl border border-border bg-card/60 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-display text-sm font-bold text-gold">{r.token}</span>
                  <span className="font-mono text-base font-bold">{fmt(r.total)}</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <Stat label="Выведено" value={fmt(r.withdrawn)} />
                  <Stat label="На счетах" value={fmt(r.onAccounts)} />
                  <Stat label="В очереди" value={fmt(r.pending)} />
                </div>
              </div>
            ))}
            {rows.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">Пока пусто.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-secondary/20 px-2 py-1.5">
      <div className="text-[9px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-mono text-[13px] font-bold">{value}</div>
    </div>
  );
}
