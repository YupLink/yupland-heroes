import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Plus, Loader2, Sparkles, Gift, X } from "lucide-react";
import { adminListMysticPacks, adminGrantMysticBox } from "@/server/api/mystic";
import { adminGetPackInputConfig } from "@/server/api/chips-mint-deposit-pack";
import { CreateForm } from "./MysticPackEditor";
import { PackDefCard } from "./PackDefCard";
import { parseGrantList, clampGrantCount, type GrantTarget } from "@/lib/grantList";

type BoxDef = Awaited<ReturnType<typeof adminListMysticPacks>>[number];

export function MysticPacksAdminPanel() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<BoxDef | null>(null);
  const defs = useQuery({ queryKey: ["admin-mystic-packs"], queryFn: () => adminListMysticPacks() });
  const nftCfg = useQuery({ queryKey: ["mystic-nft-map"], queryFn: () => adminGetPackInputConfig() });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-fuchsia-500/15 text-fuchsia-300"><Sparkles className="h-5 w-5" /></span>
          <h2 className="text-lg font-bold">Мистические боксы</h2>
        </div>
        <button onClick={() => { setEditing(null); setOpen((v) => !v); }} className="inline-flex items-center gap-1 rounded-full border border-gold/40 bg-gold/10 px-3 py-1.5 text-sm font-bold text-gold transition active:scale-95">
          <Plus className="h-4 w-4" /> Создать бокс
        </button>
      </div>
      {(open || editing) && (
        <CreateForm initial={editing} onDone={() => { setOpen(false); setEditing(null); qc.invalidateQueries({ queryKey: ["admin-mystic-packs"] }); }} />
      )}
      {(defs.data ?? []).length > 0 && <GrantBoxBlock packs={defs.data ?? []} />}
      {defs.isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : (defs.data ?? []).length === 0 ? (
        <div className="flex justify-center py-10 text-fuchsia-300/25"><Sparkles className="h-10 w-10" /></div>
      ) : (
        <div className="space-y-2">
          {(defs.data ?? []).map((p) => (
            <PackDefCard key={p.id} p={p} storeContract={nftCfg.data?.storeContract ?? ""} nftMap={nftCfg.data?.map ?? {}} onEdit={() => { setOpen(false); setEditing(p); }} onChanged={() => qc.invalidateQueries({ queryKey: ["admin-mystic-packs"] })} onBound={() => qc.invalidateQueries({ queryKey: ["mystic-nft-map"] })} />
          ))}
        </div>
      )}
    </div>
  );
}

type GrantRow = { wallet: string; count: string };
type GrantResult = { wallet: string; count: number; ok: boolean; msg?: string };

function GrantBoxBlock({ packs }: { packs: BoxDef[] }) {
  const [packId, setPackId] = useState("");
  const [rows, setRows] = useState<GrantRow[]>([{ wallet: "", count: "1" }]);
  const [bulk, setBulk] = useState("");
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<GrantResult[]>([]);

  const bulkParsed: GrantTarget[] = parseGrantList(bulk);
  const rowsParsed: GrantTarget[] = rows
    .map((r) => ({ wallet: r.wallet.trim(), count: clampGrantCount(r.count) }))
    .filter((r) => r.wallet.length >= 3);
  const jobs = bulkParsed.length > 0 ? bulkParsed : rowsParsed;
  const canRun = !!packId && jobs.length > 0 && !running;
  const totalBoxes = jobs.reduce((s, j) => s + j.count, 0);

  async function runAll() {
    setRunning(true); setResults([]);
    const out: GrantResult[] = [];
    const BATCH = 4;
    for (let i = 0; i < jobs.length; i += BATCH) {
      const chunk = jobs.slice(i, i + BATCH);
      const chunkRes = await Promise.all(chunk.map(async (j) => {
        try { const r = await adminGrantMysticBox({ data: { wallet: j.wallet, packId, count: j.count } }); return { wallet: j.wallet, count: r.granted, ok: true } as GrantResult; }
        catch (e) { return { wallet: j.wallet, count: j.count, ok: false, msg: e instanceof Error ? e.message : String(e) } as GrantResult; }
      }));
      out.push(...chunkRes);
      setResults([...out]);
    }
    setRunning(false);
    const okN = out.filter((r) => r.ok).length;
    const boxN = out.filter((r) => r.ok).reduce((s, r) => s + r.count, 0);
    const failN = out.length - okN;
    if (failN === 0) toast.success(`Выдано: ${okN} кош. · ${boxN} боксов`);
    else toast.error(`Ошибки: ${failN}. Успешно: ${okN} кош. · ${boxN} боксов`);
    if (failN === 0) { setRows([{ wallet: "", count: "1" }]); setBulk(""); }
  }

  return (
    <div className="space-y-3 rounded-xl border border-fuchsia-500/25 bg-fuchsia-500/5 p-3">
      <div className="flex items-center gap-1.5 text-sm font-bold text-fuchsia-200"><Gift className="h-4 w-4" /> Раздать бокс кошелькам</div>
      <select value={packId} onChange={(e) => setPackId(e.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
        <option value="">— выбрать бокс —</option>
        {packs.map((p) => <option key={p.id} value={p.id}>{p.name}{p.active ? "" : " (выкл)"}</option>)}
      </select>
      <div className="space-y-1.5">
        {rows.map((r, i) => (
          <div key={i} className="flex gap-2">
            <input value={r.wallet} onChange={(e) => { const next = [...rows]; next[i] = { ...next[i], wallet: e.target.value }; setRows(next); }} placeholder="wallet.near" className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm" />
            <input type="number" min={1} max={500} value={r.count} onChange={(e) => { const next = [...rows]; next[i] = { ...next[i], count: e.target.value }; setRows(next); }} className="w-20 rounded-lg border border-border bg-background px-3 py-2 text-sm tabular-nums" />
            <button type="button" onClick={() => { if (rows.length === 1) setRows([{ wallet: "", count: "1" }]); else setRows(rows.filter((_, j) => j !== i)); }} className="rounded-lg border border-border bg-secondary/40 px-2 text-muted-foreground transition hover:text-foreground" title="Убрать строку"><X className="h-3.5 w-3.5" /></button>
          </div>
        ))}
        <button type="button" onClick={() => setRows([...rows, { wallet: "", count: "1" }])} className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary/40 px-2.5 py-1 text-[11px] font-bold text-muted-foreground transition hover:text-foreground"><Plus className="h-3 w-3" /> Ещё кошелёк</button>
      </div>
      <div>
        <div className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">Или вставь списком (по строке: <code>wallet,count</code> · через запятую/пробел/таб)</div>
        <textarea value={bulk} onChange={(e) => setBulk(e.target.value)} placeholder={"alice.tg, 2\nbob.near 1\ncarol.tg\t3"} rows={4} className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs leading-snug" />
        {bulk.trim() && bulkParsed.length === 0 && <div className="mt-1 text-[11px] text-destructive">Формат: wallet.near count (в каждой строке)</div>}
      </div>
      {jobs.length > 0 && (
        <div className="rounded-lg border border-border bg-secondary/20 px-3 py-1.5 text-[11px] text-muted-foreground">
          К начислению: <b className="text-foreground">{jobs.length}</b> кошельков · <b className="text-foreground">{totalBoxes}</b> боксов
          {bulkParsed.length > 0 && rowsParsed.length > 0 && <span className="ml-2 text-fuchsia-300/80">(используется список ниже, не строки выше)</span>}
        </div>
      )}
      <button onClick={runAll} disabled={!canRun} className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-fuchsia-500/20 py-2 text-sm font-bold text-fuchsia-200 transition active:scale-95 disabled:opacity-40">
        {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Gift className="h-4 w-4" />} Начислить
      </button>
      {results.length > 0 && (
        <div className="max-h-56 space-y-0.5 overflow-y-auto rounded-lg border border-border bg-background/40 p-2 text-[11px] font-mono">
          {results.map((r, i) => (
            <div key={i} className={cn("flex justify-between gap-2", r.ok ? "text-emerald-300" : "text-rose-400")}>
              <span className="truncate">{r.ok ? "✓" : "✗"} {r.wallet}</span>
              <span className="tabular-nums">{r.ok ? `+${r.count}` : r.msg?.slice(0, 40)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
