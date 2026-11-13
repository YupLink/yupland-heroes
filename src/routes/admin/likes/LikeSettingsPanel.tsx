import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Loader2, Plus, Trash2, Heart, ThumbsUp, Bell,
  ShoppingCart, Ticket, Tag, Target,
} from "lucide-react";
import {
  adminCreateLikePromocode, adminCreateLikeShopOffer,
  adminDeleteLikePromocode, adminDeleteLikeShopOffer,
  adminGetLikeSettings, adminListLikePromocodes,
  adminListLikeShopOffers, adminToggleLikePromocode,
  adminUpdateLikeShopOffer, adminUpdateLikeSettings,
} from "@/server/api/likes";
import { cn } from "@/lib/utils";
import { humanError } from "@/lib/humanError";
import { TICKET_SPEND_GOLD, goldForTicketPrice } from "@/lib/ticketGold";

// Цена пакета лайков — в ЗОЛОТЕ (ПРАВИЛА §8.61); в базе прежнее tickets = золото / 500, целое.
const toTickets = (gold: number) => Math.max(1, Math.round(gold / TICKET_SPEND_GOLD));

export function SettingsPanel({ initial, onSaved }: { initial: Awaited<ReturnType<typeof adminGetLikeSettings>>; onSaved: () => void }) {
  const [s, setS] = useState(initial);
  const [tab, setTab] = useState<"shop" | "packages" | "promocodes" | "formula">("shop");
  const save = useMutation({
    mutationFn: () => adminUpdateLikeSettings({ data: s }),
    onSuccess: () => { toast.success("Сохранено — формула применится к новым кандидатам"); onSaved(); },
    onError: (e: Error) => toast.error(humanError(e)),
  });
  const previewSizes = [1, 5, 10, 50, 100];
  const previewTargets = s.targetFormula === "fixed" ? previewSizes.map(() => s.targetFixed) : previewSizes.map((n) => Math.max(1, s.targetBaseMin + n * s.targetPerNft));

  return (
    <div className="space-y-3 rounded-2xl border border-border/50 bg-card p-4">
      <div className="inline-flex flex-wrap gap-1 rounded-lg border border-border bg-secondary/40 p-1">
        {([{ v: "shop", label: "Магазин", icon: ShoppingCart }, { v: "packages", label: "Пакеты", icon: Ticket }, { v: "promocodes", label: "Промокоды", icon: Tag }, { v: "formula", label: "Цель", icon: Target }] as Array<{ v: typeof tab; label: string; icon: typeof Heart }>).map((t) => (
          <button key={t.v} type="button" onClick={() => setTab(t.v)} className={cn("inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition", tab === t.v ? "bg-rose-500/15 text-rose-300" : "text-muted-foreground hover:text-foreground")}><t.icon className="h-3.5 w-3.5" /> {t.label}</button>
        ))}
      </div>
      {tab === "shop" && (
        <div className="space-y-3">
          <div className="text-[11px] text-muted-foreground">Пополнение и кап запаса лайков юзера.</div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Лайков в сутки" value={s.dailyGrant} onChange={(v) => setS((p) => ({ ...p, dailyGrant: v }))} hint="Бесплатно начисляется" />
            <Field label="Кап запаса" value={s.dailyMaxPool} onChange={(v) => setS((p) => ({ ...p, dailyMaxPool: v }))} hint="Макс. у юзера" />
          </div>
        </div>
      )}
      {tab === "packages" && <PackagesPanel />}
      {tab === "promocodes" && <PromocodesPanel />}
      {tab === "formula" && (
        <div className="space-y-3">
          <div className="text-[11px] text-muted-foreground">Сколько лайков нужно NFT для запуска дропа.</div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setS((p) => ({ ...p, targetFormula: "auto" }))} className={cn("flex-1 rounded-md border px-2 py-2 text-xs transition", s.targetFormula === "auto" ? "border-rose-400/50 bg-rose-500/15 text-rose-300" : "border-border bg-secondary/30 text-muted-foreground")}>По размеру коллекции</button>
            <button type="button" onClick={() => setS((p) => ({ ...p, targetFormula: "fixed" }))} className={cn("flex-1 rounded-md border px-2 py-2 text-xs transition", s.targetFormula === "fixed" ? "border-rose-400/50 bg-rose-500/15 text-rose-300" : "border-border bg-secondary/30 text-muted-foreground")}>Фиксированное</button>
          </div>
          {s.targetFormula === "auto" ? (
            <>
              <div className="rounded-lg border border-rose-400/20 bg-rose-500/5 p-3 font-mono text-xs text-rose-300">цель = константа + кол-во NFT × лайков/NFT</div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Константа (мин)" value={s.targetBaseMin} onChange={(v) => setS((p) => ({ ...p, targetBaseMin: v }))} hint="напр. 10" />
                <Field label="Лайков на NFT" value={s.targetPerNft} onChange={(v) => setS((p) => ({ ...p, targetPerNft: v }))} hint="напр. 2" />
              </div>
              <div className="rounded-lg border border-border bg-background p-3">
                <div className="mb-1.5 text-[10px] uppercase tracking-widest text-muted-foreground">Превью</div>
                <div className="grid grid-cols-5 gap-1 text-center">
                  {previewSizes.map((sz, i) => (
                    <div key={sz} className="rounded-md bg-secondary/40 p-2">
                      <div className="text-[10px] text-muted-foreground">{sz} NFT</div>
                      <div className="inline-flex items-center justify-center gap-1 font-mono text-xs font-bold text-rose-300"><ThumbsUp className="h-3 w-3" /> {previewTargets[i]}</div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <Field label="Фиксированная цель" value={s.targetFixed} onChange={(v) => setS((p) => ({ ...p, targetFixed: v }))} hint="Одно число для всех NFT" />
          )}
        </div>
      )}
      <label className="flex items-center gap-2 border-t border-border/40 pt-3 text-xs">
        <input type="checkbox" checked={s.adminNotifyReady} onChange={(e) => setS((p) => ({ ...p, adminNotifyReady: e.target.checked }))} />
        <Bell className="h-3.5 w-3.5 text-muted-foreground" /> Уведомлять админов в TG, когда кандидат готов
      </label>
      <button onClick={() => save.mutate()} disabled={save.isPending} className="w-full rounded-lg gradient-gold px-4 py-2 text-sm font-bold text-gold-foreground disabled:opacity-50">{save.isPending ? "Сохраняю…" : "Сохранить"}</button>
    </div>
  );
}

function PackagesPanel() {
  const qc = useQueryClient();
  const offers = useQuery({ queryKey: ["admin-like-offers"], queryFn: () => adminListLikeShopOffers() });
  const [draft, setDraft] = useState({ gold: TICKET_SPEND_GOLD, likes: 1, priceStars: 0, sortOrder: 99 });
  const create = useMutation({
    mutationFn: () => adminCreateLikeShopOffer({ data: { tickets: toTickets(draft.gold), likes: draft.likes, sortOrder: draft.sortOrder, priceStars: draft.priceStars > 0 ? draft.priceStars : null } }),
    onSuccess: () => { toast.success("Пакет добавлен"); qc.invalidateQueries({ queryKey: ["admin-like-offers"] }); setDraft({ gold: TICKET_SPEND_GOLD, likes: 1, priceStars: 0, sortOrder: 99 }); },
    onError: (e: Error) => toast.error(humanError(e)),
  });
  const update = useMutation({
    mutationFn: (args: { id: string; tickets?: number; likes?: number; priceStars?: number | null; sortOrder?: number; active?: boolean }) => adminUpdateLikeShopOffer({ data: args }),
    onSuccess: () => { toast.success("Пакет обновлён"); qc.invalidateQueries({ queryKey: ["admin-like-offers"] }); },
    onError: (e: Error) => toast.error(humanError(e)),
  });
  const del = useMutation({
    mutationFn: (id: string) => adminDeleteLikeShopOffer({ data: { id } }),
    onSuccess: () => { toast.success("Пакет удалён"); qc.invalidateQueries({ queryKey: ["admin-like-offers"] }); },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  return (
    <div className="space-y-3">
      <div className="text-[11px] text-muted-foreground">Обмен золота на лайки (цена кратна {TICKET_SPEND_GOLD}). Большие пакеты — выгоднее.</div>
      <div className="space-y-2">
        {(offers.data ?? []).map((o) => (
          <PackageRow key={o.id} offer={o} onSave={(patch) => update.mutate({ id: o.id, ...patch })} onDelete={() => { if (confirm(`Удалить пакет ${goldForTicketPrice(o.tickets)} золота → ${o.likes} лайков?`)) del.mutate(o.id); }} saving={update.isPending && update.variables?.id === o.id} deleting={del.isPending && del.variables === o.id} />
        ))}
        {(offers.data ?? []).length === 0 && <div className="rounded-xl border border-dashed border-border/60 bg-secondary/20 p-4 text-center text-xs text-muted-foreground">Пока нет пакетов.</div>}
      </div>
      <div className="space-y-2 rounded-xl border border-gold/30 bg-gold/5 p-3">
        <div className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-muted-foreground"><Plus className="h-3 w-3" /> Пакет</div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Золота" value={draft.gold} onChange={(v) => setDraft((p) => ({ ...p, gold: v }))} hint={`кратно ${TICKET_SPEND_GOLD}`} />
          <Field label="Лайков" value={draft.likes} onChange={(v) => setDraft((p) => ({ ...p, likes: v }))} />
          <Field label="★ звёзды" value={draft.priceStars} onChange={(v) => setDraft((p) => ({ ...p, priceStars: v }))} hint="0 = не за звёзды" />
          <Field label="Сортировка" value={draft.sortOrder} onChange={(v) => setDraft((p) => ({ ...p, sortOrder: v }))} hint="Меньше = выше" />
        </div>
        <button onClick={() => create.mutate()} disabled={create.isPending} className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-rose-500 px-4 py-1.5 text-xs font-bold text-white disabled:opacity-50"><Plus className="h-3.5 w-3.5" /> {create.isPending ? "Добавляю…" : "Добавить пакет"}</button>
      </div>
    </div>
  );
}

function PackageRow({ offer, onSave, onDelete, saving, deleting }: { offer: Awaited<ReturnType<typeof adminListLikeShopOffers>>[number]; onSave: (patch: { tickets?: number; likes?: number; priceStars?: number | null; sortOrder?: number; active?: boolean }) => void; onDelete: () => void; saving: boolean; deleting: boolean }) {
  const [gold, setGold] = useState(goldForTicketPrice(offer.tickets));
  const [likes, setLikes] = useState(offer.likes);
  const [priceStars, setPriceStars] = useState(offer.priceStars ?? 0);
  const [sortOrder, setSortOrder] = useState(offer.sortOrder);
  const dirty = toTickets(gold) !== offer.tickets || likes !== offer.likes || priceStars !== (offer.priceStars ?? 0) || sortOrder !== offer.sortOrder;
  return (
    <div className={cn("rounded-2xl border border-border/50 bg-card p-3 transition hover:border-border/80", !offer.active && "opacity-60")}>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Золота" value={gold} onChange={setGold} hint={`кратно ${TICKET_SPEND_GOLD}`} />
        <Field label="Лайков" value={likes} onChange={setLikes} />
        <Field label="★ звёзды" value={priceStars} onChange={setPriceStars} hint="0 = нет" />
        <Field label="Сортировка" value={sortOrder} onChange={setSortOrder} />
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <label className="flex items-center gap-1.5 text-[11px]"><input type="checkbox" checked={offer.active} onChange={(e) => onSave({ active: e.target.checked })} /> Активен</label>
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={onDelete} disabled={deleting} className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border/50 bg-secondary/40 text-muted-foreground transition hover:border-rose-500/40 hover:text-rose-400 disabled:opacity-50" title="Удалить пакет" aria-label="Удалить пакет"><Trash2 className="h-4 w-4" /></button>
          <button type="button" onClick={() => onSave({ tickets: toTickets(gold), likes, priceStars: priceStars > 0 ? priceStars : null, sortOrder })} disabled={!dirty || saving} className="rounded-lg bg-gold px-3 py-2 text-xs font-bold text-gold-foreground transition disabled:opacity-40">{saving ? "…" : "Сохранить"}</button>
        </div>
      </div>
    </div>
  );
}

function PromocodesPanel() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["admin-like-promocodes"], queryFn: () => adminListLikePromocodes() });
  const [code, setCode] = useState("");
  const [rewardSpec, setRewardSpec] = useState("1");
  const [limitType, setLimitType] = useState<"budget" | "uses">("uses");
  const [totalBudget, setTotalBudget] = useState("100");
  const [maxUses, setMaxUses] = useState("100");
  const clampLimit = (t: string) => Math.max(1, Math.floor(Number(t)) || 1);
  const parsed = (() => {
    const s = rewardSpec.trim();
    if (!s) return null;
    const range = s.match(/^(\d+)\s*-\s*(\d+)$/);
    if (range) { const min = Number(range[1]); const max = Number(range[2]); if (!Number.isFinite(min) || !Number.isFinite(max) || min < 1 || max < min) return null; return { min, max }; }
    const fixed = s.match(/^(\d+)$/);
    if (fixed) { const n = Number(fixed[1]); if (!Number.isFinite(n) || n < 1) return null; return { min: n, max: n }; }
    return null;
  })();
  const create = useMutation({
    mutationFn: () => { if (!parsed) throw new Error('Награда: "10" или "1-10"'); return adminCreateLikePromocode({ data: { code, rewardMin: parsed.min, rewardMax: parsed.max, limitType, totalBudget: limitType === "budget" ? clampLimit(totalBudget) : undefined, maxUses: limitType === "uses" ? clampLimit(maxUses) : undefined } }); },
    onSuccess: (res) => { toast.success(`Промокод ${res.code} создан`); qc.invalidateQueries({ queryKey: ["admin-like-promocodes"] }); setCode(""); },
    onError: (e: Error) => toast.error(humanError(e)),
  });
  const toggle = useMutation({ mutationFn: (args: { id: string; active: boolean }) => adminToggleLikePromocode({ data: args }), onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-like-promocodes"] }), onError: (e: Error) => toast.error(humanError(e)) });
  const del = useMutation({ mutationFn: (id: string) => adminDeleteLikePromocode({ data: { id } }), onSuccess: () => { toast.success("Промокод удалён"); qc.invalidateQueries({ queryKey: ["admin-like-promocodes"] }); }, onError: (e: Error) => toast.error(humanError(e)) });

  return (
    <div className="space-y-3">
      <div className="text-[11px] text-muted-foreground">Коды для раздачи лайков. Один аккаунт — одна активация.</div>
      <div className="space-y-3 rounded-2xl border border-rose-400/30 bg-rose-500/5 p-3">
        <div className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-muted-foreground"><Tag className="h-3 w-3" /> Новый промокод</div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className="mb-1 block text-[10px] uppercase tracking-widest text-muted-foreground">Код</label><input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="WELCOME2026" maxLength={64} className="w-full rounded-md border border-border bg-background px-2 py-1.5 font-mono text-sm uppercase outline-none focus:border-rose-400/50" /></div>
          <div><label className="mb-1 block text-[10px] uppercase tracking-widest text-muted-foreground">Награда (число или диапазон)</label><input value={rewardSpec} onChange={(e) => setRewardSpec(e.target.value)} placeholder='"10" или "1-10"' className="h-9 w-full rounded-md border border-border bg-background px-2 font-mono text-sm outline-none focus:border-rose-400/50" /><div className="mt-0.5 text-[10px] text-muted-foreground">{parsed ? parsed.min === parsed.max ? `ровно ${parsed.min} за активацию` : `случайно ${parsed.min}–${parsed.max} за активацию` : rewardSpec ? <span className="text-destructive">формат: число или диапазон</span> : "число или диапазон через дефис"}</div></div>
        </div>
        <div>
          <label className="mb-1 block text-[10px] uppercase tracking-widest text-muted-foreground">Лимит</label>
          <div className="flex gap-2">
            <button type="button" onClick={() => setLimitType("uses")} className={cn("flex-1 rounded-md border px-2 py-2 text-xs transition", limitType === "uses" ? "border-rose-400/50 bg-rose-500/15 text-rose-300" : "border-border bg-secondary/30 text-muted-foreground")}>По активациям</button>
            <button type="button" onClick={() => setLimitType("budget")} className={cn("flex-1 rounded-md border px-2 py-2 text-xs transition", limitType === "budget" ? "border-rose-400/50 bg-rose-500/15 text-rose-300" : "border-border bg-secondary/30 text-muted-foreground")}>По объёму</button>
          </div>
          {limitType === "uses" ? <div className="mt-2"><input type="number" min={1} value={maxUses} onChange={(e) => setMaxUses(e.target.value)} onBlur={() => setMaxUses(String(clampLimit(maxUses)))} className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm outline-none focus:border-rose-400/50" /><div className="mt-0.5 text-[10px] text-muted-foreground">Сколько раз можно активировать</div></div>
          : <div className="mt-2"><input type="number" min={1} value={totalBudget} onChange={(e) => setTotalBudget(e.target.value)} onBlur={() => setTotalBudget(String(clampLimit(totalBudget)))} className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm outline-none focus:border-rose-400/50" /><div className="mt-0.5 text-[10px] text-muted-foreground">Общий объём лайков (не выдадим больше)</div></div>}
        </div>
        <button onClick={() => { if (!code.trim()) { toast.error("Укажи код"); return; } if (!parsed) { toast.error('Награда: "10" или "1-10"'); return; } create.mutate(); }} disabled={create.isPending || !parsed || !code.trim()} className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-rose-500 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"><Plus className="h-4 w-4" /> {create.isPending ? "Создаю…" : "Создать промокод"}</button>
      </div>
      <div className="space-y-2">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">История</div>
        {list.isLoading ? <div className="rounded-xl border border-border/50 bg-card p-4 text-center text-sm text-muted-foreground"><Loader2 className="mr-2 inline h-3 w-3 animate-spin" /> Загружаем…</div>
        : (list.data ?? []).length === 0 ? <div className="rounded-xl border border-dashed border-border/60 bg-secondary/20 p-4 text-center text-xs text-muted-foreground">Пока нет промокодов.</div>
        : (list.data ?? []).map((p) => (
          <div key={p.id} className={cn("rounded-2xl border border-border/50 bg-card p-3 transition hover:border-border/80", !p.active && "opacity-60")}>
            <div className="flex flex-wrap items-center gap-2">
              <code className="rounded-lg bg-rose-500/15 px-2 py-1 font-mono text-sm font-bold text-rose-300">{p.code}</code>
              <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-2 py-0.5 text-xs font-medium text-rose-300" title="Награда за активацию"><ThumbsUp className="h-3 w-3" /> {p.rewardMin === p.rewardMax ? p.rewardMin : `${p.rewardMin}-${p.rewardMax}`}</span>
              <span className="text-[11px] text-muted-foreground">{p.limitType === "uses" ? `${p.usedCount} / ${p.maxUses} активаций` : `${p.usedBudget} / ${p.totalBudget} лайков · ${p.usedCount} акт.`}</span>
              <div className="ml-auto flex items-center gap-1.5">
                <button type="button" onClick={() => toggle.mutate({ id: p.id, active: !p.active })} className={cn("rounded-full border px-2.5 py-1 text-[11px] font-medium transition", p.active ? "border-border/50 bg-secondary/40 text-muted-foreground hover:bg-secondary hover:text-foreground" : "border-success/40 bg-success/10 text-success hover:bg-success/20")} title={p.active ? "Отключить промокод" : "Включить промокод"}>{p.active ? "Отключить" : "Включить"}</button>
                <button type="button" onClick={() => { if (confirm(`Удалить промокод ${p.code} и его активации?`)) del.mutate(p.id); }} className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border/50 bg-secondary/40 text-muted-foreground transition hover:border-rose-500/40 hover:text-rose-400" title="Удалить промокод" aria-label="Удалить промокод"><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Field({ label, value, onChange, hint }: { label: string; value: number; onChange: (v: number) => void; hint?: string }) {
  const [raw, setRaw] = useState(String(value));
  useEffect(() => { if ((Math.floor(Number(raw)) || 0) !== value) setRaw(String(value)); }, [value]);
  const clamp = (t: string) => Math.max(0, Math.floor(Number(t)) || 0);
  return (
    <div>
      <label className="mb-1 block text-[10px] uppercase tracking-widest text-muted-foreground">{label}</label>
      <input type="number" min={0} value={raw} onChange={(e) => { setRaw(e.target.value); onChange(clamp(e.target.value)); }} onBlur={() => setRaw(String(clamp(raw)))} className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-gold/50" />
      {hint && <div className="mt-0.5 text-[9px] text-muted-foreground">{hint}</div>}
    </div>
  );
}
