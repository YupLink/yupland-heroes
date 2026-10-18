// Сироты прямо сейчас: сухой прогон общего скана склада (ничего не выдаёт).
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, ScanSearch, LifeBuoy } from "lucide-react";
import { adminNftInputOrphans, adminNftInputRecover } from "@/server/api/admin-nft-inputs";
import { humanError } from "@/lib/humanError";

export function NftInputOrphansPanel() {
  const scan = useMutation({
    mutationFn: () => adminNftInputOrphans({ data: {} }),
    onError: (e: Error) => toast.error(humanError(e)),
  });
  const recover = useMutation({
    mutationFn: (v: { contract: string; tokenId: string; txHash: string; wallet: string }) =>
      adminNftInputRecover({ data: v }),
    onSuccess: (r) => {
      const done = r.rows.find((x) => x.status === "granted");
      toast[done ? "success" : "message"](
        done ? `Выдано: ${done.detail} → ${done.wallet}` : (r.rows[0]?.detail ?? "Нечего догонять"),
      );
      scan.mutate();
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  const res = scan.data;
  const orphans = (res?.rows ?? []).filter((r) => r.status === "candidate");
  const unclear = (res?.rows ?? []).filter((r) => r.status === "skipped");

  return (
    <section className="rounded-2xl border border-border/60 bg-card/40 p-4">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <div className="text-[11px] font-semibold uppercase tracking-widest text-gold">
          Сироты за 30 дней
        </div>
        <button
          type="button"
          onClick={() => scan.mutate()}
          disabled={scan.isPending}
          className="inline-flex items-center gap-2 rounded-full border border-gold/40 px-3 py-1 text-xs font-semibold text-gold transition hover:bg-gold/10 disabled:opacity-50"
        >
          {scan.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <ScanSearch className="h-3.5 w-3.5" />
          )}
          Проверить
        </button>
      </div>
      <p className="mb-3 text-[11px] text-muted-foreground">
        Сухой прогон: смотрим входящие NFT на склад и вычитаем те, за которые выдача реально
        состоялась. Ничего не выдаётся, пока не нажмёшь «Догнать».
      </p>

      {res && (
        <div className="space-y-2">
          <div className="text-[11px] text-muted-foreground">
            Переводов просмотрено: {res.summary.scanned} · уже выдано: {res.summary.alreadyDelivered}{" "}
            · ждут выдачи: {orphans.length} · без связки: {unclear.length}
          </div>
          {orphans.length === 0 && unclear.length === 0 && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs text-emerald-300">
              Ни одной потерянной NFT: за всё, что пришло на склад, выдача есть.
            </div>
          )}
          {orphans.map((r) => (
            <div
              key={`${r.tokenId}|${r.txHash}`}
              className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3"
            >
              <span className="font-mono text-xs text-foreground">#{r.tokenId}</span>
              <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                {r.wallet} · {r.plan}
                {r.title ? ` · ${r.title}` : ""}
              </span>
              <button
                type="button"
                disabled={recover.isPending}
                onClick={() =>
                  recover.mutate({
                    contract: r.contract,
                    tokenId: r.tokenId,
                    txHash: r.txHash,
                    wallet: r.wallet,
                  })
                }
                className="inline-flex items-center gap-1.5 rounded-full bg-gold px-3 py-1 text-[11px] font-bold text-background transition hover:bg-gold/90 disabled:opacity-50"
              >
                <LifeBuoy className="h-3 w-3" />
                Догнать
              </button>
            </div>
          ))}
          {unclear.map((r) => (
            <div
              key={`skip-${r.tokenId}|${r.txHash}`}
              className="rounded-xl border border-border/60 bg-secondary/30 p-3 text-[11px] text-muted-foreground"
            >
              <span className="font-mono text-foreground">#{r.tokenId}</span> {r.wallet} —{" "}
              {r.detail}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
