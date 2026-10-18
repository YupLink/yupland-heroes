// Быстрая диагностика по одному кошельку: заявки на вывод + баланс счёта.
// Нужна, когда игрок пишет «GD не пришли» — админу нужно за секунду увидеть
// статус заявок, tx_hash, сколько зависло. Одна страница, одна форма, никаких
// хитрых фильтров.
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { inspectWalletRedemptions } from "@/server/api/admin-wallet-inspect";
import { adminForceLostPaymentsSweep } from "@/server/api/admin-force-sweep";
import { toast } from "sonner";
import { humanError } from "@/lib/humanError";

export const Route = createFileRoute("/admin/wallet-inspect")({
  component: WalletInspectPage,
});

type Result = Awaited<ReturnType<typeof inspectWalletRedemptions>>;

function WalletInspectPage() {
  const [wallet, setWallet] = useState("");
  const query = useMutation({
    mutationFn: (w: string) => inspectWalletRedemptions({ data: { wallet: w } }),
  });
  const sweep = useMutation({
    mutationFn: () => adminForceLostPaymentsSweep(),
    onSuccess: (r) =>
      toast.success(`Веретеница отработала за ${Math.round((r.durationMs ?? 0) / 100) / 10} с`),
    onError: (e: Error) => toast.error(humanError(e)),
  });
  const data = query.data as Result | undefined;

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold">Диагностика кошелька</h1>
        <button
          type="button"
          onClick={() => sweep.mutate()}
          disabled={sweep.isPending}
          className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-bold text-amber-300 disabled:opacity-50"
          title="Резолвер + догон + топ-ап + sweep — всё, что делает крон lost-payments"
        >
          {sweep.isPending ? "крутится…" : "Запустить веретеницу"}
        </button>
      </div>
      {sweep.data && (
        <pre className="max-h-64 overflow-auto rounded-lg border border-border bg-card p-2 text-[10px]">
          {JSON.stringify(sweep.data.stages, null, 2)}
        </pre>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (wallet.trim().length >= 3) query.mutate(wallet.trim());
        }}
        className="flex gap-2"
      >
        <input
          value={wallet}
          onChange={(e) => setWallet(e.target.value)}
          placeholder="alice.tg или player08.tg"
          className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={query.isPending || wallet.trim().length < 3}
          className="rounded-lg gradient-gold px-4 py-2 text-sm font-bold text-gold-foreground disabled:opacity-50"
        >
          {query.isPending ? "…" : "Проверить"}
        </button>
      </form>

      {query.isError && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {humanError(query.error as Error)}
        </div>
      )}

      {data && (
        <>
          <section className="rounded-lg border border-border bg-card p-3 text-sm">
            <div className="grid grid-cols-5 gap-2 text-center">
              {(
                [
                  ["total", "всего"],
                  ["pending", "pending"],
                  ["processing", "processing"],
                  ["paid", "paid"],
                  ["stuckProcessingOverHour", "висит >1ч"],
                ] as const
              ).map(([k, label]) => (
                <div key={k}>
                  <div className="text-xl font-bold tabular-nums">{data.summary[k]}</div>
                  <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
                </div>
              ))}
            </div>
            <div className="mt-3 text-xs text-muted-foreground">
              account_id: <b>{data.accountId ?? "—"}</b>
            </div>
          </section>

          {data.balances.length > 0 && (
            <section>
              <h2 className="mb-1 text-sm font-semibold">Балансы на счёте</h2>
              <table className="w-full border-collapse text-xs">
                <thead className="bg-secondary/50 text-left">
                  <tr>
                    <th className="p-1.5">Токен</th>
                    <th className="p-1.5 text-right">Баланс</th>
                  </tr>
                </thead>
                <tbody>
                  {data.balances.map((b) => (
                    <tr key={b.token} className="border-t border-border">
                      <td className="p-1.5 font-mono">{b.token}</td>
                      <td className="p-1.5 text-right tabular-nums">
                        {b.balance.toLocaleString("ru-RU")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          <section>
            <h2 className="mb-1 text-sm font-semibold">
              Заявки (последние 30)
            </h2>
            {data.redemptions.length === 0 ? (
              <div className="rounded-lg border border-border bg-card p-3 text-xs text-muted-foreground">
                записей нет
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-[11px]">
                  <thead className="bg-secondary/50 text-left">
                    <tr>
                      <th className="p-1">id</th>
                      <th className="p-1">contract</th>
                      <th className="p-1">status</th>
                      <th className="p-1 text-right">amount</th>
                      <th className="p-1">token</th>
                      <th className="p-1">redeemed_at</th>
                      <th className="p-1">proc-h</th>
                      <th className="p-1">proc_tx</th>
                      <th className="p-1">tx_hash</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.redemptions.map((r) => (
                      <tr
                        key={r.id}
                        className={`border-t border-border ${
                          r.status === "processing" && r.processingAgoH > 1
                            ? "bg-destructive/10"
                            : r.status === "pending"
                              ? "bg-amber-500/10"
                              : ""
                        }`}
                      >
                        <td className="p-1 font-mono">{r.id.slice(0, 10)}…</td>
                        <td className="p-1 font-mono">{r.contractId}</td>
                        <td className="p-1">{r.status}</td>
                        <td className="p-1 text-right tabular-nums">
                          {r.amount.toLocaleString("ru-RU")}
                        </td>
                        <td className="p-1">{r.token ?? "—"}</td>
                        <td className="p-1">{r.redeemedAt ?? "—"}</td>
                        <td className="p-1 tabular-nums">
                          {r.processingStartedAt ? `${r.processingAgoH}ч` : "—"}
                        </td>
                        <td className="p-1 font-mono">
                          {r.processingTxHash?.slice(0, 8) ?? "—"}
                        </td>
                        <td className="p-1 font-mono">{r.txHash?.slice(0, 8) ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
