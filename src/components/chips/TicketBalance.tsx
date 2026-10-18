import { useTickets } from "@/lib/hooks/useTickets";
import { useLang } from "@/lib/i18n";
import { Button } from "@/components/ui/button";

/** Shares the game's ticket cache and refreshes after trading/purchases. */
export function TicketBalance() {
  const ru = useLang() === "ru";
  const tickets = useTickets();
  const amount = (tickets.data && "availableRaw" in tickets.data ? tickets.data.availableRaw : tickets.data?.available);
  return (
    <section
      aria-label={ru ? "Баланс билетов" : "Ticket balance"}
      className="flex min-h-16 flex-wrap items-center justify-between gap-3 rounded-2xl border border-gold/25 bg-gold/5 px-4 py-3"
    >
      <span className="text-sm font-medium text-muted-foreground">
        {ru ? "Твои билеты" : "Your tickets"}
      </span>
      {tickets.isError ? (
        <Button variant="outline" size="sm" onClick={() => void tickets.refetch()}>
          {ru ? "Повторить загрузку" : "Retry balance"}
        </Button>
      ) : (
        <span role="status" className="text-xl font-bold tabular-nums text-gold">
          {tickets.isPending || amount == null
            ? "…"
            : Number(amount).toLocaleString(ru ? "ru" : "en", { maximumFractionDigits: 2 })}
        </span>
      )}
    </section>
  );
}
