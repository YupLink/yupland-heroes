import { Plus, Loader2, Gift, Repeat, Layers, X } from "lucide-react";
import { toast } from "sonner";
import { TitleMultiSelect } from "@/components/TitleMultiSelect";
import { TitleAutocomplete } from "@/components/TitleAutocomplete";
import { cn } from "@/lib/utils";
import { parseRewardSpec, parsePackQty } from "./helpers";
import { KindToggle } from "./KindToggle";
import { PackPicker } from "./PackPicker";
import { PackQtyInput } from "./PackQtyInput";
import { TiersEditor } from "./TiersEditor";
import { GoodsPicker, type GoodsPick } from "./GoodsPicker";
import { RequiredTokensHint } from "./RequiredTokensHint";
import { snapClaimGold, ticketCostFromGold } from "./goldCost";
import type { TierDraft, LikeLaunchItem } from "./types";

export function CreateDropForm({
  mode, setMode, selectedTitles, setSelectedTitles,
  reward, setReward, token, setToken,
  simpleKind, setSimpleKind, simpleNftTitle, setSimpleNftTitle,
  simplePackId, setSimplePackId, simplePackQty, setSimplePackQty,
  simpleItem, setSimpleItem,
  freeClaim, setFreeClaim,
  recurring, setRecurring, ticketCost, setTicketCost,
  useTiers, setUseTiers, tiers, setTiers,
  comboCounts, setComboCounts, likeLaunch, setLikeLaunch,
  tokens, balanceOpen, setBalanceOpen,
  selectedBalance, totalNftsAcrossSelection,
  submitting, setConfirmDraft, lastSubmittedRef,
}: {
  mode: string; setMode: (m: any) => void;
  selectedTitles: Array<{ title: string; image: string | null; count: number }>;
  setSelectedTitles: (v: any) => void;
  reward: string; setReward: (v: string) => void;
  token: string; setToken: (v: string) => void;
  simpleKind: "ft" | "nft" | "pack" | "energy" | "custom"; setSimpleKind: (v: any) => void;
  simpleNftTitle: string; setSimpleNftTitle: (v: string) => void;
  simplePackId: string; setSimplePackId: (v: string) => void;
  simplePackQty: string; setSimplePackQty: (v: string) => void;
  simpleItem: GoodsPick | null; setSimpleItem: (v: GoodsPick) => void;
  freeClaim: boolean; setFreeClaim: (v: boolean) => void;
  recurring: boolean; setRecurring: (v: boolean) => void;
  ticketCost: string; setTicketCost: (v: string) => void;
  useTiers: boolean; setUseTiers: (v: boolean) => void;
  tiers: TierDraft[]; setTiers: (v: TierDraft[]) => void;
  comboCounts: Record<string, string>; setComboCounts: (v: any) => void;
  likeLaunch: LikeLaunchItem[]; setLikeLaunch: (v: any) => void;
  tokens: Array<{ symbol: string }>; balanceOpen: boolean; setBalanceOpen: (v: boolean) => void;
  selectedBalance: { symbol: string; raw: string; human: string; decimals: number } | null;
  totalNftsAcrossSelection: number;
  submitting: boolean;
  setConfirmDraft: (v: any) => void; lastSubmittedRef: React.MutableRefObject<any>;
}) {
  const rewardParsed = parseRewardSpec(reward);
  const parsedTiers = useTiers
    ? tiers.map((t) => ({ weight: Number(t.weight), kind: t.kind, rewardMin: Math.floor(Number(t.rewardMin)), rewardMax: Math.floor(Number(t.rewardMax)), rewardToken: t.rewardToken, nftTitle: t.nftTitle, packId: t.packId, packQty: t.kind === "pack" ? parsePackQty(t.packQty) : undefined, ...(t.kind === "custom" ? { itemId: t.itemId ?? "", itemName: t.itemName ?? "", itemImage: t.itemImage ?? undefined } : {}) }))
        .filter((t) => { if (!Number.isFinite(t.weight) || t.weight <= 0) return false; if (t.kind === "custom") return !!t.itemId?.startsWith("cst_") && t.rewardMin >= 1 && t.rewardMax >= t.rewardMin; if (t.kind === "nft") return !!t.nftTitle && t.nftTitle.trim().length > 0; if (t.kind === "pack") return !!t.packId && t.packId.trim().length > 0; return Number.isFinite(t.rewardMin) && t.rewardMin >= 0 && Number.isFinite(t.rewardMax) && t.rewardMax >= t.rewardMin && !!t.rewardToken; })
    : [];
  const tiersValid = useTiers ? parsedTiers.length > 0 && parsedTiers.length === tiers.length : true;
  const tiersTotalWeight = parsedTiers.reduce((s, t) => s + t.weight, 0);
  const simpleValid = useTiers ? true : simpleKind === "nft" ? simpleNftTitle.trim().length > 0 : simpleKind === "pack" ? simplePackId.trim().length > 0 : simpleKind === "energy" ? !!rewardParsed : simpleKind === "custom" ? !!simpleItem && !!rewardParsed && rewardParsed.min >= 1 : !!rewardParsed && !!token;
  const canSubmit = selectedTitles.length > 0 && (useTiers ? tiersValid && parsedTiers.length > 0 : simpleValid);

  const onSubmit = () => {
    if (selectedTitles.length === 0) { toast.error("Сначала выбери NFT галочками"); return; }
    if (!useTiers && simpleKind === "ft" && !rewardParsed) { toast.error('Награда: целое число "10" или диапазон "1-10"'); return; }
    if (!useTiers && simpleKind === "nft" && !simpleNftTitle.trim()) { toast.error("Выбери NFT-приз"); return; }
    if (!useTiers && simpleKind === "pack" && !simplePackId.trim()) { toast.error("Выбери пак"); return; }
    if (!useTiers && simpleKind === "energy" && !rewardParsed) { toast.error('Энергия: целое число "10" или диапазон "1-10"'); return; }
    if (!useTiers && simpleKind === "custom" && !(simpleItem && rewardParsed && rewardParsed.min >= 1)) { toast.error('Товар: выбери его и количество "1" или "1-10"'); return; }
    if (useTiers && parsedTiers.length === 0) { toast.error("Заполни хотя бы один ярус"); return; }
    const fallbackTokenSym = token || (tokens[0]?.symbol ?? "HOPE");
    const simpleSpecialTier = !useTiers && simpleKind === "nft"
      ? [{ weight: 100, kind: "nft" as const, rewardMin: 0, rewardMax: 0, rewardToken: fallbackTokenSym, nftTitle: simpleNftTitle.trim(), packId: "", packQty: undefined }]
      : !useTiers && simpleKind === "pack"
        ? [{ weight: 100, kind: "pack" as const, rewardMin: 0, rewardMax: 0, rewardToken: fallbackTokenSym, nftTitle: "", packId: simplePackId.trim(), packQty: parsePackQty(simplePackQty) }]
        : !useTiers && simpleKind === "energy"
          ? [{ weight: 100, kind: "energy" as const, rewardMin: rewardParsed?.min ?? 0, rewardMax: rewardParsed?.max ?? rewardParsed?.min ?? 0, rewardToken: "energy", nftTitle: "", packId: "", packQty: undefined }]
          : !useTiers && simpleKind === "custom" && simpleItem
            ? [{ weight: 100, kind: "custom" as const, rewardMin: rewardParsed?.min ?? 1, rewardMax: rewardParsed?.max ?? rewardParsed?.min ?? 1, rewardToken: "custom", nftTitle: "", packId: "", packQty: undefined, itemId: simpleItem.id, itemName: simpleItem.name, itemImage: simpleItem.image ?? undefined }]
            : null;
    const tiersOut = useTiers && parsedTiers.length > 0 ? parsedTiers : simpleSpecialTier;
    const firstFt = (tiersOut ?? []).find((t) => t.kind === "ft");
    const firstNumeric = (tiersOut ?? []).find((t) => t.kind === "ft" || t.kind === "energy");
    const fallback = tiersOut && tiersOut.length > 0
      ? { min: firstNumeric ? firstNumeric.rewardMin : 0, max: firstNumeric ? Math.max(firstNumeric.rewardMax, firstNumeric.rewardMin) : 0, token: (firstFt && firstFt.rewardToken) || tiersOut[0].rewardToken || fallbackTokenSym }
      : rewardParsed ? { min: rewardParsed.min, max: rewardParsed.max, token } : null;
    if (!fallback) { toast.error("Не задана награда"); return; }
    // Поле — золото; в базу прежний ticket_cost в билетах (золото / 500, §8.61).
    const effectiveTicketCost = freeClaim ? 1 : ticketCostFromGold(ticketCost);
    const rewardLine = tiersOut && tiersOut.length > 0
      ? tiersOut.map((t) => { const k = (t as any).kind ?? "ft"; if (k === "nft") return `🎁 ${(t as any).nftTitle ?? "?"}`; if (k === "pack") { const q = parsePackQty((t as any).packQty); return `📦 пак ${(t as any).packId ?? "?"}${q > 1 ? ` ×${q}` : ""}`; } if (k === "energy") return `⚡ ${(t as any).rewardMin}-${(t as any).rewardMax} энергии`; if (k === "custom") return `🎒 ${(t as any).itemName || (t as any).itemId} ×${(t as any).rewardMin}-${(t as any).rewardMax}`; return `${(t as any).rewardMin}-${(t as any).rewardMax} ${(t as any).rewardToken}`; }).join(" · ")
      : `${fallback.min}-${fallback.max} ${fallback.token}`;
    if (mode === "combo") {
      const requirements = selectedTitles.map((t) => ({ title: t.title, count: Math.floor(Number(comboCounts[t.title] ?? "0")) })).filter((r) => r.count > 0);
      if (requirements.length === 0) { toast.error("Хотя бы одно требование с количеством > 0"); return; }
      setConfirmDraft({ kind: "combo", summary: { titles: selectedTitles.map((t) => `${t.title} ×${comboCounts[t.title] ?? "?"}`), rewardLine, freeClaim, ticketCost: effectiveTicketCost, allowDuplicate: false }, payload: { data: { requirements, rewardMin: fallback.min, rewardMax: fallback.max, rewardToken: fallback.token, rewardTiers: tiersOut, freeClaim, ticketCost: effectiveTicketCost, recurring } } });
    } else {
      setConfirmDraft({ kind: "simple", summary: { titles: selectedTitles.map((t) => t.title), rewardLine, freeClaim, ticketCost: effectiveTicketCost, allowDuplicate: false }, payload: { data: { titles: selectedTitles.map((t) => t.title), rewardMin: fallback.min, rewardMax: fallback.max, rewardToken: fallback.token, rewardTiers: tiersOut, maxTotalPool: null, maxUsers: null, freeClaim, ticketCost: effectiveTicketCost, recurring } } });
    }
  };

  return (
    <div className="space-y-4">
      {likeLaunch.length > 0 && (
        <div className="mb-3 flex items-center gap-2 rounded-xl border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-xs">
          <span className="text-rose-300">❤️</span>
          <span className="min-w-0 flex-1"><b>Запуск из голосования</b>: {likeLaunch.length === 1 ? `«${likeLaunch[0].title}»` : `${likeLaunch.length} позиц.`} — после создания лайки автоматически зачтутся у всех.</span>
          <button type="button" onClick={() => setLikeLaunch([])} className="text-[10px] text-muted-foreground underline hover:text-foreground">отменить</button>
        </div>
      )}
      <div>
        <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground">{mode === "combo" ? "NFT-требования (галочки + кол-во каждого)" : "Название NFT (выбери галочками)"}</label>
        <TitleMultiSelect value={selectedTitles} onChange={setSelectedTitles} />
        {mode === "combo" && selectedTitles.length > 0 && (
          <div className="mt-3 space-y-2">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Сколько каждого нужно на 1 комбо:</div>
            {selectedTitles.map((t) => (
              <div key={t.title} className="flex items-center gap-3 rounded-xl border border-border bg-secondary/20 px-3 py-2">
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{t.title}</span>
                <input type="number" min={1} step={1} value={comboCounts[t.title] ?? "1"} onChange={(e) => setComboCounts((cur: any) => ({ ...cur, [t.title]: e.target.value }))} className="w-20 rounded-lg border border-border bg-background px-2 py-1.5 text-center text-sm outline-none focus:border-gold/50" />
                <button type="button" onClick={() => setSelectedTitles((cur: any) => cur.filter((x: any) => x.title !== t.title))} className="flex h-7 w-7 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition hover:bg-destructive/15 hover:text-destructive" title="Убрать"><X className="h-3.5 w-3.5" /></button>
              </div>
            ))}
          </div>
        )}
        {selectedTitles.length > 0 && (
          <div className="mt-2 text-[11px] text-muted-foreground">
            {mode === "combo" ? (
              <>1 комбо-сет = <span className="text-foreground">{selectedTitles.reduce((s, t) => s + Math.max(0, Math.floor(Number(comboCounts[t.title] ?? "0"))), 0)}</span> NFT ({selectedTitles.map((t) => `${t.title}×${comboCounts[t.title] ?? "1"}`).join(" + ")})</>
            ) : (
              <>Будет создано <span className="text-foreground">{selectedTitles.length}</span> {selectedTitles.length === 1 ? "дроп" : "дропов"} · всего <span className="text-foreground">{totalNftsAcrossSelection}</span> NFT под одинаковую награду.</>
            )}
          </div>
        )}
      </div>
      <div className="space-y-3 rounded-2xl border border-border/50 bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-sm font-medium"><Gift className="h-4 w-4 text-gold" /> Награда</div>
          {!useTiers && <KindToggle value={simpleKind} onChange={setSimpleKind} />}
        </div>
        {!useTiers && (
          <div className="space-y-3">
            {simpleKind === "ft" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="min-w-0">
                  <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground">Награда</label>
                  <input value={reward} onChange={(e) => setReward(e.target.value)} placeholder='"10" или "1-10"' className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm outline-none focus:border-gold/50" />
                  {reward && !rewardParsed && <div className="mt-1.5 text-[11px] text-destructive">Формат: число или диапазон</div>}
                </div>
                <div className="min-w-0">
                  <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground">Токен</label>
                  <select value={token} onChange={(e) => setToken(e.target.value)} className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm outline-none focus:border-gold/50">
                    {tokens.map((t) => <option key={t.symbol} value={t.symbol}>{t.symbol}</option>)}
                  </select>
                  <div className="mt-1.5 text-[11px] text-muted-foreground">
                    {selectedBalance ? BigInt(selectedBalance.raw) > 0n ? <>На сервисном: <span className="text-foreground">{selectedBalance.human} {token}</span></> : <span className="text-destructive">На сервисном кошельке нет {token} — пополни перед запуском дропа</span> : balanceOpen ? "Загружаем баланс…" : <button type="button" onClick={() => setBalanceOpen(true)} className="underline transition hover:text-foreground">Показать баланс сервиса</button>}
                  </div>
                </div>
              </div>
            ) : simpleKind === "nft" ? (
              <div>
                <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground">NFT-приз (title)</label>
                <TitleAutocomplete value={simpleNftTitle ? { title: simpleNftTitle, image: null, count: 0 } : null} onSelect={(sel) => setSimpleNftTitle(sel?.title ?? "")} />
                <div className="mt-1.5 text-[11px] text-muted-foreground">Нужно несколько NFT с разными шансами или микс с токенами — включи «Ярусное распределение» ниже.</div>
              </div>
            ) : simpleKind === "pack" ? (
              <div>
                <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground">Лут-бокс (пак-приз)</label>
                <PackPicker value={simplePackId} onChange={setSimplePackId} />
                <div className="mt-1.5 text-[11px] text-muted-foreground">Юзер выиграет коробку с призами — внутри NFT/FT с шансами.</div>
                <PackQtyInput value={simplePackQty} onChange={setSimplePackQty} />
              </div>
            ) : simpleKind === "custom" ? (
              <div className="space-y-3">
                <GoodsPicker itemId={simpleItem?.id ?? ""} onPick={setSimpleItem} />
                <div className="max-w-[240px]">
                  <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground">Сколько штук</label>
                  <input value={reward} onChange={(e) => setReward(e.target.value)} placeholder='"1" или "1-3"' className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm outline-none focus:border-gold/50" />
                  {reward && !rewardParsed && <div className="mt-1.5 text-[11px] text-destructive">Формат: число или диапазон</div>}
                </div>
              </div>
            ) : (
              <div className="max-w-[240px]">
                <label className="mb-1.5 flex items-center gap-1 text-xs font-medium uppercase tracking-wider text-muted-foreground"><Layers className="h-3.5 w-3.5 text-gold" /> Энергия</label>
                <input value={reward} onChange={(e) => setReward(e.target.value)} placeholder='"10" или "1-10"' className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm outline-none focus:border-gold/50" />
                {reward && !rewardParsed && <div className="mt-1.5 text-[11px] text-destructive">Формат: число или диапазон</div>}
                <div className="mt-1.5 text-[11px] text-muted-foreground">Игрок получит энергию для рейда сразу при погашении NFT.</div>
              </div>
            )}
          </div>
        )}
        <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-border/50 bg-secondary/20 p-3">
          <input type="checkbox" checked={useTiers} onChange={(e) => { const on = e.target.checked; setUseTiers(on); if (on && tiers.length === 0) setTiers([{ weight: "100", kind: "ft", rewardMin: rewardParsed ? String(rewardParsed.min) : "1", rewardMax: rewardParsed ? String(rewardParsed.max) : "10", rewardToken: token || (tokens[0]?.symbol ?? ""), nftTitle: "", packId: "", packQty: "1" }]); }} className="h-4 w-4 accent-gold" />
          <div className="flex-1">
            <div className="text-sm font-medium">Ярусное распределение</div>
            <div className="text-[11px] text-muted-foreground">{useTiers ? "Призы задаются ярусами — у каждого свой шанс." : "Несколько призов с разными шансами / диапазонами / токенами."}</div>
          </div>
        </label>
        {useTiers && <TiersEditor tiers={tiers} onChange={setTiers} tokenOptions={tokens.map((t) => t.symbol)} totalWeight={tiersTotalWeight} />}
      </div>
      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-secondary/30 p-3">
        <input type="checkbox" checked={freeClaim} onChange={(e) => setFreeClaim(e.target.checked)} className="mt-0.5 h-4 w-4 accent-gold" />
        <div className="flex flex-1 items-center gap-1.5 text-sm font-medium"><Gift className="h-3.5 w-3.5 text-gold" /> Бесплатно (без золота)</div>
      </label>
      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-secondary/30 p-3">
        <input type="checkbox" checked={recurring} onChange={(e) => setRecurring(e.target.checked)} className="mt-0.5 h-4 w-4 accent-neon" />
        <div className="flex-1">
          <div className="flex items-center gap-1.5 text-sm font-medium"><Repeat className="h-3.5 w-3.5 text-neon" /> Авто-перезапуск каждые 30 дней</div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">Дроп не завершится через 30 дней, а пересоздастся сам — юзеры клеймят награду по своим NFT заново раз в 30 дней. По умолчанию выключено.</div>
        </div>
      </label>
      {!freeClaim && (
        <div className="rounded-xl border border-border bg-secondary/30 p-3">
          <label className="flex items-center justify-between gap-3 text-sm">
            <span className="font-medium">Стоимость в золоте за {mode === "combo" ? "1 комбо-сет" : "1 клейм"}</span>
            <input type="number" min={500} step={500} value={ticketCost} placeholder="500" onChange={(e) => setTicketCost(e.target.value)} onBlur={(e) => setTicketCost(snapClaimGold(e.target.value))} className="w-20 rounded-md border border-border bg-background px-2 py-1 text-right font-mono text-sm outline-none focus:border-gold/50" />
          </label>
          <p className="mt-1.5 text-[11px] text-muted-foreground">Сколько золота спишется с игрока за один клейм, кратно 500 (300 → 500, 800 → 1000). По умолчанию 500. При стирании поля — 500.</p>
        </div>
      )}
      {selectedTitles.length > 0 && rewardParsed && selectedBalance && (
        <RequiredTokensHint rewardMax={rewardParsed.max} isRange={rewardParsed.min !== rewardParsed.max} maxTotalPool={null} maxUsers={null} totalNfts={totalNftsAcrossSelection} comboMaxSets={mode === "combo" ? (() => { let bound = Number.POSITIVE_INFINITY; for (const t of selectedTitles) { const need = Math.max(1, Math.floor(Number(comboCounts[t.title] ?? "1"))); bound = Math.min(bound, Math.floor(t.count / need)); } return Number.isFinite(bound) ? bound : 0; })() : null} freeClaim={freeClaim} token={token} balanceHuman={selectedBalance.human} balanceRaw={selectedBalance.raw} decimals={selectedBalance.decimals} />
      )}
      <button onClick={onSubmit} disabled={!canSubmit || submitting} className="inline-flex w-full items-center justify-center gap-2 rounded-xl gradient-gold px-5 py-3 text-sm font-bold text-gold-foreground shadow-gold transition hover:scale-[1.01] disabled:opacity-50 disabled:hover:scale-100">
        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        {mode === "combo" ? "Создать комбо-дроп" : selectedTitles.length > 1 ? `Создать ${selectedTitles.length} дропов` : "Создать дроп"}
      </button>
    </div>
  );
}


