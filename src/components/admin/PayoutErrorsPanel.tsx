// YUPLINK · Админ · Просмотр ошибок NFT-выплат.
//
// Показывает последние 50 строк nft_redemptions с last_error и даёт
// кнопку «Снять флаг ошибки» — обнуляет last_error+failed_at когда
// админ разобрался руками. Саму запись не удаляет.

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Bell,
  Clock,
  Image as ImageIcon,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { humanError } from "@/lib/humanError";
import {
  adminGetPayoutErrors,
  adminClearPayoutErrorFn,
} from "@/server/api/payouts";

const KEY = ["admin-payout-errors"] as const;

export function PayoutErrorsPanel() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: KEY,
    queryFn: () => adminGetPayoutErrors(),
    refetchInterval: 60_000,
  });

  const clearError = useMutation({
    mutationFn: (rowId: string) =>
      adminClearPayoutErrorFn({ data: { rowId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  if (q.isLoading) {
    return (
      <div className="rounded-2xl border border-border/50 bg-card p-4 text-sm text-muted-foreground">
        Загружаю последние ошибки…
      </div>
    );
  }
  if (q.error || !q.data) {
    return (
      <div className="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-4 text-sm text-rose-300">
        Не удалось загрузить: {q.error instanceof Error ? q.error.message : "—"}
      </div>
    );
  }

  const { recentFailures } = q.data;

  return (
    <div className="overflow-hidden rounded-2xl border border-border/50 bg-card">
      <div className="border-b border-border/50 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-400">
            <AlertTriangle className="h-3.5 w-3.5" />
            Последние ошибки
          </span>
          <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            {recentFailures.length}
          </span>
        </div>
        <div
          className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground"
          title="При новых фейлах админам уходит TG-уведомление с NFT-титулами и кошельками. Кнопка «Снять флаг ошибки» обнуляет last_error и failed_at, запись не удаляется. Зависшие выводы крон сам откатывает в pending каждые 10 минут."
        >
          <Bell className="h-3 w-3 shrink-0" />
          <span className="min-w-0 truncate">
            Админам уходит TG-уведомление о новых фейлах
          </span>
        </div>
      </div>
      {recentFailures.length === 0 ? (
        <div className="flex items-center gap-2 p-4 text-sm text-emerald-300">
          <CheckCircle2 className="h-4 w-4" />
          Чисто. Ни одной ошибки.
        </div>
      ) : (
        <div className="divide-y divide-border/50">
          {recentFailures.map((r) => (
            <ErrorRow
              key={r.id}
              r={r}
              onClear={() => clearError.mutate(r.id)}
              clearing={clearError.isPending}
            />
          ))}
        </div>
      )}
    </div>
  );
}

type FailureRow = Awaited<
  ReturnType<typeof adminGetPayoutErrors>
>["recentFailures"][number];

function ErrorRow({
  r,
  onClear,
  clearing,
}: {
  r: FailureRow;
  onClear: () => void;
  clearing: boolean;
}) {
  const [open, setOpen] = useState(false);
  const err = r.last_error ?? "—";
  const long = err.length > 110;
  return (
    <div className="p-3 text-xs">
      {/* Бейджи: NFT-title · кошелёк · статус */}
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        <span
          className="inline-flex min-w-0 max-w-full items-center gap-1 rounded-full border border-neon/30 bg-neon/5 px-2 py-0.5 text-neon"
          title={`${r.contract_id} #${r.token_id}`}
        >
          <ImageIcon className="h-3 w-3 shrink-0" />
          <span className="truncate font-medium">{r.nft_title ?? "—"}</span>
        </span>
        <span
          className="inline-flex min-w-0 max-w-[55%] items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-muted-foreground"
          title={`Кошелёк получателя · id ${r.id}`}
        >
          <Wallet className="h-3 w-3 shrink-0" />
          <span className="truncate font-mono">{r.user_wallet}</span>
        </span>
        <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-rose-500/10 px-2 py-0.5 font-medium text-rose-300">
          <AlertTriangle className="h-3 w-3" />
          {r.status}
        </span>
      </div>

      {/* Текст ошибки — truncate + раскрытие для длинных */}
      <div
        className={cn(
          "mt-1.5 whitespace-pre-wrap break-words text-rose-300/90",
          long && !open && "line-clamp-2"
        )}
        title={long ? err : undefined}
      >
        {err}
      </div>
      {long && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground transition hover:text-foreground"
        >
          {open ? "свернуть" : "развернуть"}
        </button>
      )}

      {/* Низ: время + tx · кнопка «Снять флаг ошибки» */}
      <div className="mt-2 flex items-end justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-muted-foreground">
          {r.failed_at && (
            <span
              className="inline-flex items-center gap-1"
              title="Когда зафиксирована ошибка"
            >
              <Clock className="h-3 w-3" />
              {new Date(r.failed_at).toLocaleString("ru-RU")}
            </span>
          )}
          {r.tx_hash && (
            <a
              href={`https://nearblocks.io/txns/${r.tx_hash}`}
              target="_blank"
              rel="noreferrer"
              title={`Транзакция ${r.tx_hash} на nearblocks.io`}
              aria-label="Открыть транзакцию на nearblocks.io"
              className="inline-flex items-center gap-0.5 font-mono underline transition hover:text-foreground"
            >
              {r.tx_hash.slice(0, 8)}…
              <ExternalLink className="h-2.5 w-2.5" />
            </a>
          )}
        </div>
        <button
          type="button"
          onClick={onClear}
          disabled={clearing}
          title="Сбросить last_error и failed_at. Запись не удаляется."
          className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border/50 bg-secondary/40 px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition hover:bg-secondary hover:text-foreground disabled:opacity-50"
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
          Снять флаг ошибки
        </button>
      </div>
    </div>
  );
}
