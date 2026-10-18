// Одна операция ввода NFT: что отправили, что сервер успел, что выдано.
// Карточкой, а не строкой таблицы — экран открывают и с телефона.
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, AlertTriangle, Loader2, LifeBuoy, Clock } from "lucide-react";
import { adminNftInputRecover } from "@/server/api/admin-nft-inputs";
import { humanError } from "@/lib/humanError";
import type { NftInputView } from "@/server/api/nft-input-view";

type Props = { row: NftInputView; onRecovered: () => void };

function statusOf(r: NftInputView): { text: string; tone: "ok" | "warn" | "bad" | "mute" } {
  if (r.delivered) return { text: r.deliveredLabel, tone: "ok" };
  if (r.journalStatus === "failed") return { text: "сервер отказал", tone: "bad" };
  if (r.journalStatus === "started") return { text: "операция не довелась", tone: "bad" };
  if (r.receipt) return { text: "квитанция есть, выдачи нет", tone: "bad" };
  if (r.onChain) return { text: "перевод есть, выдачи нет", tone: "warn" };
  return { text: "следов не найдено", tone: "mute" };
}

const TONE: Record<string, string> = {
  ok: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  warn: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  bad: "border-rose-500/40 bg-rose-500/10 text-rose-300",
  mute: "border-border bg-secondary/40 text-muted-foreground",
};

export function NftInputCard({ row, onRecovered }: Props) {
  const st = statusOf(row);
  const recover = useMutation({
    mutationFn: () =>
      adminNftInputRecover({
        data: {
          contract: row.contract,
          tokenId: row.tokenId,
          txHash: row.txHash || undefined,
          wallet: row.wallet || undefined,
        },
      }),
    onSuccess: (r) => {
      const done = r.rows.find((x) => x.status === "granted");
      if (done) toast.success(`Выдано: ${done.detail} → ${done.wallet}`);
      else toast.message(r.rows[0]?.detail ?? "Нечего догонять");
      onRecovered();
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  return (
    <div className="rounded-xl border border-border/60 bg-card/60 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${TONE[st.tone]}`}>
          {st.tone === "ok" ? (
            <Check className="mr-1 inline h-3 w-3" />
          ) : st.tone === "mute" ? (
            <Clock className="mr-1 inline h-3 w-3" />
          ) : (
            <AlertTriangle className="mr-1 inline h-3 w-3" />
          )}
          {st.text}
        </span>
        <span className="font-mono text-xs text-foreground">#{row.tokenId}</span>
        {row.title && <span className="min-w-0 truncate text-xs text-muted-foreground">{row.title}</span>}
      </div>

      <div className="mt-2 grid gap-1 text-[11px] text-muted-foreground sm:grid-cols-2">
        <div className="min-w-0 truncate">
          Игрок: <span className="font-mono text-foreground">{row.wallet || "—"}</span>
        </div>
        <div className="min-w-0 truncate">
          Когда: {row.at ? new Date(row.at).toLocaleString("ru-RU") : "—"}
        </div>
        <div className="min-w-0 truncate">
          Перевод:{" "}
          {row.txHash ? (
            <a
              href={`https://nearblocks.io/txns/${row.txHash}`}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-gold underline-offset-2 hover:underline"
            >
              {row.txHash.slice(0, 10)}…
            </a>
          ) : (
            "—"
          )}
        </div>
        <div className="min-w-0 truncate">
          Журнал: {row.journalStatus ?? "нет записи"}
          {row.journalError ? ` — ${row.journalError}` : ""}
        </div>
      </div>

      {!row.delivered && (
        <button
          type="button"
          disabled={recover.isPending}
          onClick={() => recover.mutate()}
          className="mt-3 inline-flex items-center gap-2 rounded-full bg-gold px-4 py-1.5 text-xs font-bold text-background transition hover:bg-gold/90 disabled:opacity-50"
        >
          {recover.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <LifeBuoy className="h-3.5 w-3.5" />
          )}
          Догнать сейчас
        </button>
      )}
    </div>
  );
}
