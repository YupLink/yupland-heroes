// Solana — контроль привязок и поступлений. Только для владельца. Только чтение.
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { getSession } from "@/server/api/user-auth";
import { solanaAdminList, solanaAdminDeposits } from "@/server/api/solana";

export const Route = createFileRoute("/admin/solana")({ component: AdminSolana });

function AdminSolana() {
  const session = useQuery({ queryKey: ["session"], queryFn: () => getSession() });
  const isAdmin = !!session.data?.isAdmin;
  const list = useQuery({
    queryKey: ["admin-solana-list"],
    queryFn: () => solanaAdminList(),
    enabled: isAdmin,
  });
  const dep = useQuery({
    queryKey: ["admin-solana-deposits"],
    queryFn: () => solanaAdminDeposits(),
    enabled: isAdmin,
    refetchInterval: 15000,
  });

  if (session.isLoading)
    return (
      <div className="flex justify-center p-10">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  if (!isAdmin) return <div className="p-6 text-sm text-muted-foreground">Только владелец.</div>;

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4">
      <h1 className="font-display text-xl font-bold">Solana</h1>

      <section className="rounded-xl border border-border/50 bg-card p-4">
        <div className="text-xs font-bold text-muted-foreground">НАШ АДРЕС (поступления)</div>
        <div className="mt-1 break-all font-mono text-sm">{dep.data?.address ?? "…"}</div>
        <div className="mt-1 text-sm">
          Баланс: <span className="font-semibold">{dep.data?.sol ?? "…"} SOL</span>
        </div>
        <div className="mt-3 text-xs font-bold text-muted-foreground">ПОСЛЕДНИЕ ТРАНЗАКЦИИ</div>
        {dep.data?.recent?.length ? (
          <ul className="mt-1 space-y-1">
            {dep.data.recent.map((r) => (
              <li key={r.signature} className="flex items-center justify-between gap-2 text-xs">
                <span className="truncate font-mono">{r.signature.slice(0, 32)}…</span>
                <span className={r.failed ? "text-destructive" : "text-emerald-400"}>
                  {r.failed ? "ошибка" : "ok"}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-1 text-xs text-muted-foreground">Поступлений пока нет.</div>
        )}
      </section>

      <section className="rounded-xl border border-border/50 bg-card p-4">
        <div className="text-xs font-bold text-muted-foreground">
          ПРИВЯЗАННЫЕ КОШЕЛЬКИ ({list.data?.count ?? 0})
        </div>
        {list.data?.wallets?.length ? (
          <ul className="mt-2 space-y-1">
            {list.data.wallets.map((w) => (
              <li key={w.account_id} className="flex items-center justify-between gap-2 text-xs">
                <span className="truncate font-mono">
                  {w.address.slice(0, 10)}…{w.address.slice(-6)}
                </span>
                <span className="text-muted-foreground">{w.account_id.slice(0, 10)}…</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-2 text-xs text-muted-foreground">Пока никто не привязал.</div>
        )}
      </section>
    </div>
  );
}
