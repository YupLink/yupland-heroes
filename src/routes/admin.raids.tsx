// Админка рейдов: локации/боссы плюс общие настройки рейда.
//
// Цены смены героя в таверне — настройка мира, а не отдельной постройки: одни
// на всю карту, поэтому живут здесь, а не в редакторе построек. Улучшенный
// трактир берёт дешевле обычного — за это его и достраивают.
import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Beer, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { humanError } from "@/lib/humanError";
import { adminGetHeroSwapPrice, adminSetHeroSwapPrice } from "@/server/api/beta-raid/tavern-admin";
import { AdminRaids } from "./admin/raids/RaidsDashboard";
import { FishingAdminCard } from "@/components/admin/fishing/FishingAdminCard";

export const Route = createFileRoute("/admin/raids")({ component: RaidsAdminPage });

function RaidsAdminPage() {
  return (
    <div className="space-y-4">
      <HeroSwapPriceCard />
      <FishingAdminCard />
      <AdminRaids />
    </div>
  );
}

/** Два поля: сколько лайков берёт за смену обычная таверна и улучшенная. */
function HeroSwapPriceCard() {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<{ base: string; up: string } | null>(null);

  const price = useQuery({
    queryKey: ["admin-hero-swap-price"],
    queryFn: () => adminGetHeroSwapPrice(),
  });

  const save = useMutation({
    mutationFn: (v: { priceLikes: number; priceLikesUpgraded: number }) =>
      adminSetHeroSwapPrice({ data: v }),
    onSuccess: (res) => {
      toast.success(
        `Смена героя: таверна ${res.priceLikes}, улучшенная ${res.priceLikesUpgraded} лайков`,
      );
      setDraft(null);
      qc.invalidateQueries({ queryKey: ["admin-hero-swap-price"] });
      // Окно постройки у игрока держит цену в своём ответе — пусть перечитает.
      qc.invalidateQueries({ queryKey: ["beta-raid-building"] });
      qc.invalidateQueries({ queryKey: ["tavern-offer"] });
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  const base = draft?.base ?? String(price.data?.priceLikes ?? "");
  const up = draft?.up ?? String(price.data?.priceLikesUpgraded ?? "");
  const nBase = Math.round(Number(base));
  const nUp = Math.round(Number(up));
  const valid = [nBase, nUp].every((n) => Number.isFinite(n) && n >= 0);
  const edit = (patch: Partial<{ base: string; up: string }>) => setDraft({ base, up, ...patch });

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-2 inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        <Beer className="h-3.5 w-3.5" />
        Таверна: смена героя
      </div>
      <div className="space-y-2">
        <PriceRow
          label="Таверна (2-й тир)"
          value={base}
          placeholder="50"
          onChange={(v) => edit({ base: v })}
        />
        <PriceRow
          label="Улучшенная (3-й тир)"
          value={up}
          placeholder="30"
          onChange={(v) => edit({ up: v })}
        />
      </div>
      <button
        type="button"
        onClick={() => valid && save.mutate({ priceLikes: nBase, priceLikesUpgraded: nUp })}
        disabled={!valid || save.isPending || price.isLoading}
        className="mt-3 flex items-center gap-1.5 rounded-xl gradient-gold px-4 py-2 text-xs font-bold text-gold-foreground disabled:opacity-50"
      >
        {save.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        Сохранить
      </button>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Цены действуют во всех тавернах на карте. По умолчанию 50 и 30. Ноль — смена бесплатна.
        Сколько раз в сутки можно менять, решает тир: вторая — раз в сутки, улучшенная — дважды.
      </p>
    </div>
  );
}

/** Строка «подпись — поле — лайков за смену»: одинаковая у обоих тиров. */
function PriceRow({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex items-center gap-2">
      <span className="w-40 text-xs text-muted-foreground">{label}</span>
      <input
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, ""))}
        placeholder={placeholder}
        className="w-28 rounded-xl border border-border bg-background px-3 py-2 text-sm"
      />
      <span className="text-xs text-muted-foreground">лайков за смену</span>
    </label>
  );
}
