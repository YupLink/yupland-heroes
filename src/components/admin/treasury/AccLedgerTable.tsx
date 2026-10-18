// Журнал движений ресурсного счёта: кто, когда, сколько и по какому ключу.
//
// Ключ операции (ref) показываем целиком — именно по нему разбираются жалобы
// «списалось дважды» и «пополнил, а не пришло».
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Search } from "lucide-react";
import { adminAccLedger } from "@/server/api/currency/admin-treasury";

type Row = {
  id: string;
  account_id: string;
  wallet: string | null;
  owner_wallet: string | null;
  token: string;
  delta: string;
  kind: string;
  ref: string;
  balance_after: string;
  created_at: string;
};

const KIND_LABEL: Record<string, string> = {
  acc_deposit: "пополнение",
  acc_spend: "трата",
  acc_refund: "возврат",
  acc_withdraw: "вывод",
  acc_adjust: "правка",
};

export function AccLedgerTable({ tokens }: { tokens: string[] }) {
  const [token, setToken] = useState("");
  const [wallet, setWallet] = useState("");
  const [applied, setApplied] = useState<{ token?: string; wallet?: string }>({});

  const q = useQuery({
    queryKey: ["admin-acc-ledger", applied.token ?? "", applied.wallet ?? ""],
    queryFn: () => adminAccLedger({ data: { ...applied, limit: 100 } }),
  });

  const rows = (q.data?.rows ?? []) as unknown as Row[];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={token}
          onChange={(e) => setToken(e.target.value)}
          className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs outline-none focus:border-gold/60"
        >
          <option value="">все токены</option>
          {tokens.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <input
          value={wallet}
          onChange={(e) => setWallet(e.target.value)}
          placeholder="кошелёк игрока"
          spellCheck={false}
          autoCapitalize="off"
          className="min-w-[180px] flex-1 rounded-lg border border-border bg-background px-2 py-1.5 font-mono text-xs outline-none focus:border-gold/60"
        />
        <button
          type="button"
          onClick={() =>
            setApplied({ token: token || undefined, wallet: wallet.trim() || undefined })
          }
          className="inline-flex items-center gap-1.5 rounded-lg border border-gold/40 bg-gold/5 px-3 py-1.5 text-xs font-medium text-gold transition hover:bg-gold/10"
        >
          <Search className="h-3.5 w-3.5" />
          Показать
        </button>
      </div>

      {q.isLoading && (
        <div className="flex justify-center py-6">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      )}

      {!q.isLoading && rows.length === 0 && (
        <p className="rounded-xl border border-dashed border-border/60 bg-secondary/10 px-4 py-6 text-center text-xs text-muted-foreground">
          Движений нет. Счёт стартовал пустым — это нормально до первого пополнения.
        </p>
      )}

      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-border/60 bg-card/40">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border/60 text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-2 text-left font-semibold">Когда</th>
                <th className="px-3 py-2 text-left font-semibold">Игрок</th>
                <th className="px-3 py-2 text-left font-semibold">Токен</th>
                <th className="px-3 py-2 text-left font-semibold">Что</th>
                <th className="px-3 py-2 text-right font-semibold">Движение</th>
                <th className="px-3 py-2 text-right font-semibold">Стало</th>
                <th className="px-3 py-2 text-left font-semibold">Ключ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const delta = Number(r.delta);
                return (
                  <tr key={r.id} className="border-b border-border/30 last:border-0">
                    <td className="whitespace-nowrap px-3 py-2 text-[11px] text-muted-foreground">
                      {new Date(r.created_at).toLocaleString("ru-RU")}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-[11px]">
                      {r.wallet ?? r.owner_wallet ?? r.account_id}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-[12px]">{r.token}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-[11px] text-muted-foreground">
                      {KIND_LABEL[r.kind] ?? r.kind}
                    </td>
                    <td
                      className={`whitespace-nowrap px-3 py-2 text-right font-mono text-[12px] tabular-nums ${
                        delta < 0 ? "text-red-400" : "text-emerald-400"
                      }`}
                    >
                      {delta > 0 ? "+" : ""}
                      {delta.toLocaleString("ru-RU", { maximumFractionDigits: 8 })}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right font-mono text-[12px] tabular-nums text-muted-foreground">
                      {Number(r.balance_after).toLocaleString("ru-RU", {
                        maximumFractionDigits: 8,
                      })}
                    </td>
                    <td className="max-w-[260px] truncate px-3 py-2 font-mono text-[10px] text-muted-foreground">
                      {r.ref}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
