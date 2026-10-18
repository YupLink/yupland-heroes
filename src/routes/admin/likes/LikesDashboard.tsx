import { useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Loader2, Sparkles, ChevronDown, ChevronUp, Heart,
  X, ThumbsUp, Coins, Bell, CheckCircle2, Clock, AlertTriangle,
} from "lucide-react";
import {
  adminGetLikeSettings, adminListLikeCandidates,
  adminResendLikeReadyNotify,
} from "@/server/api/likes";
import { cn } from "@/lib/utils";
import { NftImage } from "@/components/NftImage";
import { SettingsPanel } from "./LikeSettingsPanel";
import { humanError } from "@/lib/humanError";

type StatusFilter = "all" | "pending" | "ready" | "completed" | "cancelled";

export function LikesDashboard() {
  const search = useSearch({ from: "/admin/likes" }) as { ready?: string };
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [status, setStatus] = useState<StatusFilter>(search.ready ? "ready" : "ready");
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const candidates = useQuery({
    queryKey: ["admin-likes-candidates", status],
    queryFn: () => adminListLikeCandidates({ data: { status } }),
    staleTime: 10_000,
  });
  const settings = useQuery({
    queryKey: ["admin-likes-settings"],
    queryFn: () => adminGetLikeSettings(),
  });

  const launchDrops = (cands: { id: string; title: string; contractId: string }[]) => {
    if (cands.length === 0) return;
    try {
      sessionStorage.setItem("yl-likes-launch", JSON.stringify(cands.map((c) => ({ candidateId: c.id, title: c.title, contractId: c.contractId }))));
    } catch {}
    navigate({ to: "/admin/drops" });
  };

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const toggleSelected = (id: string) => setSelected((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  useEffect(() => { setSelected(new Set()); }, [status]);

  const launchSelected = () => {
    const list = (candidates.data ?? []).filter((c) => selected.has(c.id) && c.status === "ready").map((c) => ({ id: c.id, title: c.title, contractId: c.contractId }));
    launchDrops(list);
  };

  const resendNotify = useMutation({
    mutationFn: (candidateId: string) => adminResendLikeReadyNotify({ data: { candidateId } }),
    onSuccess: (r) => {
      if (r.sent) toast.success("Уведомление переотправлено");
      else toast.error("Не доставилось ни одному админу — проверь ADMIN_WALLETS env и привязку TG");
      qc.invalidateQueries({ queryKey: ["admin-likes-candidates"] });
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gold/10 text-gold ring-1 ring-gold/20"><ThumbsUp className="h-5 w-5" /></span>
        <div>
          <h1 className="font-display text-3xl font-bold leading-tight">Лайки <span className="text-gradient-gold">за дроп</span></h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Голосование, экономика, стейкинг</p>
        </div>
      </header>

      {/* ─── КАНДИДАТЫ ─── */}
      <section className="space-y-3">
        <SectionHead icon={ThumbsUp} title="Кандидаты" hint="NFT набрали лайки — запусти дроп" />
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setStatus("ready")} className={cn("rounded-full border px-3 py-1 text-xs font-medium transition", status === "ready" ? "border-success/50 bg-success/10 text-success" : "border-border/50 bg-secondary/40 text-muted-foreground hover:bg-secondary hover:text-foreground")}>Готовы</button>
          {(() => {
            const others: Array<{ v: StatusFilter; label: string }> = [{ v: "pending", label: "В процессе" }, { v: "completed", label: "Завершены" }, { v: "all", label: "Все" }];
            const active = others.find((o) => o.v === status);
            return (
              <div className="relative">
                <button type="button" onClick={() => setFilterMenuOpen((v) => !v)} aria-haspopup="menu" aria-expanded={filterMenuOpen} className={cn("inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition", active ? "border-gold/50 bg-gold/10 text-gold" : "border-border/50 bg-secondary/40 text-muted-foreground hover:bg-secondary hover:text-foreground")}>
                  {active ? active.label : "Ещё"} <ChevronDown className="h-3.5 w-3.5" />
                </button>
                {filterMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setFilterMenuOpen(false)} />
                    <div className="absolute left-0 z-20 mt-1 min-w-[10rem] overflow-hidden rounded-xl border border-border/50 bg-card p-1 shadow-lg">
                      {others.map((o) => (
                        <button key={o.v} type="button" onClick={() => { setStatus(o.v); setFilterMenuOpen(false); }} className={cn("flex w-full items-center rounded-lg px-3 py-2 text-left text-xs transition hover:bg-secondary", status === o.v ? "text-gold" : "text-muted-foreground hover:text-foreground")}>{o.label}</button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            );
          })()}
        </div>

        {selected.size > 0 && (
          <div className="sticky top-2 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gold/40 bg-card/95 p-3 shadow-gold backdrop-blur">
            <span className="text-sm font-medium">Выбрано: <span className="text-gold">{selected.size}</span></span>
            <div className="flex gap-2">
              <button onClick={() => setSelected(new Set())} className="inline-flex items-center gap-1.5 rounded-full border border-border/50 bg-secondary/40 px-3 py-2 text-[11px] text-muted-foreground transition hover:bg-secondary hover:text-foreground"><X className="h-3.5 w-3.5" /> Сбросить</button>
              <button onClick={launchSelected} className="inline-flex items-center gap-1.5 rounded-full gradient-gold px-4 py-2 text-xs font-bold text-gold-foreground shadow-gold transition hover:scale-[1.02]"><Sparkles className="h-3.5 w-3.5" /> Создать дроп ({selected.size})</button>
            </div>
          </div>
        )}

        {candidates.isLoading ? (
          <div className="rounded-2xl border border-border/50 bg-card p-6 text-center text-sm text-muted-foreground"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Загружаем…</div>
        ) : (candidates.data ?? []).length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border/60 bg-card/50 p-8 text-center text-sm text-muted-foreground">Нет кандидатов с этим статусом.</div>
        ) : (
          <div className="space-y-2">
            {(candidates.data ?? []).map((c) => {
              const highlight = search.ready === c.id;
              return (
                <div key={c.id} className={cn("rounded-2xl border bg-card p-3 transition hover:border-border/80", c.status === "ready" ? "border-success/40" : "border-border/50", highlight && "ring-2 ring-gold", selected.has(c.id) && "ring-2 ring-gold/60")}>
                  <div className="flex items-center gap-3">
                    {c.status === "ready" && <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleSelected(c.id)} className="h-4 w-4 shrink-0 cursor-pointer accent-gold" title="Выбрать для массового дропа" />}
                    <div className="aspect-square h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-border/50 bg-background">
                      {c.image && <NftImage src={c.image} alt={c.title} className="h-full w-full object-cover" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{c.title}</div>
                      <div className="truncate text-[11px] text-muted-foreground">{c.contractId}</div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-2 py-0.5 text-xs font-semibold text-rose-300" title={`${c.currentLikes} из ${c.targetLikes} лайков`}><ThumbsUp className="h-3 w-3" /> {c.currentLikes}<span className="font-normal text-rose-300/60">/{c.targetLikes}</span></span>
                        <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", c.status === "ready" ? "bg-success/10 text-success" : c.status === "completed" ? "bg-gold/10 text-gold" : "bg-amber-500/10 text-amber-400")}>
                          {c.status === "ready" ? <CheckCircle2 className="h-3 w-3" /> : c.status === "completed" ? <Sparkles className="h-3 w-3" /> : <Clock className="h-3 w-3" />} {STATUS_LABEL[c.status] ?? c.status}
                        </span>
                      </div>
                    </div>
                    {c.status === "ready" && (
                      <div className="flex shrink-0 items-center gap-1.5">
                        <button onClick={() => resendNotify.mutate(c.id)} disabled={resendNotify.isPending} className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border/50 bg-secondary/40 text-muted-foreground transition hover:bg-secondary hover:text-foreground disabled:opacity-50" title="Переотправить TG-уведомление админам" aria-label="Переотправить уведомление админам"><Bell className="h-4 w-4" /></button>
                        <button onClick={() => launchDrops([{ id: c.id, title: c.title, contractId: c.contractId }])} className="inline-flex items-center gap-1.5 rounded-full gradient-gold px-3.5 py-2 text-xs font-bold text-gold-foreground shadow-gold transition hover:scale-[1.02]" title="Запустить дроп по этому кандидату"><Sparkles className="h-3.5 w-3.5" /> Дроп</button>
                      </div>
                    )}
                    {c.status === "completed" && c.completedDropId && <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground"><Sparkles className="h-3 w-3" /> {c.completedDropId.slice(0, 8)}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ─── ЭКОНОМИКА ЛАЙКОВ ─── */}
      <section className="space-y-3">
        <button onClick={() => setSettingsOpen((v) => !v)} className="flex w-full items-center gap-2.5 text-left">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gold/10 text-gold"><Coins className="h-4 w-4" /></div>
          <div className="min-w-0 flex-1">
            <div className="font-display text-sm font-bold leading-tight">Экономика лайков</div>
            <div className="truncate text-[11px] text-muted-foreground">Магазин, пакеты, промокоды, цель</div>
          </div>
          {settingsOpen ? <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />}
        </button>
        {settingsOpen && settings.data && (
          <SettingsPanel initial={settings.data} onSaved={() => { qc.invalidateQueries({ queryKey: ["admin-likes-settings"] }); qc.invalidateQueries({ queryKey: ["admin-likes-candidates"] }); }} />
        )}
      </section>
    </div>
  );
}

function SectionHead({ icon: Icon, title, hint }: { icon: typeof Heart; title: string; hint?: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gold/10 text-gold"><Icon className="h-4 w-4" /></div>
      <div className="min-w-0">
        <div className="font-display text-sm font-bold leading-tight">{title}</div>
        {hint && <div className="truncate text-[11px] text-muted-foreground">{hint}</div>}
      </div>
    </div>
  );
}

const STATUS_LABEL: Record<string, string> = {
  ready: "готов",
  pending: "в процессе",
  completed: "завершён",
  cancelled: "отменён",
};
