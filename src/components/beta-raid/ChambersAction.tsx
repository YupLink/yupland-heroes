// Покои: снять с игрока дебаффы за плату.
//
// В отличие от дерева уровней (одноразового), покои — многоразовая услуга:
// подошёл, выбрал цену, всё сняли. Экран показывает СПИСОК висящих дебаффов
// (замедление / ослабления / стан-яд на фишках), чтобы игрок понимал, за что
// платит.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Moon } from "lucide-react";
import { toast } from "sonner";
import { humanError } from "@/lib/humanError";
import { useT } from "@/lib/i18n";
import { restInChambers } from "@/server/api/beta-raid/chambers";
import { priceLabel, type BuildingExtra, type ServicePrice } from "@/lib/buildingEffect";
import { ENERGY_KEY } from "@/lib/hooks/useEnergy";

type ChambersExtra = Extract<NonNullable<BuildingExtra>, { kind: "chambers" }>;

const GROUP_LABEL: Record<ChambersExtra["active"][number]["group"], string> = {
  slow: "braid.chambers_grp_slow",
  weaken: "braid.chambers_grp_weaken",
  stun: "braid.chambers_grp_stun",
  poison: "braid.chambers_grp_poison",
};

export function ChambersAction({
  q,
  r,
  extra,
  onDone,
}: {
  q: number;
  r: number;
  extra: ChambersExtra;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const t = useT();

  const priceText = (p: ServicePrice) => {
    const label = priceLabel(p);
    return t(label.key, label.params);
  };

  const rest = useMutation({
    mutationFn: (priceIndex: number) => {
      const p = extra.prices[priceIndex];
      if (!p) throw new Error(t("braid.chambers_price_lost"));
      return restInChambers({
        data: {
          q,
          r,
          priceIndex,
          expect: { kind: p.kind, token: p.token ?? null, amount: p.amount },
        },
      });
    },
    onSuccess: (res) => {
      toast.success(
        t("braid.chambers_rested_toast", {
          n: res.cleared,
          paid: t(res.paidKey, res.paidParams),
        }),
      );
      void qc.invalidateQueries({ queryKey: ["beta-raid-building", q, r] });
      void qc.invalidateQueries({ queryKey: ENERGY_KEY });
      // Дебаффы висят на самой карте (значки над героем) — перечитать.
      void qc.invalidateQueries({ queryKey: ["beta-raid-state"] });
      void qc.invalidateQueries({ queryKey: ["my-chip-inventory"] });
      onDone();
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  return (
    <div className="space-y-2 rounded-2xl border border-border/60 bg-secondary/20 p-3">
      <div className="flex items-center justify-center gap-1.5 text-sm font-semibold">
        <Moon className="h-4 w-4 text-gold" />
        {t("braid.chambers_title")}
      </div>

      {extra.reasonKey && (
        <p className="text-center text-[11px] text-muted-foreground">
          {t(extra.reasonKey, extra.reasonParams)}
        </p>
      )}

      {extra.active.length > 0 && (
        <ul className="space-y-1 text-[11px]">
          {extra.active.map((eff, i) => (
            <li
              key={`${eff.kind}:${i}`}
              className="flex items-center justify-between rounded-lg border border-border/60 bg-background/40 px-2.5 py-1.5"
            >
              <span className="truncate">
                {t(GROUP_LABEL[eff.group])} · {eff.kind}
                {eff.source ? ` · ${eff.source}` : ""}
              </span>
              <span className="text-muted-foreground">−{eff.value}</span>
            </li>
          ))}
        </ul>
      )}

      {extra.prices.length > 0 ? (
        <div className="space-y-1.5">
          {extra.prices.map((p, i) => (
            <button
              key={`${p.kind}:${p.token ?? ""}:${p.amount}`}
              type="button"
              onClick={() => rest.mutate(i)}
              disabled={!extra.can || rest.isPending}
              className="flex w-full items-center justify-between rounded-2xl border border-border bg-card px-3.5 py-3 text-sm font-semibold disabled:opacity-40"
            >
              <span className="inline-flex items-center gap-2">
                {rest.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Moon className="h-4 w-4 text-gold" />
                )}
                {t("braid.chambers_rest")}
              </span>
              <span className="text-gold">{priceText(p)}</span>
            </button>
          ))}
        </div>
      ) : (
        <p className="text-center text-[11px] text-muted-foreground">
          {t("braid.chambers_no_prices")}
        </p>
      )}
    </div>
  );
}
