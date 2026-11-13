// АДМИН: энерго-паки магазина (покупка энергии за золото/DARAI/звёзды; цены — EnergyLadderEditor).
// Килсвич «показать всем», список паков + inline-форма создания/редактирования,
// удаление. Пока килсвич OFF — паки видны только админам (тест). См. energyPacks.ts.
import { useState } from "react";
import { EnergyPackForm } from "./EnergyPackForm";
import { parsePricing, type OfferPricing } from "@/lib/energySteps";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Zap, Plus, Trash2, Eye, EyeOff } from "lucide-react";
import { EnergyPackPriceLine } from "./EnergyPackPriceLine";
import { cn } from "@/lib/utils";
import {
  adminListEnergyPacks,
  adminUpsertEnergyPack,
  adminDeleteEnergyPack,
  adminGetEnergyShopEnabled,
  adminSetEnergyShopEnabled,
} from "@/server/api/energyPacks";
import { listRewardTokens } from "@/server/api/admin-payouts";
import { humanError } from "@/lib/humanError";

type Draft = {
  id?: string;
  /** Лестница цен; пустая — у пака обычные одиночные цены. */
  pricing: OfferPricing;
  title: string;
  amount: string;
  priceTickets: string;
  priceDarai: string;
  priceTokenSymbol: string;
  priceTokenAmount: string;
  dailyLimit: string;
  active: boolean;
  sortOrder: string;
};
const EMPTY: Draft = {
  pricing: [],
  title: "",
  amount: "10",
  priceTickets: "",
  priceDarai: "",
  priceTokenSymbol: "",
  priceTokenAmount: "",
  dailyLimit: "1",
  active: true,
  sortOrder: "0",
};
const numOrNull = (s: string): number | null => {
  const t = s.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

export function EnergyPacksAdminPanel() {
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: ["admin", "energy-packs"],
    queryFn: () => adminListEnergyPacks(),
  });
  const shop = useQuery({
    queryKey: ["admin", "energy-shop-enabled"],
    queryFn: () => adminGetEnergyShopEnabled(),
  });
  // Токены экосистемы для селектора цены (кроме DARAI — у него своё поле).
  const tokensQ = useQuery({
    queryKey: ["admin", "reward-tokens"],
    queryFn: () => listRewardTokens(),
  });
  const tokens = (tokensQ.data ?? []).filter((t) => !/darai/i.test(t.symbol));
  const [draft, setDraft] = useState<Draft | null>(null);

  const toggleShop = useMutation({
    mutationFn: (enabled: boolean) => adminSetEnergyShopEnabled({ data: { enabled } }),
    onSuccess: (r) => {
      toast.success(r.enabled ? "Энерго-паки видны ВСЕМ" : "Энерго-паки видны только админам");
      qc.invalidateQueries({ queryKey: ["admin", "energy-shop-enabled"] });
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  const save = useMutation({
    mutationFn: (d: Draft) =>
      adminUpsertEnergyPack({
        data: {
          ...(d.id ? { id: d.id } : {}),
          title: d.title,
          amount: Math.max(1, Math.floor(Number(d.amount) || 1)),
          priceTickets: numOrNull(d.priceTickets),
          priceDarai: numOrNull(d.priceDarai),
          priceTokenSymbol: d.priceTokenSymbol || null,
          priceTokenAmount: d.priceTokenSymbol ? numOrNull(d.priceTokenAmount) : null,
          dailyLimit: Math.max(0, Math.floor(Number(d.dailyLimit) || 0)),
          priceSteps: d.pricing.length > 0 ? d.pricing : null,
          active: d.active,
          sortOrder: Math.floor(Number(d.sortOrder) || 0),
        },
      }),
    onSuccess: () => {
      toast.success("Сохранено");
      setDraft(null);
      qc.invalidateQueries({ queryKey: ["admin", "energy-packs"] });
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  const del = useMutation({
    mutationFn: (id: string) => adminDeleteEnergyPack({ data: { id } }),
    onSuccess: () => {
      toast.success("Удалено");
      qc.invalidateQueries({ queryKey: ["admin", "energy-packs"] });
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  const packs = list.data ?? [];
  const enabled = shop.data?.enabled ?? false;

  // Форма создания/редактирования. Рендерится ПО МЕСТУ: при редактировании —
  // прямо под своим паком; при создании нового — в конце списка.
  const formNode = draft ? (
    <EnergyPackForm
      draft={draft}
      setDraft={setDraft}
      tokens={tokens}
      onCancel={() => setDraft(null)}
      onSave={() => save.mutate(draft)}
      saving={save.isPending}
    />
  ) : null;

  return (
    <div className="space-y-4">
      {/* Killswitch */}
      <div className="flex items-center justify-between rounded-2xl border border-border bg-card p-3.5">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-500/10 text-rose-400">
            <Zap className="h-4 w-4" />
          </span>
          <div>
            <div className="text-sm font-bold">Энерго-паки в магазине</div>
            <div className="text-[11px] text-muted-foreground">
              {enabled ? "Видны ВСЕМ игрокам." : "Пока видны только админам (режим теста)."}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => toggleShop.mutate(!enabled)}
          disabled={toggleShop.isPending}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition disabled:opacity-50",
            enabled ? "bg-success/15 text-success" : "border border-gold/40 bg-gold/10 text-gold",
          )}
        >
          {enabled ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
          {enabled ? "Видно всем" : "Включить для всех"}
        </button>
      </div>

      {/* Список паков */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-muted-foreground">
          Энерго-паки · {packs.length}
        </span>
        <button
          type="button"
          onClick={() => setDraft({ ...EMPTY, sortOrder: String(packs.length) })}
          className="inline-flex items-center gap-1 rounded-lg gradient-gold px-3 py-1.5 text-xs font-bold text-gold-foreground shadow-gold"
        >
          <Plus className="h-3.5 w-3.5" /> Новый пак
        </button>
      </div>

      {packs.map((p) => (
        <div key={p.id} className="space-y-2.5">
          {/* Клик по всей плашке открывает/закрывает форму редактирования. */}
          <div
            role="button"
            tabIndex={0}
            onClick={() =>
              setDraft(
                draft?.id === p.id
                  ? null
                  : {
                      id: p.id,
                      title: p.title,
                      amount: String(p.amount),
                      pricing: parsePricing((p as { priceSteps?: unknown }).priceSteps),
                      priceTickets: p.priceTickets != null ? String(p.priceTickets) : "",
                      priceDarai: p.priceDarai != null ? String(p.priceDarai) : "",
                      priceTokenSymbol: p.priceTokenSymbol ?? "",
                      priceTokenAmount:
                        p.priceTokenAmount != null ? String(p.priceTokenAmount) : "",
                      dailyLimit: String(p.dailyLimit),
                      active: p.active,
                      sortOrder: String(p.sortOrder),
                    },
              )
            }
            className={cn(
              "cursor-pointer rounded-2xl border bg-card p-3.5 transition hover:border-gold/40",
              draft?.id === p.id ? "border-gold/40" : "border-border",
            )}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-bold">
                  +{p.amount} энергии{" "}
                  {!p.active && (
                    <span className="ml-1 rounded-full bg-secondary px-1.5 py-0.5 text-[9px] text-muted-foreground">
                      выключен
                    </span>
                  )}
                </div>
                <EnergyPackPriceLine p={p} />
              </div>
              <button
                type="button"
                disabled={del.isPending}
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm(`Удалить пак «+${p.amount} энергии»?`)) del.mutate(p.id);
                }}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border/50 bg-secondary/40 text-muted-foreground hover:text-rose-400 disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          {/* Форма редактирования — ПО МЕСТУ, прямо под своим паком. */}
          {draft?.id === p.id && formNode}
        </div>
      ))}

      {packs.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border bg-secondary/20 p-6 text-center text-sm text-muted-foreground">
          Пока нет энерго-паков. Жми «Новый пак».
        </div>
      )}

      {/* Форма СОЗДАНИЯ нового пака — в конце списка. */}
      {draft && !draft.id && formNode}
    </div>
  );
}
