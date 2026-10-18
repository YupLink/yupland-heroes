import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  cancelRedemption,
  exportRedemptionsCsv,
  listRedemptions,
  markRedemptionsPaid,
  unstickProcessingRedemption,
} from "@/server/api/admin-redemptions";
import { getSession } from "@/server/api/user-auth";
import {
  Download,
  Filter,
  Check,
  RotateCcw,
  X,
  ScrollText,
  Image as ImageIcon,
  Wallet,
  Megaphone,
  Coins,
  Clock,
  Hash,
  Copy,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { humanError } from "@/lib/humanError";

export const Route = createFileRoute("/admin/redemptions")({
  component: AdminRedemptions,
});

type FilterKey = "all" | "paid" | "pending" | "processing" | "cancelled";

function AdminRedemptions() {
  // Вторая ступень доступа: журнал выплат — только владельцу. Серверно
  // подкреплено requirePayoutsAdmin в admin.ts; роут закрываем и на клиенте.
  const { data: session, isLoading: sessionLoading } = useQuery({
    queryKey: ["session"],
    queryFn: () => getSession(),
  });
  const [filter, setFilter] = useState<FilterKey>("all");
  const [selected, setSelected] = useState<string[]>([]);
  const qc = useQueryClient();

  const { data: list = [], isLoading } = useQuery({
    queryKey: ["admin", "redemptions", filter],
    queryFn: () => listRedemptions({ data: { status: filter } }),
  });

  const refresh = () => {
    setSelected([]);
    qc.invalidateQueries({ queryKey: ["admin", "redemptions"] });
    qc.invalidateQueries({ queryKey: ["admin", "dashboard"] });
  };

  const markPaid = useMutation({
    mutationFn: (ids: string[]) => {
      const txHash =
        ids.length === 1
          ? prompt(
              "tx_hash on-chain транзакции (опционально, оставь пустым если не знаешь):"
            )?.trim() || undefined
          : undefined;
      return markRedemptionsPaid({ data: { ids, txHash } });
    },
    onSuccess: () => {
      toast.success("Отмечено как выплачено");
      refresh();
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  const unstick = useMutation({
    mutationFn: (ids: string[]) =>
      unstickProcessingRedemption({ data: { ids } }),
    onSuccess: () => {
      toast.success("Возвращено в pending");
      refresh();
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  const cancel = useMutation({
    mutationFn: (ids: string[]) => cancelRedemption({ data: { ids } }),
    onSuccess: () => {
      toast.success("Отменено");
      refresh();
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  const toggle = (id: string) =>
    setSelected((s) =>
      s.includes(id) ? s.filter((x) => x !== id) : [...s, id]
    );

  const doExport = async () => {
    try {
      const res = await exportRedemptionsCsv();
      const blob = new Blob([res.csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(humanError(e));
    }
  };

  // Сессия загружена и кошелёк не payouts-admin → на дашборд.
  if (!sessionLoading && session && !session.isPayoutsAdmin) {
    return <Navigate to="/admin" replace />;
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gold/10 text-gold ring-1 ring-gold/20">
            <ScrollText className="h-5 w-5" />
          </span>
          <div>
            <h1 className="font-display text-3xl font-bold">Журнал выплат NFT</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Последние 500 записей
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {selected.length > 0 && (
            <div className="flex items-center gap-2 rounded-full border border-gold/30 bg-gold/5 py-1 pl-3 pr-1.5">
              <span className="text-xs font-semibold text-gold">
                Выбрано {selected.length}
              </span>
              <button
                disabled={markPaid.isPending}
                onClick={() => markPaid.mutate(selected)}
                title="Отметить выплаченными"
                aria-label="Отметить выплаченными"
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-gold/40 bg-gold/10 text-gold transition hover:bg-gold/20 disabled:opacity-50"
              >
                <Check className="h-4 w-4" />
              </button>
              <button
                disabled={unstick.isPending}
                onClick={() => {
                  if (
                    confirm(
                      `Вернуть ${selected.length} в очередь? Опасно если on-chain прошло — юзер выведёт повторно.`
                    )
                  )
                    unstick.mutate(selected);
                }}
                title="Вернуть в очередь (processing → pending)"
                aria-label="Вернуть в очередь"
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-blue-500/40 bg-blue-500/10 text-blue-300 transition hover:bg-blue-500/20 disabled:opacity-50"
              >
                <RotateCcw className="h-4 w-4" />
              </button>
              <button
                disabled={cancel.isPending}
                onClick={() => {
                  if (
                    confirm(
                      `Отменить ${selected.length}? Сумма обнулится, статус → отменено.`
                    )
                  )
                    cancel.mutate(selected);
                }}
                title="Отменить выбранные"
                aria-label="Отменить выбранные"
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-rose-500/40 bg-rose-500/10 text-rose-400 transition hover:bg-rose-500/20 disabled:opacity-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
          <button
            onClick={doExport}
            title="Экспортировать в CSV"
            aria-label="Экспортировать в CSV"
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border/50 bg-secondary/40 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
          >
            <Download className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Filter className="h-3.5 w-3.5 text-muted-foreground" />
        {(
          [
            ["all", "Все"],
            ["paid", "Выплачено"],
            ["pending", "Ожидают"],
            ["processing", "Зависшие"],
            ["cancelled", "Отменённые"],
          ] as const
        ).map(([f, label]) => (
          <button
            key={f}
            onClick={() => setFilter(f as FilterKey)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition",
              filter === f
                ? "border-gold/50 bg-gold/10 text-gold"
                : "border-border/50 bg-secondary/40 text-muted-foreground hover:bg-secondary hover:text-foreground"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border border-border/50 bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border/60 bg-secondary/40 text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="w-10 p-4"></th>
                <th className="p-4 text-left font-medium">
                  <span className="inline-flex items-center gap-1.5">
                    <ImageIcon className="h-3.5 w-3.5" />
                    NFT
                  </span>
                </th>
                <th className="p-4 text-left font-medium">
                  <span className="inline-flex items-center gap-1.5">
                    <Wallet className="h-3.5 w-3.5" />
                    Кошелёк
                  </span>
                </th>
                <th className="p-4 text-left font-medium">
                  <span className="inline-flex items-center gap-1.5">
                    <Megaphone className="h-3.5 w-3.5" />
                    Кампания
                  </span>
                </th>
                <th className="p-4 text-right font-medium">
                  <span className="inline-flex items-center gap-1.5">
                    <Coins className="h-3.5 w-3.5" />
                    Награда
                  </span>
                </th>
                <th className="p-4 text-left font-medium">
                  <span className="inline-flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" />
                    Время
                  </span>
                </th>
                <th className="p-4 text-left font-medium">
                  <span className="inline-flex items-center gap-1.5">
                    <Hash className="h-3.5 w-3.5" />
                    Tx
                  </span>
                </th>
                <th className="p-4 text-left font-medium">Статус</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {isLoading && (
                <tr>
                  <td colSpan={8} className="p-6 text-center text-muted-foreground">
                    Загрузка...
                  </td>
                </tr>
              )}
              {!isLoading && list.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-6 text-center text-muted-foreground">
                    Записей нет.
                  </td>
                </tr>
              )}
              {list.map((r) => (
                <tr
                  key={r.id}
                  className={cn(
                    "transition hover:bg-secondary/40",
                    selected.includes(r.id) && "bg-gold/[0.04]"
                  )}
                >
                  <td className="p-4">
                    <input
                      type="checkbox"
                      checked={selected.includes(r.id)}
                      onChange={() => toggle(r.id)}
                      aria-label="Выбрать запись"
                      className="h-4 w-4 cursor-pointer rounded accent-[oklch(0.83_0.16_88)]"
                    />
                  </td>
                  <td className="p-4 font-medium">{r.nftId}</td>
                  <td className="p-4 font-mono text-xs">{r.wallet}</td>
                  <td className="p-4 text-xs text-muted-foreground">
                    {r.campaign}
                  </td>
                  <td className="p-4 text-right font-display font-bold text-gold">
                    +{r.amount} {r.token}
                  </td>
                  <td className="p-4 font-mono text-[11px] text-muted-foreground">
                    {r.timestamp}
                  </td>
                  <td className="p-4 font-mono text-xs">
                    {r.txHash !== "—" ? (
                      <button
                        type="button"
                        title={`Скопировать ${r.txHash}`}
                        aria-label="Скопировать хэш транзакции"
                        className="group inline-flex items-center gap-1.5 text-neon transition hover:text-neon/80"
                        onClick={() => {
                          navigator.clipboard
                            ?.writeText(r.txHash)
                            .then(() => toast.success("Хэш скопирован"))
                            .catch(() => {});
                        }}
                      >
                        <span className="group-hover:underline">{r.txHash}</span>
                        <Copy className="h-3 w-3 shrink-0 opacity-50 transition group-hover:opacity-100" />
                      </button>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="p-4">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
                        r.status === "paid"
                          ? "bg-success/10 text-success"
                          : r.status === "processing"
                            ? "bg-blue-500/10 text-blue-300"
                            : r.status === "cancelled"
                              ? "bg-rose-500/10 text-rose-400"
                              : "bg-amber-500/10 text-amber-400"
                      )}
                    >
                      {r.status === "paid" ? (
                        <>
                          <Check className="h-3 w-3" />
                          выплачено
                        </>
                      ) : r.status === "processing" ? (
                        <>
                          <RotateCcw className="h-3 w-3" />
                          зависло
                        </>
                      ) : r.status === "cancelled" ? (
                        <>
                          <X className="h-3 w-3" />
                          отменено
                        </>
                      ) : (
                        <>
                          <Clock className="h-3 w-3" />
                          ожидает
                        </>
                      )}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
