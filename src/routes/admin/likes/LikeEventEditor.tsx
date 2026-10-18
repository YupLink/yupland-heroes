import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, Heart, Users, X, ThumbsUp, ChevronDown } from "lucide-react";
import { createLikeEvent, deleteLikeEvent, getLikeEventClaimers, listLikeEvents } from "@/server/api/admin-like-events";
import { TitleMultiSelect, type MultiTitle } from "@/components/TitleMultiSelect";
import { cn } from "@/lib/utils";
import { humanError } from "@/lib/humanError";

const LIKE_COOLDOWN_HOURS = 24;

type LikeStakingReq = {
  title: string;
  image: string | null;
  totalNfts: number;
  count: string;
};

export function LikeEventEditor() {
  const qc = useQueryClient();
  const [reqs, setReqs] = useState<LikeStakingReq[]>([]);
  const [reward, setReward] = useState("1");

  const multiValue: MultiTitle[] = reqs.map((r) => ({ title: r.title, image: r.image, count: r.totalNfts }));
  const onMultiChange = (next: MultiTitle[]) => {
    setReqs((prev) => {
      const prevByTitle = new Map(prev.map((p) => [p.title, p]));
      return next.map((n) => prevByTitle.get(n.title) ?? { title: n.title, image: n.image, totalNfts: n.count, count: "1" });
    });
  };

  const list = useQuery({ queryKey: ["admin", "like-events"], queryFn: () => listLikeEvents() });
  const create = useMutation({
    mutationFn: createLikeEvent,
    onSuccess: () => { toast.success("Лайк-событие создано"); setReqs([]); setReward("1"); qc.invalidateQueries({ queryKey: ["admin", "like-events"] }); },
    onError: (e: Error) => toast.error(humanError(e)),
  });
  const del = useMutation({
    mutationFn: (id: string) => deleteLikeEvent({ data: { id } }),
    onSuccess: () => { toast.success("Отключено"); qc.invalidateQueries({ queryKey: ["admin", "like-events"] }); },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  const rewardNum = Number(reward.replace(",", "."));
  const validReqs = reqs.filter((r) => Number(r.count) > 0);
  const canSubmit = validReqs.length > 0 && Number.isFinite(rewardNum) && rewardNum > 0 && !create.isPending;

  const onSubmit = () => {
    if (validReqs.length === 0) { toast.error("Добавь хотя бы одно требование с NFT"); return; }
    if (!Number.isFinite(rewardNum) || rewardNum <= 0) { toast.error("Награда должна быть положительным числом"); return; }
    create.mutate({ data: { requirements: validReqs.map((r) => ({ title: r.title, count: Math.max(1, Math.floor(Number(r.count))) })), rewardLikes: rewardNum, holdDurationSec: LIKE_COOLDOWN_HOURS * 3600 } });
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2.5 pt-1">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-400/10 text-rose-300"><Heart className="h-4 w-4" /></div>
        <div className="min-w-0">
          <div className="font-display text-sm font-bold leading-tight">Новое событие</div>
          <div className="text-[11px] text-muted-foreground">Создать лайк-событие за удержание NFT</div>
        </div>
      </div>

      <div className="space-y-4 rounded-2xl border border-border/50 bg-card p-4">
        <div>
          <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-muted-foreground">Требования (NFT — можно много)</label>
          <TitleMultiSelect value={multiValue} onChange={onMultiChange} />
          {reqs.length > 0 && (
            <div className="mt-3 space-y-2">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Сколько каждого нужно держать:</div>
              {reqs.map((r) => (
                <div key={r.title} className="flex items-center gap-3 rounded-xl border border-border/50 bg-secondary/20 px-3 py-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{r.title}</span>
                  <input type="number" min={1} step={1} value={r.count} onChange={(e) => setReqs((cur) => cur.map((x) => x.title === r.title ? { ...x, count: e.target.value } : x))} className="w-20 rounded-lg border border-border bg-background px-2 py-1.5 text-center text-sm outline-none focus:border-rose-400/50" />
                  <button type="button" onClick={() => setReqs((cur) => cur.filter((x) => x.title !== r.title))} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-border/50 bg-secondary/40 text-muted-foreground transition hover:border-rose-500/40 hover:text-rose-400" title="Убрать требование" aria-label="Убрать требование"><X className="h-4 w-4" /></button>
                </div>
              ))}
            </div>
          )}
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground">Награда (лайков за цикл)</label>
          <input value={reward} onChange={(e) => setReward(e.target.value)} placeholder="1" inputMode="decimal" className="w-full rounded-xl border border-border bg-secondary/40 px-3 py-2.5 text-sm outline-none focus:border-rose-400/50" />
          <div className="mt-1 text-[11px] text-muted-foreground">Можно дробное. Cooldown {LIKE_COOLDOWN_HOURS}ч.</div>
        </div>
        <button onClick={onSubmit} disabled={!canSubmit} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-rose-500 px-5 py-3 text-sm font-bold text-white shadow-card transition hover:bg-rose-400 disabled:opacity-50">
          {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Создать
        </button>
      </div>

      <div>
        <div className="mb-2 flex items-center gap-2 text-sm font-medium"><Heart className="h-4 w-4 text-rose-400" /> Активные события</div>
        {list.isLoading ? (
          <div className="rounded-2xl border border-border/50 bg-card p-6 text-center text-sm text-muted-foreground"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Загрузка…</div>
        ) : (list.data ?? []).length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border/60 bg-card/50 p-8 text-center text-sm text-muted-foreground">Пока ничего.</div>
        ) : (
          <div className="space-y-2">
            {(list.data ?? []).map((e) => (
              <LikeEventCard key={e.id} e={e} onDelete={() => { if (confirm("Отключить это событие?")) del.mutate(e.id); }} deleting={del.isPending} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

type LikeEventRow = Awaited<ReturnType<typeof listLikeEvents>>[number];

function LikeEventCard({ e, onDelete, deleting }: { e: LikeEventRow; onDelete: () => void; deleting: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const claimers = useQuery({
    queryKey: ["admin", "like-event-claimers", e.id],
    queryFn: () => getLikeEventClaimers({ data: { eventId: e.id } }),
    enabled: expanded,
  });
  return (
    <div className="rounded-2xl border border-border/50 bg-card p-4 transition hover:border-border/80">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="inline-flex items-center gap-1 rounded-full border border-rose-400/30 bg-rose-400/5 px-2 py-0.5 text-xs font-medium text-rose-300"><Heart className="h-3 w-3" /> +{e.rewardLikes}</span>
            <span className="text-xs text-muted-foreground">{e.claimsCount} клеймов · выдано {e.likesTotalAwarded.toFixed(4)}</span>
            {e.tokensInCooldown > 0 && <span className="inline-flex items-center gap-1 rounded-full border border-neon/30 bg-neon/10 px-2 py-0.5 text-[10px] font-medium text-neon">{e.tokensInCooldown} в cooldown</span>}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {e.requirements.map((r, i) => (
              <span key={`${r.title}-${i}`} className="inline-flex items-center gap-1 rounded-full border border-border/50 bg-secondary/30 px-2 py-0.5 text-[11px]"><span className="text-foreground">{r.title}</span> <span className="text-muted-foreground">× {r.count}</span></span>
            ))}
          </div>
        </div>
        <button onClick={onDelete} disabled={deleting} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border/50 bg-secondary/40 text-muted-foreground transition hover:border-rose-500/40 hover:text-rose-400 disabled:opacity-50" title="Отключить событие" aria-label="Отключить событие"><Trash2 className="h-4 w-4" /></button>
      </div>
      {e.claimsCount > 0 && (
        <div className="mt-3 border-t border-border/50 pt-2">
          <button type="button" onClick={() => setExpanded((v) => !v)} className="flex w-full items-center gap-2 rounded-md px-1 py-1.5 text-[11px] text-muted-foreground transition hover:bg-secondary/30 hover:text-foreground">
            <Users className="h-3.5 w-3.5" /> <span>Клеймеры</span>
            <ChevronDown className={cn("ml-auto h-4 w-4 transition", expanded && "rotate-180 text-rose-300")} />
          </button>
          {expanded && (
            <div className="mt-2">
              {claimers.isLoading ? (
                <div className="flex items-center gap-2 px-2 py-2 text-[11px] text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Загружаю…</div>
              ) : (claimers.data ?? []).length === 0 ? (
                <div className="px-2 py-2 text-[11px] text-muted-foreground">Пока никто не клеймил.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-[11px]">
                    <thead className="text-muted-foreground">
                      <tr className="border-b border-border/40 text-left"><th className="py-1.5 pr-2 font-normal">Кошелёк</th><th className="py-1.5 px-2 text-right font-normal">Клеймов</th><th className="py-1.5 pl-2 text-right font-normal">Выдано</th></tr>
                    </thead>
                    <tbody>
                      {(claimers.data ?? []).map((c) => (
                        <tr key={c.wallet} className="border-b border-border/30 last:border-b-0">
                          <td className="py-1.5 pr-2 font-mono text-foreground">{c.wallet}</td>
                          <td className="py-1.5 px-2 text-right font-mono">×{c.claimsCount}</td>
                          <td className="py-1.5 pl-2 text-right font-mono text-rose-300">{c.likesTotal.toFixed(4)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
