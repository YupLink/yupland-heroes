// «Казна» — сколько должны игрокам по каждому токену и чем это покрыто.
// Только для владельца: тот же гейт, что у «Выплат».
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Loader2, ShieldAlert, Vault } from "lucide-react";
import { getSession } from "@/server/api/user-auth";
import { adminTreasury } from "@/server/api/currency/admin-treasury";
import { TreasuryTable } from "@/components/admin/treasury/TreasuryTable";
import { TreasuryHeadline } from "@/components/admin/treasury/TreasuryHeadline";
import { AccLedgerTable } from "@/components/admin/treasury/AccLedgerTable";
import { AdjustDialog } from "@/components/admin/treasury/AdjustDialog";

export const Route = createFileRoute("/admin/treasury")({ component: AdminTreasury });

function AdminTreasury() {
  const session = useQuery({ queryKey: ["session"], queryFn: () => getSession() });
  const q = useQuery({
    queryKey: ["admin-treasury"],
    queryFn: () => adminTreasury({ data: {} }),
    enabled: !!session.data?.isPayoutsAdmin,
    refetchInterval: 60_000,
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

  const tokens = (q.data?.rows ?? []).map((r) => r.token);

  return (
    <div className="mx-auto max-w-6xl space-y-5 px-4 py-5">
      <div className="flex items-center gap-2">
        <Vault className="h-5 w-5 text-gold" />
        <h1 className="font-display text-xl font-bold">Казна</h1>
        {q.isFetching && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
      </div>

      {q.isLoading && (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {q.data && (
        <>
          <TreasuryHeadline
            alerts={q.data.alerts}
            waiting={q.data.waiting}
            near={q.data.near}
            wallet={q.data.operatingWallet}
          />
          <TreasuryTable rows={q.data.rows} />
          <section className="space-y-2">
            <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Движения счёта
            </h2>
            <AccLedgerTable tokens={tokens} />
          </section>
          <AdjustDialog tokens={tokens} />
        </>
      )}
    </div>
  );
}
