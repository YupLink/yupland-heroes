// Университет: окно обучения фишек.
//
// Устроено как прежний стейкинг, и намеренно: игрок уже знает этот экран.
// Сверху — что даёт здание и сколько накоплено, ниже — сетка мест, куда
// кладут фишки. Занятое место возвращает фишку нажатием, пустое открывает
// выбор, закрытое — покупку за золото (§8.61).
//
// Числа считает сервер, но подписи берутся из общего с ним модуля
// @/lib/university: показать одну доходность, а начислить другую нельзя.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { GraduationCap, Loader2, X, ThumbsUp } from "lucide-react";
import { toast } from "sonner";
import {
  getUniversity,
  stakeUniversityChips,
  unstakeUniversityChips,
  claimUniversityLikes,
  buyUniversitySlot,
} from "@/server/api/beta-raid/university";
import { humanError } from "@/lib/humanError";
import { useT } from "@/lib/i18n";
import {
  UNI_CLAIM_COOLDOWN_MS,
  UNI_ACCRUAL_CAP_MS,
  bonusLabel,
  likesLabel,
} from "@/lib/university";
import { useNowTick } from "@/components/chips/chipBusy";
import { UniversitySlots } from "./UniversitySlots";
import { UniversityPicker } from "./UniversityPicker";

export function UniversityModal({ q, r, onClose }: { q: number; r: number; onClose: () => void }) {
  const t = useT();
  const qc = useQueryClient();
  const [picking, setPicking] = useState(false);
  // Тик каждую секунду: обратный отсчёт кулдауна на кнопке должен идти живым,
  // а не только по обновлению серверных данных.
  const nowTick = useNowTick(1000);

  const info = useQuery({
    queryKey: ["beta-university", q, r],
    queryFn: () => getUniversity({ data: { q, r } }),
    retry: false,
  });

  /** После любого действия: места, лайки, инвентарь и окно постройки — заново. */
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["beta-university"] });
    qc.invalidateQueries({ queryKey: ["beta-raid-building", q, r] });
    qc.invalidateQueries({ queryKey: ["my-like-balance"] });
    qc.invalidateQueries({ queryKey: ["my-chip-inventory"] });
    qc.invalidateQueries({ queryKey: ["my-resources"] });
  };
  const fail = (e: Error) => toast.error(humanError(e));

  const stake = useMutation({
    mutationFn: (chipId: string) => stakeUniversityChips({ data: { q, r, chipIds: [chipId] } }),
    onSuccess: () => {
      setPicking(false);
      toast.success(t("braid.uni_staked", { n: 1 }));
      refresh();
    },
    onError: fail,
  });
  const unstake = useMutation({
    mutationFn: (chipId: string) => unstakeUniversityChips({ data: { q, r, chipIds: [chipId] } }),
    onSuccess: () => {
      toast.success(t("braid.uni_unstaked", { n: 1 }));
      refresh();
    },
    onError: fail,
  });
  const slot = useMutation({
    mutationFn: () => buyUniversitySlot({ data: { q, r } }),
    onSuccess: (res) => {
      toast.success(t("braid.uni_slot_bought", { n: res.slots }));
      refresh();
    },
    onError: fail,
  });
  const claim = useMutation({
    mutationFn: () => claimUniversityLikes({ data: { q, r } }),
    onSuccess: (res) => {
      toast.success(t("braid.uni_claimed", { n: likesLabel(res.likes) }));
      refresh();
    },
    onError: fail,
  });

  const d = info.data;
  const busy = stake.isPending || unstake.isPending || claim.isPending || slot.isPending;
  /** Сколько миллисекунд до конца кулдауна. 0 — можно собирать. */
  const cooldownLeft = (() => {
    if (!d?.claimedAtMs || !nowTick) return 0;
    return Math.max(0, d.claimedAtMs + UNI_CLAIM_COOLDOWN_MS - nowTick);
  })();
  const cooldownText = (ms: number): string => {
    const s = Math.ceil(ms / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const ss = s % 60;
    return h > 0
      ? `${h}:${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}`
      : `${m}:${String(ss).padStart(2, "0")}`;
  };
  /** Ставка на пределе недели: дальше уже не капает — окно об этом скажет. */
  const capped =
    (d?.ratePerDay ?? 0) > 0 &&
    (d?.pending ?? 0) >= (d?.ratePerDay ?? 0) * (UNI_ACCRUAL_CAP_MS / 86_400_000) - 0.01;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center sm:p-4">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-gold/30 bg-card p-4 pb-[calc(env(safe-area-inset-bottom)+16px)] sm:rounded-3xl sm:pb-4">
        <div className="mb-3 flex items-center gap-2">
          <GraduationCap className="h-5 w-5 text-gold" />
          <b className="flex-1 truncate">{d?.here.name ?? t("braid.uni_title")}</b>
          <button onClick={onClose} className="text-muted-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        {info.isLoading && (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}
        {info.error && (
          <p className="py-6 text-center text-sm text-destructive">{humanError(info.error)}</p>
        )}

        {d && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-1.5 text-center">
              <Stat label={t("braid.uni_level")} value={`${d.here.level}`} />
              <Stat label={t("braid.uni_bonus")} value={bonusLabel(d.here.level)} />
              <Stat label={t("braid.uni_rate")} value={likesLabel(d.ratePerDay * d.here.bonus)} />
            </div>

            <button
              onClick={() => claim.mutate()}
              disabled={busy || d.pending <= 0 || cooldownLeft > 0}
              className="flex w-full items-center justify-center gap-2 rounded-2xl gradient-gold px-4 py-3 text-sm font-bold text-gold-foreground disabled:opacity-50"
            >
              {claim.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ThumbsUp className="h-4 w-4" />
              )}
              {cooldownLeft > 0
                ? t("braid.uni_claim_in", { time: cooldownText(cooldownLeft) })
                : t("braid.uni_claim_n", { n: likesLabel(d.pending * d.here.bonus) })}
            </button>
            {capped && (
              <p className="text-center text-[10px] text-amber-400">
                {t("braid.uni_capped")}
              </p>
            )}

            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>{t("braid.uni_slots", { used: d.staked.length, total: d.slots })}</span>
              <span>{t("braid.uni_pending_hint", { base: likesLabel(d.pending), mult: bonusLabel(d.here.level) })}</span>
            </div>

            <UniversitySlots
              chips={d.staked}
              slots={d.slots}
              maxSlots={d.maxSlots}
              slotPrice={d.slotPrice}
              busy={busy}
              onPick={() => setPicking(true)}
              onTake={(id) => unstake.mutate(id)}
              onBuySlot={() => slot.mutate()}
            />

            <p className="text-center text-[10px] text-muted-foreground">{t("braid.uni_hint")}</p>
          </div>
        )}
      </div>

      {picking && d && (
        <UniversityPicker
          chips={d.free}
          busy={stake.isPending}
          onPick={(id) => stake.mutate(id)}
          onClose={() => setPicking(false)}
        />
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-background/40 px-2 py-1.5">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="text-sm font-bold">{value}</div>
    </div>
  );
}
