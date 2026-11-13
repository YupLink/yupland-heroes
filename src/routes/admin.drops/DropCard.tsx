import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Users, Coins, Layers, Gift, Copy, Pencil, Pause, Play,
  Repeat, Trash2, AlertTriangle, ChevronDown, Loader2,
} from "lucide-react";
import { getDropClaimers } from "@/server/api/admin-stats";
import { cn } from "@/lib/utils";
import { RewardBadge } from "./RewardBadge";
import { DropEditForm } from "./DropEditForm";
import type { DropEvent } from "./types";
import { goldFromTicketCost } from "./goldCost";

export function DropCard({
  drop,
  editing,
  onEdit,
  onCancelEdit,
  onCopy,
  onDelete,
  deleting,
  tokens,
  serviceBalance,
  onTogglePause,
  togglingPause,
  onToggleRecurring,
  togglingRecurring,
}: {
  drop: DropEvent;
  editing: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onCopy: () => void;
  onDelete: () => void;
  deleting: boolean;
  tokens: Array<{ symbol: string; ftContract: string; decimals: number }>;
  serviceBalance: { symbol: string; raw: string; human: string; decimals: number } | null;
  onTogglePause: () => void;
  togglingPause: boolean;
  onToggleRecurring: () => void;
  togglingRecurring: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [titleExpanded, setTitleExpanded] = useState(false);
  const claimers = useQuery({
    queryKey: ["admin", "drop-claimers", drop.id],
    queryFn: () => getDropClaimers({ data: { dropId: drop.id } }),
    enabled: expanded,
  });
  const remaining = drop.maxRemaining;
  let warn: string | null = null;
  if (remaining != null && serviceBalance) {
    const need = BigInt(remaining) * 10n ** BigInt(serviceBalance.decimals);
    if (BigInt(serviceBalance.raw) < need) {
      warn = `На сервисном кошельке ${serviceBalance.human} ${drop.rewardToken} — нужно ещё ${remaining}${drop.rewardKindIsRange ? " (макс)" : ""}`;
    }
  } else if (remaining == null && drop.totalNfts > 0 && serviceBalance) {
    const worst = Math.max(0, drop.totalNfts * drop.rewardMax - drop.totalPaidOut);
    if (worst > 0) {
      const need = BigInt(worst) * 10n ** BigInt(serviceBalance.decimals);
      if (BigInt(serviceBalance.raw) < need) {
        warn = `Без лимитов: в худшем случае нужно ${worst}${drop.rewardKindIsRange ? " (макс)" : ""} ${drop.rewardToken}, есть ${serviceBalance.human}`;
      }
    }
  }

  return (
    <div className={cn("rounded-2xl border bg-card p-4 shadow-sm transition", warn ? "border-destructive/40" : "border-border/50 hover:border-border/80")}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <button type="button" onClick={() => setTitleExpanded((v) => !v)} title={drop.title} className={cn("block w-full min-w-0 text-left font-medium", titleExpanded ? "break-words" : "truncate")}>
            {drop.title}
          </button>
          {drop.mode !== "combo" && (
            <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{drop.totalNfts} NFT в коллекции · {drop.contractId}</div>
          )}
          {drop.mode === "combo" && drop.requirements && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {drop.requirements.map((r, i) => (
                <span key={`${r.title}-${i}`} className="inline-flex items-center gap-1 rounded-md border border-border bg-secondary/30 px-1.5 py-0.5 text-[11px]">
                  <span className="text-foreground">{r.title}</span>
                  <span className="text-muted-foreground">×{r.count}</span>
                </span>
              ))}
            </div>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            {drop.mode === "combo" && (
              <span className="inline-flex items-center gap-1 rounded-full border border-neon/40 bg-neon/10 px-2 py-0.5 text-[10px] font-medium text-neon">
                <Layers className="h-3 w-3" /> combo
              </span>
            )}
            <RewardBadge drop={drop} />
            {drop.mode === "combo" && <span className="text-[10px] text-muted-foreground">/комбо</span>}
            <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-secondary px-2 py-0.5 text-muted-foreground">
              <Users className="h-3 w-3" /> {drop.uniqueClaimers} клеймеров{drop.maxUsers ? ` / ${drop.maxUsers}` : ""}
            </span>
            {drop.maxTotalPool ? (
              <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-secondary px-2 py-0.5 text-muted-foreground">
                <Coins className="h-3 w-3" /> Фонд: {drop.totalPaidOut} / {drop.maxTotalPool} {drop.rewardToken}
              </span>
            ) : null}
            {drop.freeClaim ? (
              <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-success">
                <Gift className="h-3 w-3" /> free claim
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-gold/30 bg-gold/5 px-2 py-0.5 text-gold">
                <Coins className="h-3 w-3" /> {goldFromTicketCost(drop.ticketCost)} золота {drop.mode === "combo" ? "за комбо" : "за клейм"}
              </span>
            )}
          </div>
        </div>
        {!editing && (
          <div className="flex flex-wrap items-center gap-1.5 sm:flex-nowrap">
            <button onClick={onCopy} title="Копировать" aria-label="Копировать дроп" className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-gold/30 bg-gold/5 text-gold transition hover:bg-gold/10">
              <Copy className="h-4 w-4" />
            </button>
            <button onClick={onEdit} title="Редактировать" aria-label="Редактировать дроп" className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border/50 bg-secondary/40 text-muted-foreground transition hover:bg-secondary hover:text-foreground">
              <Pencil className="h-4 w-4" />
            </button>
            <button onClick={onTogglePause} disabled={togglingPause || drop.status === "ended"} title={drop.status === "paused" ? "Возобновить" : "На паузу"} aria-label={drop.status === "paused" ? "Возобновить дроп" : "Поставить на паузу"} className={cn("inline-flex h-9 w-9 items-center justify-center rounded-xl border transition disabled:opacity-50", drop.status === "paused" ? "border-success/40 bg-success/5 text-success hover:bg-success/10" : "border-amber-500/40 bg-amber-500/5 text-amber-400 hover:bg-amber-500/10")}>
              {drop.status === "paused" ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
            </button>
            <button onClick={onToggleRecurring} disabled={togglingRecurring || drop.status === "ended"} title={drop.recurring ? "Авто-перезапуск ВКЛ" : "Авто-перезапуск ВЫКЛ"} aria-label="Авто-перезапуск" className={cn("inline-flex h-9 w-9 items-center justify-center rounded-xl border transition disabled:opacity-50", drop.recurring ? "border-neon/50 bg-neon/10 text-neon shadow-[0_0_12px_-3px] shadow-neon" : "border-border/50 bg-secondary/40 text-muted-foreground hover:text-foreground")}>
              <Repeat className="h-4 w-4" />
            </button>
            <button onClick={onDelete} disabled={deleting} title="Удалить" aria-label="Удалить дроп" className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border/50 bg-secondary/40 text-muted-foreground transition hover:border-rose-500/40 hover:text-rose-400 disabled:opacity-50">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
      {warn && !editing && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-2.5 text-[11px] text-destructive">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{warn}</span>
        </div>
      )}
      {editing && <DropEditForm drop={drop} tokens={tokens} onClose={onCancelEdit} />}
      {!editing && drop.uniqueClaimers > 0 && (
        <div className="mt-3 border-t border-border/50 pt-2">
          <button type="button" onClick={() => setExpanded((v) => !v)} className="flex w-full items-center gap-2 rounded-md px-1 py-1.5 text-[11px] text-muted-foreground transition hover:bg-secondary/30 hover:text-foreground">
            <Users className="h-3.5 w-3.5" />
            <span>
              Клеймеры · {drop.uniqueClaimers}
              {(() => {
                const tiers = drop.rewardTiers ?? [];
                const allNonFt = tiers.length > 0 && tiers.every((t) => (t as { kind?: string }).kind === "nft" || (t as { kind?: string }).kind === "pack");
                if (allNonFt) return null;
                const byTok = drop.payoutByToken ?? [];
                return (
                  <>
                    {" · всего выплачено "}
                    <span className="text-foreground">
                      {byTok.length > 0 ? byTok.map((t) => `${t.amount} ${t.token}`).join(" · ") : `${drop.totalPaidOut} ${drop.rewardToken}`}
                    </span>
                  </>
                );
              })()}
            </span>
            <ChevronDown className={cn("ml-auto h-4 w-4 transition", expanded && "rotate-180 text-gold")} />
          </button>
          {expanded && (
            <div className="mt-2">
              {claimers.isLoading ? (
                <div className="flex items-center gap-2 px-2 py-2 text-[11px] text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" /> Загружаю…
                </div>
              ) : (claimers.data ?? []).length === 0 ? (
                <div className="px-2 py-2 text-[11px] text-muted-foreground">Пока никто не клеймил.</div>
              ) : (() => {
                const tiers = drop.rewardTiers ?? [];
                const allNonFt = tiers.length > 0 && tiers.every((t) => (t as { kind?: string }).kind === "nft" || (t as { kind?: string }).kind === "pack");
                return (
                  <div className="overflow-x-auto">
                    <table className="w-full text-[11px]">
                      <thead className="text-muted-foreground">
                        <tr className="border-b border-border/40 text-left">
                          <th className="py-1.5 pr-2 font-normal">Кошелёк</th>
                          <th className="py-1.5 px-2 text-right font-normal">Клеймов</th>
                          {!allNonFt && <th className="py-1.5 pl-2 text-right font-normal">Сумма</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {(claimers.data ?? []).map((c) => (
                          <tr key={c.wallet} className="border-b border-border/30 last:border-b-0">
                            <td className="py-1.5 pr-2 font-mono text-foreground">{c.wallet}</td>
                            <td className="py-1.5 px-2 text-right font-mono">×{c.claimsCount}</td>
                            {!allNonFt && (
                              <td className="py-1.5 pl-2 text-right font-mono text-gold">
                                {(c.byToken ?? []).length > 0 ? (c.byToken ?? []).map((t) => `${t.amount} ${t.token}`).join(" · ") : `${c.totalAmount} ${drop.rewardToken}`}
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
