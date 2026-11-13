import { useResources } from "@/lib/hooks/useResources";
import { useLang } from "@/lib/i18n";
import { Button } from "@/components/ui/button";

/**
 * Баланс над магазином паков и рынком. Билетов нет с 20.10.2026 (ПРАВИЛА §8.61):
 * здесь золото — общий кэш ресурсов ["my-resources"], обновляется после трат.
 * Имя компонента прежнее, чтобы не трогать места, где он стоит.
 */
export function TicketBalance() {
  const ru = useLang() === "ru";
  const resources = useResources();
  const amount = resources.data?.gold;
  return (
    <section
      aria-label={ru ? "Баланс золота" : "Gold balance"}
      className="flex min-h-16 flex-wrap items-center justify-between gap-3 rounded-2xl border border-gold/25 bg-gold/5 px-4 py-3"
    >
      <span className="text-sm font-medium text-muted-foreground">
        {ru ? "Твоё золото" : "Your gold"}
      </span>
      {resources.isError ? (
        <Button variant="outline" size="sm" onClick={() => void resources.refetch()}>
          {ru ? "Повторить загрузку" : "Retry balance"}
        </Button>
      ) : (
        <span role="status" className="text-xl font-bold tabular-nums text-gold">
          {resources.isPending || amount == null
            ? "…"
            : Math.floor(amount).toLocaleString(ru ? "ru" : "en")}
        </span>
      )}
    </section>
  );
}
