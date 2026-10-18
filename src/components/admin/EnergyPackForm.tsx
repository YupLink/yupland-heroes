// Форма создания/редактирования энерго-пака. Вынесена из панели (§13.1):
// сама панель отвечает только за список и килсвич.
import { Zap, CalendarDays, Coins, Ticket } from "lucide-react";
import { cn } from "@/lib/utils";
import { EnergyLadderEditor } from "./EnergyLadderEditor";
import type { OfferPricing } from "@/lib/energySteps";

export type EnergyPackDraft = {
  id?: string;
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

export function EnergyPackForm({
  draft,
  setDraft,
  tokens,
  onCancel,
  onSave,
  saving,
}: {
  draft: EnergyPackDraft;
  setDraft: (d: EnergyPackDraft) => void;
  tokens: Array<{ symbol: string }>;
  onCancel: () => void;
  onSave: () => void;
  saving: boolean;
}) {
  return (
    <div className="space-y-2.5 rounded-2xl border border-gold/30 bg-card p-4">
      <div className="text-sm font-bold">{draft.id ? "Редактировать пак" : "Новый энерго-пак"}</div>
      {/* Энергия */}
      <div>
        <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Zap className="h-3.5 w-3.5 text-rose-400" /> Энергия
        </div>
        <input
          type="number"
          min={1}
          inputMode="numeric"
          value={draft.amount}
          onChange={(e) => setDraft({ ...draft, amount: e.target.value })}
          className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-base font-bold"
        />
      </div>

      {/* Цены и лимит задаются только лестницей: строка на валюту, шаги вбок.
          Старые поля цен и «Лимит/день» убраны — они дублировали настройку. */}
      <EnergyLadderEditor
        pricing={draft.pricing}
        onChange={(pricing) => setDraft({ ...draft, pricing })}
        tokenSymbols={tokens.map((t) => t.symbol)}
      />

      <div className="grid grid-cols-1 items-end gap-2">
        <label className="flex h-[42px] cursor-pointer items-center justify-center gap-2 rounded-xl border border-border bg-background text-sm font-medium text-muted-foreground">
          <input
            type="checkbox"
            checked={draft.active}
            onChange={(e) => setDraft({ ...draft, active: e.target.checked })}
            className="h-5 w-5 accent-gold"
          />
          Активен
        </label>
      </div>
      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 rounded-lg border border-border py-2 text-sm font-bold text-muted-foreground"
        >
          Отмена
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={onSave}
          className="flex-1 rounded-lg gradient-gold py-2 text-sm font-bold text-gold-foreground shadow-gold disabled:opacity-50"
        >
          {saving ? "Сохраняю…" : "Сохранить"}
        </button>
      </div>
    </div>
  );
}
