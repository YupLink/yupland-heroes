// YUPLINK · Список держателей legendary-NFT и их доли. Вынесено из панели
// раздачи — это самостоятельная простыня, а панель должна оставаться про
// «сколько и откуда делим».

import { Users } from "lucide-react";
import { fmt, CopyChip, type DaraiPreview } from "./daraiPayoutShared";

export function DaraiLegendaryHolders({ d }: { d: DaraiPreview }) {
  const l = d.legendary;
  return (
    <div className="rounded-2xl border border-border/50 bg-card p-4 transition hover:border-border/80">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5 text-[11px] uppercase tracking-widest text-muted-foreground">
          <Users className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">Держатели NFT «{l.nftName}»</span>
        </div>
        <div className="text-[10px] text-muted-foreground">
          всего NFT: <span className="font-mono">{l.totalNfts}</span>
          {l.systemHeldNfts > 0 && (
            <span>
              {" "}
              · из них на складе:{" "}
              <span className="font-mono">{l.systemHeldNfts}</span>
            </span>
          )}
          <span className="ml-2" title="Откуда взят список держателей">
            · источник:{" "}
            <span
              className={
                l.holdersSource === "sendler"
                  ? "text-emerald-400"
                  : "text-amber-400"
              }
            >
              {l.holdersSource === "sendler" ? "чейн" : "база (резерв)"}
            </span>
          </span>
        </div>
      </div>

      {l.holders.length === 0 ? (
        <div className="rounded-xl border border-border bg-secondary/30 p-4 text-center text-xs text-muted-foreground">
          Активных держателей пока нет.
          {l.systemHeldNfts > 0 && (
            <div className="mt-1 text-[10px]">
              {l.systemHeldNfts} NFT лежит на складе (
              {l.excludedSystemWallets.join(", ")}) — они не считаются.
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-1">
          {l.holders.map((h) => (
            <div
              key={h.wallet}
              className="flex items-center gap-2 rounded-lg border border-border/50 bg-secondary/20 px-3 py-1.5"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate font-mono text-xs">{h.wallet}</div>
                <div className="text-[10px] text-muted-foreground">
                  NFT: <span className="font-mono">{h.qty}</span> ×{" "}
                  {fmt(l.perNftHuman)}
                </div>
              </div>
              <CopyChip value={h.wallet} label="кошелёк держателя" />
              <div className="shrink-0 text-right">
                <div className="font-mono text-sm font-bold text-amber-300">
                  {fmt(h.amountHuman)}
                </div>
                <div className="text-[9px] text-muted-foreground">DARAI</div>
              </div>
            </div>
          ))}
          {Number(l.remainderHuman) > 0.01 && (
            <div
              className="rounded-lg border border-dashed border-border bg-secondary/10 px-3 py-1.5 text-[10px] text-muted-foreground"
              title="Копейки от округления при делении на держателей"
            >
              Остаток от деления:{" "}
              <span className="font-mono">{fmt(l.remainderHuman)}</span> DARAI
            </div>
          )}
        </div>
      )}
    </div>
  );
}
