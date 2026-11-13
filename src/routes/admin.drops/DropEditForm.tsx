import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Loader2, Gift, Repeat } from "lucide-react";
import { updateDropEvent } from "@/server/api/admin-campaigns-manage";
import { adminListPacks } from "@/server/api/packs";
import { adminListChipPacks } from "@/server/api/chips-admin";
import { TitleAutocomplete } from "@/components/TitleAutocomplete";
import { parseRewardSpec, formatRewardSpec, parsePackQty } from "./helpers";
import { PackQtyInput } from "./PackQtyInput";
import { cn } from "@/lib/utils";
import type { DropEvent } from "./types";
import { humanError } from "@/lib/humanError";
import { goldFromTicketCost, snapClaimGold, ticketCostFromGold } from "./goldCost";

export function DropEditForm({
  drop,
  tokens,
  onClose,
}: {
  drop: DropEvent;
  tokens: Array<{ symbol: string; ftContract: string; decimals: number }>;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const currentTier = (drop.rewardTiers ?? []).find(
    (t) => (t as { kind?: string }).kind === "nft" || (t as { kind?: string }).kind === "pack"
  ) as { kind?: string; nftTitle?: string; packId?: string; packQty?: number } | undefined;
  // Энергию, товар и ярусы эта форма не правит: награду оставляем как есть, правим остальное
  // (раньше сохранение превращало такой дроп в токенный и стирало ярусы).
  const tierKinds = (drop.rewardTiers ?? []).map((t) => (t as { kind?: string }).kind ?? "ft");
  const keepReward = tierKinds.length > 1 || tierKinds.some((k) => k === "energy" || k === "custom");
  const initialKind: "ft" | "nft" | "pack" = currentTier?.kind === "nft" ? "nft" : currentTier?.kind === "pack" ? "pack" : "ft";
  const [kind, setKind] = useState<"ft" | "nft" | "pack">(initialKind);
  const [reward, setReward] = useState(formatRewardSpec(drop.rewardMin, drop.rewardMax));
  const [token, setToken] = useState(drop.rewardToken);
  const [nftTitle, setNftTitle] = useState(currentTier?.nftTitle ?? "");
  const [packId, setPackId] = useState(currentTier?.packId ?? "");
  const [packQty, setPackQty] = useState(String(parsePackQty(currentTier?.packQty)));
  const [freeClaim, setFreeClaim] = useState(drop.freeClaim);
  const [recurring, setRecurring] = useState(drop.recurring);
  // Поле — золото; в базе ticket_cost в билетах (×500, ПРАВИЛА §8.61).
  const [ticketCost, setTicketCost] = useState(String(goldFromTicketCost(drop.ticketCost)));

  const packs = useQuery({ queryKey: ["admin-packs-active"], queryFn: () => adminListPacks({ data: { activeOnly: true } }), enabled: kind === "pack" });
  const chipPacks = useQuery({ queryKey: ["admin-chip-packs-all"], queryFn: () => adminListChipPacks(), enabled: kind === "pack" });

  const update = useMutation({
    mutationFn: updateDropEvent,
    onSuccess: () => { toast.success("Дроп обновлён"); qc.invalidateQueries({ queryKey: ["admin", "drops"] }); onClose(); },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  const rewardParsed = parseRewardSpec(reward);

  const onSave = () => {
    if (keepReward) {
      update.mutate({ data: { id: drop.id, rewardMin: drop.rewardMin, rewardMax: drop.rewardMax, rewardToken: drop.rewardToken, rewardTiers: drop.rewardTiers ?? null, maxTotalPool: drop.maxTotalPool ?? null, maxUsers: drop.maxUsers ?? null, freeClaim, recurring, ticketCost: freeClaim ? 1 : ticketCostFromGold(ticketCost) } });
      return;
    }
    if (kind === "nft" && !nftTitle.trim()) { toast.error("Укажи NFT-приз"); return; }
    if (kind === "pack" && !packId.trim()) { toast.error("Выбери пак"); return; }
    if (kind === "ft" && !rewardParsed) { toast.error('Награда: "10" или "1-10"'); return; }
    let rewardTiers: Array<{ weight: number; kind: "ft" | "nft" | "pack"; rewardMin: number; rewardMax: number; rewardToken: string; nftTitle: string; packId: string; packQty?: number }> | null = null;
    if (kind === "nft") {
      rewardTiers = [{ weight: 100, kind: "nft", rewardMin: 0, rewardMax: 0, rewardToken: token, nftTitle: nftTitle.trim(), packId: "" }];
    } else if (kind === "pack") {
      rewardTiers = [{ weight: 100, kind: "pack", rewardMin: 0, rewardMax: 0, rewardToken: token, nftTitle: "", packId: packId.trim(), packQty: parsePackQty(packQty) }];
    }
    update.mutate({
      data: {
        id: drop.id,
        rewardMin: kind === "ft" ? rewardParsed!.min : 0,
        rewardMax: kind === "ft" ? rewardParsed!.max : 0,
        rewardToken: token,
        rewardTiers,
        maxTotalPool: drop.maxTotalPool ?? null,
        maxUsers: drop.maxUsers ?? null,
        freeClaim,
        recurring,
        ticketCost: freeClaim ? 1 : ticketCostFromGold(ticketCost),
      },
    });
  };

  return (
    <div className="mt-4 space-y-4 rounded-2xl border border-gold/20 bg-gold/5 p-4">
      {!keepReward && (<>
      <div>
        <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground">Тип приза</label>
        <div className="inline-flex rounded-full border border-border bg-background p-1">
          {([{ v: "ft", label: "💰 Токен" }, { v: "nft", label: "🎁 NFT" }, { v: "pack", label: "📦 Пак" }] as Array<{ v: "ft" | "nft" | "pack"; label: string }>).map((o) => (
            <button key={o.v} type="button" onClick={() => setKind(o.v)} className={cn("rounded-full px-3 py-1.5 text-xs font-medium transition", kind === o.v ? "gradient-gold text-gold-foreground" : "text-muted-foreground hover:text-foreground")}>
              {o.label}
            </button>
          ))}
        </div>
      </div>
      {kind === "ft" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="min-w-0">
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground">Награда</label>
            <input value={reward} onChange={(e) => setReward(e.target.value)} placeholder="10 или 1-10" className="w-full rounded-xl border border-border bg-background px-4 py-2 text-sm outline-none focus:border-gold/50" />
          </div>
          <div className="min-w-0">
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground">Токен</label>
            <select value={token} onChange={(e) => setToken(e.target.value)} className="w-full rounded-xl border border-border bg-background px-4 py-2 text-sm outline-none focus:border-gold/50">
              {tokens.map((t) => <option key={t.symbol} value={t.symbol}>{t.symbol}</option>)}
            </select>
          </div>
        </div>
      )}
      {kind === "nft" && (
        <div>
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground">NFT-приз (title)</label>
          <TitleAutocomplete value={nftTitle ? { title: nftTitle, image: null, count: 0 } : null} onSelect={(sel) => setNftTitle(sel?.title ?? "")} />
          <p className="mt-1 text-[11px] text-muted-foreground">Поиск по коллекции. NFT с этим title должен быть на нашем призовом коше.</p>
        </div>
      )}
      {kind === "pack" && (
        <div>
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground">Пак</label>
          <select value={packId} onChange={(e) => setPackId(e.target.value)} className="w-full rounded-xl border border-border bg-background px-4 py-2 text-sm outline-none focus:border-gold/50">
            <option value="">— выбери пак —</option>
            {(chipPacks.data ?? []).filter((p) => p.active && (!p.exhausted || p.id === packId)).length > 0 && (
              <optgroup label="🃏 Чип-паки (Фишки)">
                {(chipPacks.data ?? []).filter((p) => p.active && (!p.exhausted || p.id === packId)).map((p) => (
                  <option key={p.id} value={p.id}>{p.exhausted ? `${p.name} (исчерпан)` : p.name} ({p.id})</option>
                ))}
              </optgroup>
            )}
            {(packs.data ?? []).length > 0 && (
              <optgroup label="📦 NFT-паки">
                {(packs.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.name} ({p.id})</option>)}
              </optgroup>
            )}
          </select>
          <PackQtyInput value={packQty} onChange={setPackQty} />
        </div>
      )}
      </>)}
      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-background/40 p-3">
        <input type="checkbox" checked={freeClaim} onChange={(e) => setFreeClaim(e.target.checked)} className="mt-0.5 h-4 w-4 accent-gold" />
        <div className="flex-1">
          <div className="flex items-center gap-1.5 text-sm font-medium"><Gift className="h-3.5 w-3.5 text-gold" /> Free клейм</div>
          <div className="text-[11px] text-muted-foreground">Можно погашать без золота и не расходовать его.</div>
        </div>
      </label>
      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-background/40 p-3">
        <input type="checkbox" checked={recurring} onChange={(e) => setRecurring(e.target.checked)} className="mt-0.5 h-4 w-4 accent-neon" />
        <div className="flex-1">
          <div className="flex items-center gap-1.5 text-sm font-medium"><Repeat className="h-3.5 w-3.5 text-neon" /> Авто-перезапуск каждые 30 дней</div>
          <div className="text-[11px] text-muted-foreground">Дроп пересоздаётся сам через 30 дней — клейм по NFT раз в 30 дней.</div>
        </div>
      </label>
      {!freeClaim && (
        <div className="rounded-xl border border-border bg-background/40 p-3">
          <label className="flex items-center justify-between gap-3 text-sm">
            <span className="font-medium">Стоимость в золоте за {drop.mode === "combo" ? "1 комбо-сет" : "1 клейм"}</span>
            <input type="number" min={500} step={500} value={ticketCost} placeholder="500" onChange={(e) => setTicketCost(e.target.value)} onBlur={(e) => setTicketCost(snapClaimGold(e.target.value))} className="w-20 rounded-md border border-border bg-background px-2 py-1 text-right font-mono text-sm outline-none focus:border-gold/50" />
          </label>
          <p className="mt-1.5 text-[11px] text-muted-foreground">Кратно 500 золота (300 → 500, 800 → 1000). По умолчанию 500. При стирании поля сохранится 500.</p>
        </div>
      )}
      <div className="flex items-center justify-end gap-2">
        <button onClick={onClose} disabled={update.isPending} className="rounded-lg border border-border bg-secondary/40 px-4 py-2 text-xs font-medium text-muted-foreground transition hover:bg-secondary hover:text-foreground disabled:opacity-50">
          Отмена
        </button>
        <button onClick={onSave} disabled={update.isPending || (kind === "ft" && !rewardParsed) || (kind === "nft" && !nftTitle.trim()) || (kind === "pack" && !packId.trim())} className="inline-flex items-center gap-2 rounded-lg gradient-gold px-4 py-2 text-xs font-bold text-gold-foreground shadow-gold transition hover:scale-[1.02] disabled:opacity-50">
          {update.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          Сохранить
        </button>
      </div>
    </div>
  );
}
