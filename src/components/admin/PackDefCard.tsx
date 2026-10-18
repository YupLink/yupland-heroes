// Карточка бокс-пака в админке: привязка NFT-входа, тумблер активности,
// симулятор. Вынесено из MysticPacksList (§13 ПРАВИЛА.md) — карточка выросла
// и вместе с MysticPacksList вышла бы за 250 строк.
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Loader2, Sparkles, Pencil, CheckCircle2, AlertCircle, Trash2, Copy } from "lucide-react";
import {
  adminListMysticPacks,
  adminUpdateMysticPack,
  simulateMysticOpens,
} from "@/server/api/mystic";
import { adminDeleteMysticPack, adminDuplicateMysticPack } from "@/server/api/mystic-pack-crud";
import { adminSetPackInputMapEntry } from "@/server/api/chips-mint-deposit-pack";
import { TitleAutocomplete } from "@/components/TitleAutocomplete";
import { KIND_META, tierSummary, type MysticKind, type MysticTier } from "@/components/mysticShared";
import { humanError } from "@/lib/humanError";

type BoxDef = Awaited<ReturnType<typeof adminListMysticPacks>>[number];

export function PackDefCard({
  p,
  storeContract,
  nftMap,
  onEdit,
  onChanged,
  onBound,
}: {
  p: BoxDef;
  storeContract: string;
  nftMap: Record<string, string>;
  onEdit: () => void;
  onChanged: () => void;
  onBound: () => void;
}) {
  const toggle = useMutation({
    mutationFn: () => adminUpdateMysticPack({ data: { id: p.id, active: !p.active } }),
    onSuccess: onChanged,
    onError: (e: Error) => toast.error(humanError(e)),
  });
  const dup = useMutation({
    mutationFn: () => adminDuplicateMysticPack({ data: { id: p.id } }),
    onSuccess: () => { toast.success("Копия создана (выключена)"); onChanged(); },
    onError: (e: Error) => toast.error(humanError(e)),
  });
  const del = useMutation({
    mutationFn: () => adminDeleteMysticPack({ data: { id: p.id } }),
    onSuccess: () => { toast.success("Бокс удалён"); onChanged(); },
    onError: (e: Error) => toast.error(humanError(e)),
  });
  const boundTitle = Object.entries(nftMap).find(([, v]) => v === p.id)?.[0]?.split("::").slice(1).join("::") ?? null;
  const [sel, setSel] = useState<string | null>(null);
  // Стойкое сообщение о результате привязки/отвязки: висит в карточке до
  // явного закрытия кнопкой, а не мелькает тостом (жалоба владельца — не
  // успеваешь прочитать «NFT привязан»). Тосты оставлены только там, где
  // результат не критично прочитать (тумблер активности, ошибка симулятора).
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const bind = useMutation({
    mutationFn: (title: string) => adminSetPackInputMapEntry({ data: { contract: storeContract, title, packId: p.id } }),
    onSuccess: (_d, title) => { setNotice({ ok: true, text: `NFT «${title}» привязан к боксу` }); setSel(null); onBound(); },
    onError: (e: Error) => setNotice({ ok: false, text: e.message }),
  });
  const unbind = useMutation({
    mutationFn: (title: string) => adminSetPackInputMapEntry({ data: { contract: storeContract, title, packId: "" } }),
    onSuccess: (_d, title) => { setNotice({ ok: true, text: `NFT «${title}» отвязан от бокса` }); onBound(); },
    onError: (e: Error) => setNotice({ ok: false, text: e.message }),
  });
  const doBind = () => { if (!sel || !storeContract) return; bind.mutate(sel.trim().replace(/^(\d{1,4})\s*[×xXхХ]?\s+/, "")); };
  const [simCount, setSimCount] = useState(1000);
  const sim = useMutation({
    mutationFn: () => simulateMysticOpens({ data: { packId: p.id, count: simCount } }),
    onError: (e: Error) => toast.error(humanError(e)),
  });
  const simData = sim.data;

  return (
    <div className={cn("rounded-2xl border bg-card p-3", p.active ? "border-border" : "border-border/40 opacity-60")}>
      <div className="mb-2 flex items-center gap-2">
        <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-secondary">
          {p.coverImageUrl ? <img src={p.coverImageUrl} alt="" className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center"><Sparkles className="h-4 w-4 text-gold/60" /></div>}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold">{p.name}</div>
          <div className="text-[10px] text-muted-foreground">шанс призов {Math.min(100, Math.round(p.weightSum))}% · «пусто» {Math.round(p.blankPct)}%</div>
        </div>
        <button onClick={onEdit} title="Редактировать" className="shrink-0 rounded-lg border border-border bg-secondary/40 p-1.5 text-muted-foreground transition hover:text-foreground active:scale-95"><Pencil className="h-3.5 w-3.5" /></button>
        <button onClick={() => dup.mutate()} disabled={dup.isPending} title="Копировать бокс (для правки под другой)" className="shrink-0 rounded-lg border border-border bg-secondary/40 p-1.5 text-muted-foreground transition hover:text-neon active:scale-95 disabled:opacity-50">{dup.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Copy className="h-3.5 w-3.5" />}</button>
        <button onClick={() => { if (confirm(`Удалить бокс «${p.name}»?`)) del.mutate(); }} disabled={del.isPending} title="Удалить бокс" className="shrink-0 rounded-lg border border-destructive/30 bg-destructive/5 p-1.5 text-destructive transition hover:bg-destructive/10 active:scale-95 disabled:opacity-50">{del.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}</button>
        <button onClick={() => toggle.mutate()} disabled={toggle.isPending} className={cn("rounded-full border px-2.5 py-1 text-[11px] font-bold transition active:scale-95", p.active ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400" : "border-border text-muted-foreground")}>
          {toggle.isPending ? "…" : p.active ? "активен" : "выкл"}
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {p.pool.map((t, i) => {
          const m = KIND_META[t.kind as MysticKind];
          if (!m) return null;
          const Icon = m.icon;
          return (
            <span key={i} className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px]" style={{ borderColor: m.color + "66", color: m.color }}>
              <Icon className="h-3 w-3" /> {tierSummary(t as MysticTier)} · {t.weight}%
            </span>
          );
        })}
      </div>
      <div className="mt-3 border-t border-border/50 pt-2.5">
        {/* Стойкий баннер результата — не исчезает сам, закрывается кнопкой */}
        {notice && (
          <div className={cn("mb-2 flex items-start gap-2 rounded-xl border px-3 py-2 text-xs", notice.ok ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : "border-red-500/40 bg-red-500/10 text-red-300")}>
            {notice.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />}
            <span className="min-w-0 flex-1">{notice.text}</span>
            <button onClick={() => setNotice(null)} className="shrink-0 rounded-lg border border-current/30 px-2 py-0.5 font-bold transition active:scale-95">Готово</button>
          </div>
        )}
        {boundTitle ? (
          <div className="flex items-center gap-2 text-[11px]">
            <span className="text-muted-foreground">Заводит NFT:</span>
            <span className="min-w-0 flex-1 truncate font-semibold text-neon">{boundTitle}</span>
            <button onClick={() => unbind.mutate(boundTitle)} disabled={unbind.isPending} className="shrink-0 rounded-lg border border-red-500/40 px-2 py-0.5 font-bold text-red-400 transition active:scale-95">отвязать</button>
          </div>
        ) : (
          <div className="space-y-1.5">
            <div className="text-[11px] text-muted-foreground">Какой NFT заводит бокс (число в начале тайтла = сколько боксов):</div>
            <TitleAutocomplete value={sel ? { title: sel, image: null, count: 0 } : null} onSelect={(s) => setSel(s?.title ?? null)} />
            <button onClick={doBind} disabled={!sel || bind.isPending || !storeContract} className="rounded-full bg-neon/90 px-4 py-1.5 text-xs font-bold text-background transition active:scale-95 disabled:opacity-50">
              {bind.isPending ? "Привязываю…" : "Привязать NFT"}
            </button>
          </div>
        )}
      </div>
      <div className="mt-3 border-t border-border/50 pt-2.5">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold text-muted-foreground">Симулятор</span>
          <input type="number" min={1} max={200000} value={simCount} onChange={(e) => setSimCount(Math.max(1, Math.min(200000, Number(e.target.value) || 1)))} className="w-24 rounded-lg border border-border bg-background px-2 py-1 text-sm tabular-nums" />
          <span className="text-[11px] text-muted-foreground">боксов</span>
          <div className="flex gap-1">
            {[100, 1000, 10000].map((n) => <button key={n} onClick={() => setSimCount(n)} className="rounded-md border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground transition hover:text-foreground">{n >= 1000 ? n / 1000 + "к" : n}</button>)}
          </div>
          <button onClick={() => sim.mutate()} disabled={sim.isPending} className="ml-auto shrink-0 rounded-full bg-gold px-3.5 py-1.5 text-xs font-bold text-background transition active:scale-95 disabled:opacity-50">
            {sim.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Открыть"}
          </button>
        </div>
        {simData && (
          <div className="mt-2 overflow-hidden rounded-xl border border-border/60">
            <div className="flex items-center justify-between bg-secondary/40 px-3 py-1.5 text-[11px] font-semibold">
              <span>{simData.count.toLocaleString("ru")} открытий</span>
              <span className="text-muted-foreground">«пусто»: {simData.blanks.toLocaleString("ru")} · {simData.blankPct}%</span>
            </div>
            <div className="max-h-64 overflow-y-auto">
              <table className="w-full text-[11px]"><tbody>
                {simData.results.map((r, i) => {
                  const m = KIND_META[r.kind as MysticKind]; const Icon = m?.icon;
                  return (
                    <tr key={i} className="border-t border-border/40 first:border-0">
                      <td className="py-1.5 pl-3 pr-2"><span className="inline-flex items-center gap-1.5">{Icon && <Icon className="h-3 w-3 shrink-0" style={{ color: m.color }} />}<span className="truncate">{r.name}</span></span></td>
                      <td className="whitespace-nowrap px-2 text-right font-bold tabular-nums">{r.hits.toLocaleString("ru")}</td>
                      <td className="whitespace-nowrap px-2 text-right tabular-nums text-muted-foreground">{r.pct}%</td>
                      <td className="whitespace-nowrap py-1.5 pl-2 pr-3 text-right tabular-nums text-gold">{r.total != null ? `Σ ${r.total.toLocaleString("ru")}` : ""}</td>
                    </tr>
                  );
                })}
              </tbody></table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
