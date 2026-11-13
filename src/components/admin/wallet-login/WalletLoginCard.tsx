// /admin/wallet-login — статистика входа по кошельку для владельца (06.11.2026):
// места, входы, совпадения устройств у разных аккаунтов и кто входил. Только чтение.
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Wallet } from "lucide-react";
import { useLang, useT } from "@/lib/i18n";
import { humanError } from "@/lib/humanError";
import { adminWalletLoginOverview } from "@/server/api/wallet-login/walletLoginAdmin";

const KIND_KEY: Record<string, string> = {
  new: "walletLogin.kind_new",
  legacy: "walletLogin.kind_legacy",
  tg: "walletLogin.kind_tg",
};

export function WalletLoginCard() {
  const t = useT();
  const ru = useLang() === "ru";
  const q = useQuery({ queryKey: ["admin-wallet-login"], queryFn: () => adminWalletLoginOverview(), staleTime: 0 });
  const date = (s: string) =>
    s ? new Date(s).toLocaleString(ru ? "ru-RU" : "en-US", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";
  const d = q.data;
  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-4" aria-labelledby="wallet-login-title">
      <h2 id="wallet-login-title" className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <Wallet className="h-4 w-4 shrink-0" aria-hidden="true" /> {t("walletLogin.title")}
      </h2>
      {q.isPending ? (
        <p role="status" className="text-sm">{t("google.loading")}</p>
      ) : q.isError || !d ? (
        <div role="alert" className="space-y-2 text-sm">
          <p>{humanError(q.error)}</p>
          <button type="button" onClick={() => void q.refetch()} className="min-h-11 rounded-lg border border-border px-3 py-2">{t("google.retry")}</button>
        </div>
      ) : (
        <>
          <div className="space-y-1 text-sm">
            <p className="text-muted-foreground">{t("walletLogin.legacy", { n: d.legacy })}</p>
            <p className="text-muted-foreground">{t("walletLogin.logins", { day: d.day, week: d.week, wallets: d.weekWallets })}</p>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-semibold">{t("walletLogin.groups")}</h3>
            {d.groups.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("walletLogin.no_groups")}</p>
            ) : (
              <ul className="space-y-2">
                {d.groups.map((g, i) => (
                  <li key={`${g.by}-${i}`} className="rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm">
                    <p className="flex items-center gap-1.5 font-medium">
                      <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
                      {t(`walletLogin.by_${g.by}`)} · {g.wallets.length}
                    </p>
                    <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{g.wallets.join(", ")}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-semibold">{t("walletLogin.who")}</h3>
            {d.who.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("walletLogin.nobody")}</p>
            ) : (
              <ul className="divide-y divide-border rounded-xl border border-border">
                {d.who.map((w) => (
                  <li key={w.wallet} className="space-y-0.5 p-3 text-sm">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="min-w-0 break-all font-mono text-xs">{w.wallet}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{date(w.lastAt)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t(KIND_KEY[w.kind] ?? "walletLogin.kind_tg")} · {t("walletLogin.row", { logins: w.logins, devices: w.devices, ips: w.ips })}
                      {w.matches > 0 && <span className="ml-1 font-semibold text-destructive">· {t("walletLogin.matches", { n: w.matches })}</span>}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </section>
  );
}
