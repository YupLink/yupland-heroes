// Карточка «Применить» из рюкзака: бинокль (N штук — обзор 40 клеток на N×3
// минуты, сроки складываются) и лестница (одна за раз — выбор клетки на карте,
// ladderMode). Раскладка — как у BackpackBoostModal. Слой 165: карточку
// открывают и из таверны на карте (слой 140) — ниже она легла бы под неё.
import { useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Binoculars, Footprints, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { ResourceActionDialog } from "@/components/beta-raid/ResourceActionDialog";
import { QtyField } from "@/components/beta-raid/QtyField";
import { useQtyInput } from "@/hooks/useQtyInput";
import { useT } from "@/lib/i18n";
import { thumb } from "@/lib/image";
import { humanError } from "@/lib/humanError";
import { newOpId } from "@/lib/opId";
import { invalidateBackpack, invalidateHeroQueries } from "@/lib/query";
import { invalidateBags } from "@/components/beta-raid/loot-bag/lootBagLive";
import { MINE_LIFE_KEY } from "@/components/beta-raid/mine-life/mineLifeStore";
import { BINOCULAR_MINUTES, BINOCULAR_RADIUS, LADDER_GOLD } from "@/lib/raid/sight";
import { applyBinoculars } from "@/server/api/beta-raid/sight/binocular-use";
import { startLadderMode } from "./ladderMode";
import type { BackpackStack } from "@/server/api/beta-raid/market-backpack";

const clock = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";

export function ItemUseCard({
  stack,
  readOnly,
  beforeUse,
  onClose,
}: {
  stack: BackpackStack;
  readOnly: boolean;
  /** Окно героя: убедиться, что смотрим рюкзак активного героя (useCastle). */
  beforeUse?: () => Promise<void>;
  onClose: () => void;
}) {
  const t = useT();
  const qc = useQueryClient();
  const max = Math.floor(stack.count);
  const q = useQtyInput({ max: Math.max(1, max), initial: 1, integer: true });
  // Ключ нажатия — один на открытое окно: повтор после обрыва не спишет дважды.
  const op = useRef(newOpId());
  const binocular = stack.binocular === true;
  const use = useMutation({
    mutationFn: async (qty: number) => {
      await beforeUse?.();
      return applyBinoculars({ data: { qty, op: op.current } });
    },
    onSuccess: (res) => {
      op.current = newOpId();
      if (res.state === "short") return void toast.error(t("braid.sight_short"));
      if (res.state === "done")
        toast.success(t("braid.sight_done", { n: BINOCULAR_RADIUS, time: clock(res.until) }));
      invalidateBackpack(qc);
      // Срок — в состоянии рейда; что видно дальше — слои «второго обзора».
      invalidateHeroQueries(qc, ["beta-raid-state"]);
      invalidateBags(qc);
      void qc.invalidateQueries({ queryKey: MINE_LIFE_KEY });
      void qc.invalidateQueries({ queryKey: ["newspapers-near"] });
      onClose();
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });
  const Icon = binocular ? Binoculars : Footprints;
  const busy = use.isPending;
  return (
    <ResourceActionDialog
      title={stack.name}
      busy={busy}
      onClose={onClose}
      overlayClassName="fixed inset-0 z-[165] flex items-end justify-center bg-black/75 backdrop-blur-sm sm:items-center"
      className="mb-[calc(env(safe-area-inset-bottom)+76px)] max-h-[80dvh] w-full max-w-sm overflow-y-auto overscroll-contain rounded-t-3xl border border-border bg-background p-4 sm:mb-0 sm:max-h-[85vh] sm:rounded-3xl"
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-lg bg-secondary/40">
            {stack.image ? (
              <img
                src={thumb(stack.image, 120, "black")}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <Icon className="h-5 w-5 text-gold" />
            )}
          </div>
          <h3 className="min-w-0 truncate font-display text-base font-bold">{stack.name}</h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          aria-label={t("common.close")}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-border text-muted-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      {binocular && (
        <p className="rounded-2xl border border-gold/30 bg-gold/5 p-3 text-xs font-bold text-gold">
          {t("braid.sight_effect", { n: BINOCULAR_RADIUS, m: q.value * BINOCULAR_MINUTES })}
        </p>
      )}
      <p className="mt-2 text-[11px] text-muted-foreground">
        {t("braid.boost_item_count", { n: q.fmt(stack.count) })}
      </p>
      {binocular && max > 1 && (
        <QtyField q={q} className="mt-3">
          <button
            type="button"
            onClick={() => q.set(max)}
            className="shrink-0 rounded-full border border-border px-3 py-1.5 text-[11px] font-semibold"
          >
            {t("braid.potion_all", { n: max })}
          </button>
        </QtyField>
      )}
      <button
        type="button"
        onClick={() => {
          if (binocular) return use.mutate(q.commit());
          if (!startLadderMode()) return void toast(t("braid.ladder_map"));
          toast.success(t("braid.ladder_on"));
          onClose();
        }}
        disabled={busy || readOnly || max < 1}
        className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-2xl gradient-gold px-4 py-3 text-sm font-bold text-gold-foreground disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
        {binocular ? t("braid.sight_use") : t("braid.ladder_use", { n: LADDER_GOLD })}
      </button>
    </ResourceActionDialog>
  );
}
