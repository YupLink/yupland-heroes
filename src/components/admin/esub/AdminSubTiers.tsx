// Тарифы подписки: цена в $ и что получает игрок (энергия, бокс, штук в день).
// DARAI и Stars считаются сами от $ — здесь показываются для сверки.
// Тариф можно добавить и удалить; купленные подписки хранят свои условия.
// Лицензия банка — на время подписки (esub-06), ступень из списка.
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Plus, Save, Trash2 } from "lucide-react";
import { humanError } from "@/lib/humanError";
import { adminCreateSubTier, adminDeleteSubTier, adminSaveSubTier } from "@/server/api/energy-sub/admin-tiers";
import { adminListMysticPacks } from "@/server/api/mystic";
import type { SubOffer } from "@/server/api/energy-sub/tiers";
import { LICENSE_TIERS, licenseTier } from "@/lib/bankLicense";

export const ESUB_ADMIN_KEY = ["admin-energy-sub"];

const input =
  "w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-gold/50";

function TierForm({ tier, boxes }: { tier: SubOffer; boxes: Array<{ id: string; name: string }> }) {
  const qc = useQueryClient();
  const [f, setF] = useState(() => ({
    name: tier.name,
    nameEn: tier.nameEn,
    priceUsd: String(tier.priceUsd),
    energyPerDay: String(tier.energyPerDay),
    boxPackId: tier.boxPackId ?? "",
    boxesPerDay: String(tier.boxesPerDay),
    noDecay: tier.noDecay,
    licenseTier: tier.licenseTier ?? "",
    days: String(tier.days),
    active: tier.active,
  }));
  useEffect(() => {
    setF((p) => ({ ...p, priceUsd: String(tier.priceUsd) }));
  }, [tier.priceUsd]);
  const save = useMutation({
    mutationFn: () =>
      adminSaveSubTier({
        data: {
          id: tier.id,
          name: f.name,
          nameEn: f.nameEn,
          priceUsd: Number(f.priceUsd.replace(",", ".")),
          energyPerDay: Number(f.energyPerDay),
          boxPackId: f.boxPackId || null,
          boxesPerDay: Number(f.boxesPerDay),
          noDecay: f.noDecay,
          licenseTier: licenseTier(f.licenseTier)?.id ?? null,
          days: Number(f.days),
          active: f.active,
        },
      }),
    onSuccess: () => {
      toast.success("Тариф сохранён");
      void qc.invalidateQueries({ queryKey: ESUB_ADMIN_KEY });
      void qc.invalidateQueries({ queryKey: ["energy-sub-offers"], refetchType: "all" });
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });
  const [sure, setSure] = useState(false);
  const del = useMutation({
    mutationFn: () => adminDeleteSubTier({ data: { id: tier.id } }),
    onSuccess: () => {
      toast.success("Тариф удалён");
      void qc.invalidateQueries({ queryKey: ESUB_ADMIN_KEY });
      void qc.invalidateQueries({ queryKey: ["energy-sub-offers"], refetchType: "all" });
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) =>
    setF((p) => ({ ...p, [k]: e.target.value }));
  const fmt = (n: number | null) => (n == null ? "нет курса" : n.toLocaleString("ru-RU"));

  return (
    <div className="space-y-2 rounded-xl border border-border bg-card p-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <label className="text-[11px] text-muted-foreground">
          Название<input className={input} value={f.name} onChange={set("name")} />
        </label>
        <label className="text-[11px] text-muted-foreground">
          Название (EN)<input className={input} value={f.nameEn} onChange={set("nameEn")} />
        </label>
        <label className="text-[11px] text-muted-foreground">
          Цена, $<input className={input} inputMode="decimal" value={f.priceUsd} onChange={set("priceUsd")} />
        </label>
        <label className="text-[11px] text-muted-foreground">
          Дней<input className={input} inputMode="numeric" value={f.days} onChange={set("days")} />
        </label>
        <label className="text-[11px] text-muted-foreground">
          Энергия в день
          <input className={input} inputMode="numeric" value={f.energyPerDay} onChange={set("energyPerDay")} />
        </label>
        <div className="col-span-2 text-[11px] text-muted-foreground">
          Бокс
          {/* Кнопки, а не <select>: нативный выпадающий список не открывается
              в вебвью Xiaomi (см. PackPicker). */}
          <div className="mt-1 flex flex-wrap gap-1">
            {[{ id: "", name: "— без бокса —" }, ...boxes].map((b) => (
              <button
                key={b.id || "none"}
                type="button"
                onClick={() => setF((p) => ({ ...p, boxPackId: b.id }))}
                className={`rounded-full border px-2 py-1 text-[11px] ${
                  f.boxPackId === b.id ? "border-gold bg-gold/20 text-gold" : "border-border"
                }`}
              >
                {b.name}
              </button>
            ))}
          </div>
        </div>
        <label className="text-[11px] text-muted-foreground">
          Боксов в день
          <input className={input} inputMode="numeric" value={f.boxesPerDay} onChange={set("boxesPerDay")} />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-[12px]">
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            className="h-4 w-4 accent-gold"
            checked={f.active}
            onChange={(e) => setF((p) => ({ ...p, active: e.target.checked }))}
          />
          Продаётся
        </label>
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            className="h-4 w-4 accent-gold"
            checked={f.noDecay}
            onChange={(e) => setF((p) => ({ ...p, noDecay: e.target.checked }))}
          />
          Энергия не тает
        </label>
        {/* Кнопки, а не <select> — как у бокса: вебвью Xiaomi список не открывает. */}
        <span className="flex flex-wrap items-center gap-1">
          Лицензия банка:
          {[{ id: "", ru: "нет" }, ...LICENSE_TIERS].map((t) => (
            <button
              key={t.id || "none"}
              type="button"
              onClick={() => setF((p) => ({ ...p, licenseTier: t.id }))}
              className={`rounded-full border px-2 py-1 text-[11px] ${
                f.licenseTier === t.id ? "border-gold bg-gold/20 text-gold" : "border-border"
              }`}
            >
              {t.ru}
            </button>
          ))}
        </span>
        <span className="text-muted-foreground">
          Сейчас: {fmt(tier.prices.USDT)} USDT · {fmt(tier.prices.Darai)} DARAI · {fmt(tier.prices.STARS)} ⭐
        </span>
        <button
          type="button"
          onClick={() => (sure ? del.mutate() : setSure(true))}
          onBlur={() => setSure(false)}
          disabled={del.isPending}
          className="ml-auto inline-flex items-center gap-1 rounded-lg border border-destructive/40 px-2.5 py-1.5 text-destructive disabled:opacity-50"
        >
          <Trash2 className="h-3.5 w-3.5" />
          {sure ? "Точно удалить?" : "Удалить"}
        </button>
        <button
          type="button"
          onClick={() => save.mutate()}
          disabled={save.isPending}
          className="inline-flex items-center gap-1 rounded-lg gradient-gold px-3 py-1.5 font-bold text-gold-foreground disabled:opacity-50"
        >
          {save.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Сохранить
        </button>
      </div>
    </div>
  );
}

export function AdminSubTiers({ tiers }: { tiers: SubOffer[] }) {
  const boxes = useQuery({
    queryKey: ["admin-mystic-packs"],
    queryFn: () => adminListMysticPacks(),
    staleTime: 60_000,
  });
  const list = (boxes.data ?? []).map((b) => ({ id: b.id, name: b.name }));
  const qc = useQueryClient();
  // Новый тариф не продаётся, пока его не настроят и не отметят «Продаётся».
  const add = useMutation({
    mutationFn: () =>
      adminCreateSubTier({
        data: {
          name: "Новый тариф",
          nameEn: "New plan",
          priceUsd: 10,
          energyPerDay: 0,
          boxPackId: null,
          boxesPerDay: 0,
          noDecay: false,
          licenseTier: null,
          days: 30,
          active: false,
        },
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ESUB_ADMIN_KEY }),
    onError: (e: Error) => toast.error(humanError(e)),
  });
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-base font-bold">Тарифы</h2>
        <button
          type="button"
          onClick={() => add.mutate()}
          disabled={add.isPending}
          className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-[12px] font-semibold disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" />
          Добавить тариф
        </button>
      </div>
      {tiers.map((t) => (
        <TierForm key={t.id} tier={t} boxes={list} />
      ))}
    </section>
  );
}
