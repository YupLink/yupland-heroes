import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createComboDropEvent } from "@/server/api/admin-campaigns-combo";
import { createDropEventsBulk } from "@/server/api/admin-campaigns-bulk";
import { deleteDropEvent, setDropStatus, setDropRecurring } from "@/server/api/admin-campaigns-manage";
import { listDropEvents } from "@/server/api/admin-campaigns-list";
import { getOperatingBalances } from "@/server/api/admin-users";
import { listRewardTokens } from "@/server/api/admin-payouts";
import { isUsdt } from "@/lib/usdtBanned";
import { normalizeTitle } from "@/lib/normalizeTitle";
import { toast } from "sonner";
import { Plus, Wallet, ChevronDown, X, Layers, Package, Ticket, Sparkles } from "lucide-react";
import { DEFAULT_CLAIM_GOLD } from "./goldCost";
import { PacksAdminPanel } from "@/components/admin/PacksAdminPanel";
import { ChipDropPanel } from "@/components/admin/ChipDropPanel";
import { ServiceWalletPanel } from "@/components/ServiceWalletPanel";
import { ReclaimStorageButton } from "@/components/admin/ReclaimStorageButton";
import { cn } from "@/lib/utils";
import { parseRewardSpec, formatRewardSpec, parsePackQty } from "./helpers";
import { CreateDropConfirmModal } from "./CreateDropConfirmModal";
import { DuplicateWarnModal } from "./DuplicateWarnModal";
import { DropsList } from "./DropsList";
import { CreateDropForm } from "./CreateDropForm";
import type { DropEvent, TierDraft, LikeLaunchItem } from "./types";
import { humanError } from "@/lib/humanError";
import type { GoodsPick } from "./GoodsPicker";

export function AdminDrops() {
  const qc = useQueryClient();
  const formRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<"simple" | "combo" | "packs" | "chip">("simple");
  const [selectedTitles, setSelectedTitles] = useState<Array<{ title: string; image: string | null; count: number }>>([]);
  const [reward, setReward] = useState("");
  const [token, setToken] = useState("");
  const [duplicateWarn, setDuplicateWarn] = useState<{ titles: string[] } | null>(null);
  const lastSubmittedRef = useRef<any>(null);
  const [confirmDraft, setConfirmDraft] = useState<null | { kind: "simple" | "combo"; summary: { titles: string[]; rewardLine: string; freeClaim: boolean; ticketCost: number; allowDuplicate: boolean }; payload: unknown }>(null);
  const [simpleKind, setSimpleKind] = useState<"ft" | "nft" | "pack" | "energy" | "custom">("ft");
  const [simpleItem, setSimpleItem] = useState<GoodsPick | null>(null);
  const [simpleNftTitle, setSimpleNftTitle] = useState("");
  const [simplePackId, setSimplePackId] = useState("");
  const [simplePackQty, setSimplePackQty] = useState("1");
  const [freeClaim, setFreeClaim] = useState(false);
  const [recurring, setRecurring] = useState(false);
  const [ticketCost, setTicketCost] = useState(DEFAULT_CLAIM_GOLD); // золото, см. goldCost.ts
  const [useTiers, setUseTiers] = useState(false);
  const [tiers, setTiers] = useState<TierDraft[]>([]);
  const [balanceOpen, setBalanceOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [comboCounts, setComboCounts] = useState<Record<string, string>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [likeLaunch, setLikeLaunch] = useState<LikeLaunchItem[]>([]);

  useEffect(() => {
    setComboCounts((prev) => {
      const next: Record<string, string> = {};
      for (const t of selectedTitles) next[t.title] = prev[t.title] ?? "1";
      return next;
    });
  }, [selectedTitles]);

  // USDT дроп не раздаёт (ПРАВИЛА §8.49а) — в выборе токена его нет.
  const tokens = useQuery({
    queryKey: ["admin", "reward-tokens"],
    queryFn: () => listRewardTokens(),
    select: (rows) => rows.filter((t) => !isUsdt(t.symbol)),
  });
  const opBalances = useQuery({ queryKey: ["admin", "operating-balances"], queryFn: () => getOperatingBalances(), enabled: balanceOpen, refetchInterval: balanceOpen ? 60_000 : false });
  const selectedBalance = opBalances.data?.find((b) => b.symbol === token);

  useEffect(() => {
    if (!tokens.data || tokens.data.length === 0) return;
    if (!tokens.data.find((t) => t.symbol === token)) setToken(tokens.data[0].symbol);
  }, [tokens.data, token]);

  const drops = useQuery({ queryKey: ["admin", "drops"], queryFn: () => listDropEvents() });

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("yl-likes-launch");
      if (!raw) return;
      const parsed = JSON.parse(raw) as LikeLaunchItem | LikeLaunchItem[];
      sessionStorage.removeItem("yl-likes-launch");
      const list = Array.isArray(parsed) ? parsed : [parsed];
      if (list.length === 0) return;
      setLikeLaunch(list);
      setSelectedTitles(list.map((p) => ({ title: p.title, image: null, count: 1 })));
      setCreateOpen(true);
      setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
    } catch { /* ignore */ }
  }, []);

  const create = useMutation({
    mutationFn: createDropEventsBulk,
    onSuccess: async (res) => {
      const dupErrors = res.results.filter((r) => !r.ok && (r.error ?? "").toLowerCase().includes("уже есть active дроп"));
      if (res.created === 0 && dupErrors.length > 0 && dupErrors.length === res.failed) {
        setConfirmDraft(null); setDuplicateWarn({ titles: dupErrors.map((r) => r.title) }); return;
      }
      if (res.created > 0) toast.success(`Создано дропов: ${res.created}${res.failed > 0 ? ` (ошибок: ${res.failed})` : ""}`);
      if (res.failed > 0) for (const r of res.results.filter((x) => !x.ok).slice(0, 2)) toast.error(`${r.title}: ${r.error ?? "?"}`);
      if (likeLaunch.length > 0 && res.created > 0) {
        try {
          const { adminMarkLikeCandidateDropped } = await import("@/server/api/likes");
          let marked = 0;
          for (const cand of likeLaunch) {
            const match = res.results.find((r) => r.ok && normalizeTitle(r.title) === normalizeTitle(cand.title)) as { id?: string } | undefined;
            if (!match?.id) continue;
            try { await adminMarkLikeCandidateDropped({ data: { candidateId: cand.candidateId, dropId: match.id } }); marked++; } catch (err) { console.error("markLikeCandidate failed", cand.candidateId, err); }
          }
          if (marked > 0) toast.success(marked === 1 ? "Лайки за кандидата зачтены" : `Лайки зачтены: ${marked} поз.`);
        } catch (err) { console.error("markLikeCandidate import failed", err); }
        setLikeLaunch([]);
      }
      if (res.created > 0) { setSelectedTitles([]); setReward(""); setFreeClaim(false); setRecurring(false); setConfirmDraft(null); }
      qc.invalidateQueries({ queryKey: ["admin", "drops"] });
    },
    onError: (e: Error) => { toast.error(humanError(e)); setConfirmDraft(null); },
  });

  const createCombo = useMutation({
    mutationFn: createComboDropEvent,
    onSuccess: (res) => { toast.success(`Combo создан: ${res.name}`); setSelectedTitles([]); setReward(""); setFreeClaim(false); setRecurring(false); setComboCounts({}); setConfirmDraft(null); qc.invalidateQueries({ queryKey: ["admin", "drops"] }); },
    onError: (e: Error) => { toast.error(humanError(e)); setConfirmDraft(null); },
  });

  const copyFromExisting = (d: DropEvent) => {
    setMode(d.mode); setReward(formatRewardSpec(d.rewardMin, d.rewardMax)); setToken(d.rewardToken); setFreeClaim(d.freeClaim); setRecurring(d.recurring);
    if (d.rewardTiers && d.rewardTiers.length > 0) {
      setUseTiers(true);
      setTiers(d.rewardTiers.map((t) => ({ weight: String(t.weight), kind: ((t as { kind?: string }).kind ?? "ft") as any, rewardMin: String(t.rewardMin), rewardMax: String(t.rewardMax), rewardToken: t.rewardToken, nftTitle: ((t as { nftTitle?: string }).nftTitle ?? "") as string, packId: ((t as { packId?: string }).packId ?? "") as string, packQty: String(parsePackQty((t as { packQty?: number }).packQty)), itemId: (t as { itemId?: string }).itemId, itemName: (t as { itemName?: string }).itemName, itemImage: (t as { itemImage?: string }).itemImage })));
    } else { setUseTiers(false); setTiers([]); }
    if (d.mode === "combo" && d.requirements) {
      setSelectedTitles(d.requirements.map((r) => ({ title: r.title, image: null, count: r.count })));
      const seedCounts: Record<string, string> = {}; for (const r of d.requirements) seedCounts[r.title] = String(r.count); setComboCounts(seedCounts);
    } else { setSelectedTitles([{ title: d.title, image: null, count: d.totalNfts || 1 }]); }
    setCreateOpen(true);
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };

  const del = useMutation({ mutationFn: (id: string) => deleteDropEvent({ data: { id } }), onSuccess: () => { toast.success("Дроп удалён"); qc.invalidateQueries({ queryKey: ["admin", "drops"] }); }, onError: (e: Error) => toast.error(humanError(e)) });
  const togglePause = useMutation({ mutationFn: (args: { id: string; status: "active" | "paused" }) => setDropStatus({ data: args }), onSuccess: (res) => { toast.success(res.status === "paused" ? "Дроп на паузе" : "Дроп возобновлён"); qc.invalidateQueries({ queryKey: ["admin", "drops"] }); }, onError: (e: Error) => toast.error(humanError(e)) });
  const toggleRecurring = useMutation({ mutationFn: (args: { id: string; recurring: boolean }) => setDropRecurring({ data: args }), onSuccess: (res) => { toast.success(res.recurring ? "Авто-перезапуск ВКЛ" : "Авто-перезапуск выкл"); qc.invalidateQueries({ queryKey: ["admin", "drops"] }); }, onError: (e: Error) => toast.error(humanError(e)) });

  const runConfirmed = (allowDuplicate: boolean) => {
    if (!confirmDraft) return;
    if (confirmDraft.kind === "combo") { createCombo.mutate(confirmDraft.payload as any); }
    else { const p = confirmDraft.payload as any; const args = { data: { ...p.data, allowDuplicate } }; lastSubmittedRef.current = args; create.mutate(args as any); }
  };
  const runWithDuplicate = () => {
    if (!lastSubmittedRef.current) { setDuplicateWarn(null); return; }
    const args = { data: { ...lastSubmittedRef.current.data, allowDuplicate: true } }; lastSubmittedRef.current = args; setDuplicateWarn(null); create.mutate(args as any);
  };

  const totalNftsAcrossSelection = selectedTitles.reduce((sum, t) => sum + t.count, 0);
  const submitting = create.isPending || createCombo.isPending;

  return (
    <div className="space-y-8">
      {confirmDraft && <CreateDropConfirmModal summary={confirmDraft.summary} kind={confirmDraft.kind} isPending={submitting} onCancel={() => setConfirmDraft(null)} onConfirm={runConfirmed} />}
      {duplicateWarn && <DuplicateWarnModal titles={duplicateWarn.titles} isPending={create.isPending} onCancel={() => setDuplicateWarn(null)} onConfirm={runWithDuplicate} />}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Дропы</div>
          <h1 className="mt-1 font-display text-3xl font-bold">Управление <span className="text-gradient-gold">дропами</span></h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ReclaimStorageButton />
          <button onClick={() => setBalanceOpen((v) => !v)} className={cn("inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition", balanceOpen ? "border-gold/30 bg-gold/5 text-gold" : "border-border bg-secondary/30 text-muted-foreground hover:text-foreground")}>
            <Wallet className="h-3.5 w-3.5" /> Баланс сервиса
            <ChevronDown className={cn("h-3 w-3 transition", balanceOpen && "rotate-180")} />
          </button>
          <button onClick={() => { setCreateOpen((v) => { const next = !v; if (next) setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50); return next; }); }} className="inline-flex items-center gap-2 rounded-full gradient-gold px-4 py-2 text-sm font-bold text-gold-foreground shadow-gold transition hover:scale-[1.02]">
            <Plus className="h-4 w-4" /> Создать дроп
          </button>
        </div>
      </header>
      {balanceOpen && <ServiceWalletPanel />}
      {createOpen && (
        <div ref={formRef} className="rounded-3xl border border-border bg-card p-5 sm:p-6">
          <div className="mb-4 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-medium"><Plus className="h-4 w-4 text-gold" /> Создать дроп</div>
            <button type="button" onClick={() => setCreateOpen(false)} className="inline-flex items-center gap-1 rounded-lg border border-border bg-secondary/30 px-2 py-1 text-[11px] text-muted-foreground transition hover:text-foreground"><X className="h-3 w-3" /> Свернуть</button>
          </div>
          <div className="mb-1.5 inline-flex flex-wrap rounded-2xl border border-border bg-secondary/40 p-1">
            {([["simple", "Обычный", Sparkles], ["combo", "Комбо", Layers], ["packs", "Лут-бокс", Package], ["chip", "За фишку", Ticket]] as const).map(([m, label, Icon]) => (
              <button key={m} type="button" onClick={() => setMode(m)} className={cn("inline-flex items-center gap-1.5 rounded-xl px-4 py-1.5 text-xs font-medium transition", mode === m ? "gradient-gold text-gold-foreground shadow-gold" : "text-muted-foreground hover:text-foreground")} title={m === "chip" ? "Дроп за NFT-фишки коллекции" : undefined}>
                <Icon className="h-3.5 w-3.5" /> {label}
              </button>
            ))}
          </div>
          <p className="mb-4 text-[11px] text-muted-foreground">
            {mode === "simple" ? "Раздача за одну NFT — юзер гасит свою NFT и получает награду." : mode === "combo" ? "Нужен набор разных NFT — юзер собирает комбо и получает награду." : mode === "packs" ? "Лут-бокс как приз — управление паками-коробками с призами." : "Дроп за NFT-фишку коллекции нужного уровня."}
          </p>
          {mode === "packs" && <PacksAdminPanel />}
          {mode === "chip" && <ChipDropPanel />}
          {mode !== "packs" && mode !== "chip" && (
            <CreateDropForm
              mode={mode} setMode={setMode} selectedTitles={selectedTitles} setSelectedTitles={setSelectedTitles}
              reward={reward} setReward={setReward} token={token} setToken={setToken}
              simpleKind={simpleKind} setSimpleKind={setSimpleKind} simpleNftTitle={simpleNftTitle} setSimpleNftTitle={setSimpleNftTitle}
              simplePackId={simplePackId} setSimplePackId={setSimplePackId}
              simplePackQty={simplePackQty} setSimplePackQty={setSimplePackQty}
              simpleItem={simpleItem} setSimpleItem={setSimpleItem}
              freeClaim={freeClaim} setFreeClaim={setFreeClaim}
              recurring={recurring} setRecurring={setRecurring} ticketCost={ticketCost} setTicketCost={setTicketCost}
              useTiers={useTiers} setUseTiers={setUseTiers} tiers={tiers} setTiers={setTiers}
              comboCounts={comboCounts} setComboCounts={setComboCounts} likeLaunch={likeLaunch} setLikeLaunch={setLikeLaunch}
              tokens={tokens.data ?? []} balanceOpen={balanceOpen} setBalanceOpen={setBalanceOpen}
              selectedBalance={selectedBalance ?? null} totalNftsAcrossSelection={totalNftsAcrossSelection}
              submitting={submitting} setConfirmDraft={setConfirmDraft} lastSubmittedRef={lastSubmittedRef}
            />
          )}
        </div>
      )}
      {mode !== "packs" && (
        <DropsList drops={drops.data ?? []} isLoading={drops.isLoading} opBalances={opBalances.data ?? []} tokens={tokens.data ?? []} editingId={editingId} onEdit={setEditingId} onCancelEdit={() => setEditingId(null)} onCopy={copyFromExisting} onDelete={(d) => { if (confirm(`Удалить дроп «${d.title}»? Связанные не-погашенные NFT тоже сотрутся у юзеров.`)) del.mutate(d.id); }} deleting={del.isPending} onTogglePause={(d) => togglePause.mutate({ id: d.id, status: d.status === "paused" ? "active" : "paused" })} togglingPause={togglePause.isPending} onToggleRecurring={(d) => toggleRecurring.mutate({ id: d.id, recurring: !d.recurring })} togglingRecurring={toggleRecurring.isPending} />
      )}
    </div>
  );
}
