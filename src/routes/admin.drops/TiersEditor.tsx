import { TitleAutocomplete } from "@/components/TitleAutocomplete";
import { KindToggle } from "./KindToggle";
import { PackPicker } from "./PackPicker";
import { PackQtyInput } from "./PackQtyInput";
import { GoodsPicker } from "./GoodsPicker";
import type { TierDraft } from "./types";

export function TiersEditor({
  tiers,
  onChange,
  tokenOptions,
  totalWeight,
}: {
  tiers: TierDraft[];
  onChange: (next: TierDraft[]) => void;
  tokenOptions: string[];
  totalWeight: number;
}) {
  const update = (idx: number, patch: Partial<(typeof tiers)[number]>) =>
    onChange(tiers.map((t, i) => (i === idx ? { ...t, ...patch } : t)));
  const remove = (idx: number) => onChange(tiers.filter((_, i) => i !== idx));
  const add = () =>
    onChange([
      ...tiers,
      { weight: "10", kind: "ft", rewardMin: "1", rewardMax: "10", rewardToken: tokenOptions[0] ?? "", nftTitle: "", packId: "", packQty: "1" },
    ]);

  return (
    <div className="space-y-2 rounded-xl border border-border bg-card p-3">
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
        <span className="font-medium text-foreground">Ярусы</span>
        <span>·</span>
        <span>сумма шансов: <span className={totalWeight > 0 ? "text-foreground" : "text-destructive"}>{totalWeight.toFixed(1)}%</span></span>
        {totalWeight > 0 && totalWeight < 100 && (
          <span className="text-[10px] text-muted-foreground">· оставшиеся {(100 - totalWeight).toFixed(1)}% → 🎉 «Молодец» (без награды)</span>
        )}
        {totalWeight > 100 && <span className="text-[10px] text-amber-300">(нормализуется на сервере к 100%)</span>}
      </div>
      <div className="space-y-2">
        {tiers.map((t, i) => {
          const w = Number(t.weight);
          const denom = Math.max(100, totalWeight);
          const pct = denom > 0 && Number.isFinite(w) && w > 0 ? Math.round((w / denom) * 1000) / 10 : 0;
          return (
            <div key={i} className="space-y-2 rounded-lg border border-border/60 bg-secondary/20 p-2.5">
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <label className="mb-0.5 block text-[10px] uppercase tracking-widest text-muted-foreground">Шанс (вес)</label>
                  <div className="flex items-center gap-2">
                    <input type="number" min={0} step="0.1" value={t.weight} onChange={(e) => update(i, { weight: e.target.value })} placeholder="вес" className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-gold/50" />
                    <span className="shrink-0 rounded-md bg-gold/10 px-2 py-1 text-[11px] font-mono text-gold">{pct.toFixed(1)}%</span>
                  </div>
                </div>
                <button type="button" onClick={() => remove(i)} className="mt-4 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-destructive/30 bg-destructive/5 text-destructive transition hover:bg-destructive/10" title="Удалить ярус">✕</button>
              </div>
              <KindToggle value={t.kind} onChange={(k) => update(i, { kind: k, rewardToken: k === "energy" || k === "custom" ? k : t.rewardToken === "energy" || t.rewardToken === "custom" ? (tokenOptions[0] ?? "") : t.rewardToken })} />
              {t.kind === "ft" ? (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="mb-0.5 block text-[10px] uppercase tracking-widest text-muted-foreground">Награда от</label>
                      <input type="number" min={0} value={t.rewardMin} onChange={(e) => update(i, { rewardMin: e.target.value })} placeholder="мин" className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-gold/50" />
                    </div>
                    <div>
                      <label className="mb-0.5 block text-[10px] uppercase tracking-widest text-muted-foreground">до</label>
                      <input type="number" min={0} value={t.rewardMax} onChange={(e) => update(i, { rewardMax: e.target.value })} placeholder="макс" className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-gold/50" />
                    </div>
                  </div>
                  <div>
                    <label className="mb-0.5 block text-[10px] uppercase tracking-widest text-muted-foreground">Токен</label>
                    {tokenOptions.length > 0 ? (
                      <select value={t.rewardToken} onChange={(e) => update(i, { rewardToken: e.target.value })} className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-gold/50">
                        {!tokenOptions.includes(t.rewardToken) && t.rewardToken && <option value={t.rewardToken}>{t.rewardToken}</option>}
                        {tokenOptions.map((sym) => <option key={sym} value={sym}>{sym}</option>)}
                      </select>
                    ) : (
                      <div className="rounded-md border border-dashed border-border bg-background px-2 py-1.5 text-xs text-muted-foreground">Загружаем токены…</div>
                    )}
                  </div>
                </>
              ) : t.kind === "energy" ? (
                <div>
                  <label className="mb-0.5 block text-[10px] uppercase tracking-widest text-muted-foreground">Энергия — количество</label>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="mb-0.5 block text-[10px] uppercase tracking-widest text-muted-foreground">от</label>
                      <input type="number" min={0} value={t.rewardMin} onChange={(e) => update(i, { rewardMin: e.target.value })} placeholder="мин" className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-gold/50" />
                    </div>
                    <div>
                      <label className="mb-0.5 block text-[10px] uppercase tracking-widest text-muted-foreground">до</label>
                      <input type="number" min={0} value={t.rewardMax} onChange={(e) => update(i, { rewardMax: e.target.value })} placeholder="макс" className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-gold/50" />
                    </div>
                  </div>
                  <div className="mt-1 text-[10px] text-muted-foreground">Начисляется мгновенно на баланс энергии при погашении — без токена и без он-чейна.</div>
                </div>
              ) : t.kind === "custom" ? (
                <div className="space-y-2">
                  <GoodsPicker itemId={t.itemId ?? ""} onPick={(g) => update(i, { itemId: g.id, itemName: g.name, itemImage: g.image })} />
                  <div className="grid grid-cols-2 gap-2">
                    <input type="number" min={1} value={t.rewardMin} onChange={(e) => update(i, { rewardMin: e.target.value })} placeholder="от" className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-gold/50" />
                    <input type="number" min={1} value={t.rewardMax} onChange={(e) => update(i, { rewardMax: e.target.value })} placeholder="до" className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-gold/50" />
                  </div>
                </div>
              ) : t.kind === "nft" ? (
                <div>
                  <label className="mb-0.5 block text-[10px] uppercase tracking-widest text-muted-foreground">NFT-title (приз)</label>
                  <TitleAutocomplete value={t.nftTitle ? { title: t.nftTitle, image: null, count: 0 } : null} onSelect={(sel) => update(i, { nftTitle: sel?.title ?? "" })} />
                  <div className="mt-1 text-[10px] text-muted-foreground">NFT с этим title должны заранее лежать на darai_gdrop.near. При выпадении выдаётся свободный token_id.</div>
                </div>
              ) : (
                <div>
                  <label className="mb-0.5 block text-[10px] uppercase tracking-widest text-muted-foreground">Пак (loot-box)</label>
                  <PackPicker value={t.packId} onChange={(id) => update(i, { packId: id })} />
                  <div className="mt-1 text-[10px] text-muted-foreground">Юзер получит коробку с призами; откроет её в инвентаре.</div>
                  <PackQtyInput value={t.packQty} onChange={(v) => update(i, { packQty: v })} />
                </div>
              )}
            </div>
          );
        })}
      </div>
      <button type="button" onClick={add} className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-gold/30 bg-gold/5 px-3 py-2 text-xs font-medium text-gold transition hover:bg-gold/10">
        + Добавить ярус
      </button>
    </div>
  );
}
