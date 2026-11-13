import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChipImage } from "@/components/ChipImage";
import { hpOf, powerOf } from "@/lib/chipStats";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { Loader2, Info, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { exchangeTrainingForTickets } from "@/server/api/hallway";
import { humanError } from "@/lib/humanError";
import { goldForEarnedTickets } from "@/lib/ticketGold";

import { thumb } from "@/lib/image";
const TRIAL_STAT_SCALE = 0.5;

function fmtTickets(x: number): string {
  const n = Number(x) || 0;
  if (Number.isInteger(n)) return String(n);
  return String(Math.round(n * 100) / 100);
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-2 border-b border-border/40 py-1 last:border-0">
      <span className="text-muted-foreground">{k}</span>
      <span className="font-mono">{v}</span>
    </div>
  );
}

export function TrainingChipDetailModal({
  chipId,
  star,
  serialNo,
  sellTickets,
  sellable = true,
  imageUrl,
  onClose,
  onSold,
}: {
  chipId: string;
  star: number;
  serialNo: number;
  sellTickets: number;
  /** false — фишка выдана за пропуск Прихожей: воевать можно, продать нельзя. */
  sellable?: boolean;
  imageUrl: string;
  onClose: () => void;
  onSold: () => void;
}) {
  const t = useT();
  const qc = useQueryClient();
  const [showInfo, setShowInfo] = useState(false);
  const [lo, hi] = powerOf(star);
  const atkLo = Math.max(1, Math.round(lo * TRIAL_STAT_SCALE));
  const atkHi = Math.max(1, Math.round(hi * TRIAL_STAT_SCALE));
  const hpFull = hpOf(star);
  const hp = Math.max(1, Math.round(hpFull * TRIAL_STAT_SCALE));

  // Сервер платит за продажу золотом ×100 (§8.61) — показываем ту же сумму.
  const sellGold = goldForEarnedTickets(sellTickets);
  const sell = useMutation({
    mutationFn: () => exchangeTrainingForTickets({ data: { chipIds: [chipId] } }),
    onSuccess: (r) => {
      toast.success(t("chips.training_sold_gold", { n: fmtTickets(r.gold) }));
      qc.invalidateQueries({ queryKey: ["my-resources"] });
      onSold();
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  const deadBtn =
    "flex-1 cursor-not-allowed select-none rounded-xl border border-border bg-secondary/25 px-3 py-2.5 text-center text-xs font-medium text-muted-foreground/50 opacity-60";
  const StatRow = ({ k, orig, real }: { k: string; orig: string; real: string }) => (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{k}</span>
      <span className="flex items-center gap-1.5">
        <s className="text-muted-foreground/45">{orig}</s>
        <span className="font-semibold text-foreground">{real}</span>
      </span>
    </div>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 backdrop-blur-md sm:items-center"
      onClick={onClose}
    >
      <div
        className="relative mx-auto max-h-[calc(100vh-80px)] w-full max-w-md overflow-y-auto rounded-t-3xl border border-sky-400/30 bg-card/95 backdrop-blur-xl sm:max-h-[92vh] sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative">
          <ChipImage
            src={thumb(imageUrl, 640)}
            level={star}
            alt="Тренировочная фишка"
            className="aspect-square w-full"
          />
          <span className="absolute left-3 top-3 inline-flex items-center justify-center rounded-full bg-sky-500/85 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white backdrop-blur">
            Тренировочная
          </span>
          <span className="absolute right-3 top-3 inline-flex items-center justify-center rounded-full bg-background/80 px-2 py-0.5 font-mono text-[10px] text-muted-foreground backdrop-blur">
            #{serialNo}
          </span>
        </div>
        <div className="space-y-2 p-4">
          <div className="relative flex items-center gap-1.5">
            <div className="font-display text-lg font-bold">Тренировочный пак · #{serialNo}</div>
            <button
              type="button"
              onClick={() => setShowInfo((v) => !v)}
              aria-label="Что за тренировочная фишка"
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-sky-400/40 text-sky-300 transition hover:bg-sky-400/10"
            >
              <Info className="h-3 w-3" />
            </button>
            {showInfo && (
              <div className="absolute left-0 top-7 z-10 w-full rounded-xl border border-sky-400/30 bg-card/95 p-3 text-[11px] leading-relaxed text-muted-foreground shadow-xl backdrop-blur-xl">
                <ul className="space-y-1">
                  <li>• Тренировочную фишку нельзя улучшить, продать на маркете или передать.</li>
                  <li>• Характеристики фишки ×2 меньше обычных.</li>
                  <li>
                    {sellable ? (
                      <>
                        •{" "}
                        <b className="text-gold">
                          {t("chips.training_sell_hint", { n: fmtTickets(sellGold) })}
                        </b>
                      </>
                    ) : (
                      <>• {t("chips.training_skip_hint")}</>
                    )}
                  </li>
                </ul>
              </div>
            )}
          </div>
          <div className="space-y-1 text-xs">
            <StatRow k={t("chips.kv_attack")} orig={`${lo}–${hi}`} real={`${atkLo}–${atkHi}`} />
            <StatRow
              k={t("chips.kv_hp")}
              orig={hpFull.toLocaleString("ru-RU")}
              real={hp.toLocaleString("ru-RU")}
            />
            <KV k={t("chips.kv_supply")} v="тренировочные" />
          </div>
          {sellable ? (
            <button
              type="button"
              onClick={() => sell.mutate()}
              disabled={sell.isPending}
              className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl gradient-gold px-3 py-2.5 text-xs font-bold text-gold-foreground shadow-[0_0_18px_rgba(255,184,0,0.35)] transition hover:brightness-110 disabled:opacity-60"
            >
              {sell.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ShoppingCart className="h-3.5 w-3.5" />
              )}
              {t("chips.training_sell_for", { n: fmtTickets(sellGold) })}
            </button>
          ) : (
            <span className={cn(deadBtn, "mt-2 block")} aria-disabled>
              {t("chips.training_skip_locked")}
            </span>
          )}
          <div className="flex gap-2">
            <span className={deadBtn} aria-disabled>
              {t("chips.upgrade")}
            </span>
          </div>
          <div className="pt-1">
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-xl border border-border bg-secondary/40 px-3 py-2 text-xs font-medium transition hover:bg-secondary"
            >
              {t("common.close")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
