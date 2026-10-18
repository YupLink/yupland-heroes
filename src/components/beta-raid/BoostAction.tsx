// Алтарь-БУСТ: сколько прибавит герою, насколько и во что это обойдётся.
//
// Между нажатием и списанием — экран подтверждения: прибавка временная, а
// плата берётся сразу, поэтому игрок должен увидеть все цифры до, а не после.
import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dumbbell, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { humanError } from "@/lib/humanError";
import { useLang, useT } from "@/lib/i18n";
import { newOpId } from "@/lib/opId";
import { takeBuildingBoost } from "@/server/api/beta-raid/boost-action";
import { boostListText, boostRollText, boostStatLabel } from "@/lib/hero/boost";
import { priceText } from "./portalPriceText";
import { ENERGY_KEY } from "@/lib/hooks/useEnergy";
import { RESOURCES_KEY } from "@/lib/hooks/useResources";
import { invalidateHeroQueries } from "@/lib/query";
import type { BuildingExtra } from "@/lib/buildingEffect";
import { untilLabel } from "./effectMeta";

type BoostExtra = Extract<NonNullable<BuildingExtra>, { kind: "boost" }>;

export function BoostAction({
  q,
  r,
  extra,
  onDone,
}: {
  q: number;
  r: number;
  extra: BoostExtra;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const t = useT();
  const lang = useLang() === "en" ? "en" : "ru";
  const [confirm, setConfirm] = useState(false);
  // Часы для остатка активного буста: тикают на клиенте, чтобы «12м» не
  // застывало на открытом окне.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const gift = boostListText(extra.effects, lang);
  const cost = extra.prices.length > 0 ? priceText(extra.prices, t) : t("braid.boost_free");

  const take = useMutation({
    // Ключ нажатия придумываем здесь: слепой повтор моста не должен
    // ни списать второй раз, ни начислить второй буст.
    mutationFn: () => takeBuildingBoost({ data: { q, r, op: newOpId() } }),
    onSuccess: (res) => {
      // Выпало по каждому эффекту своё — перечисляем всё, что получил герой.
      const line = res.rolls.map((r) => boostRollText(r, lang)).join(" · ");
      toast.success(t("braid.boost_done_toast", { hero: res.heroName, line }));
      invalidateHeroQueries(qc, ["my-tickets", "my-like-balance"]);
      void qc.invalidateQueries({ queryKey: ["beta-raid-building", q, r] });
      void qc.invalidateQueries({ queryKey: ENERGY_KEY });
      void qc.invalidateQueries({ queryKey: RESOURCES_KEY });
      // Значок буста над героем висит в состоянии рейда — без этого он
      // появился бы только на следующем шаге.
      void qc.invalidateQueries({ queryKey: ["beta-raid-state"], refetchType: "all" });
      onDone();
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  return (
    <div className="space-y-2 rounded-2xl border border-border/60 bg-secondary/20 p-3">
      <div className="text-center text-sm">
        <b className="text-gold">{gift}</b>
        {extra.heroName && (
          <>
            <br />
            <span className="text-[11px] text-muted-foreground">
              {t("braid.boost_for_hero", { hero: extra.heroName })}
            </span>
          </>
        )}
      </div>

      {/* Что уже висит из этих же прибавок и сколько им осталось. Ничего не
          висит — строки нет: писать «активно 0» незачем. */}
      {extra.active.length > 0 && (
        <p className="text-center text-[11px] text-muted-foreground">
          {t("braid.boost_active", {
            line: extra.active
              .map(
                (a) =>
                  `+${a.value} ${boostStatLabel(a.stat, lang)} (${untilLabel(a.expiresAt, now, t)})`,
              )
              .join(" · "),
          })}
        </p>
      )}

      {extra.reasonKey && (
        <p className="text-center text-[11px] text-destructive">
          {t(extra.reasonKey, extra.reasonParams)}
        </p>
      )}

      {confirm ? (
        <>
          <p className="text-center text-sm">
            <b className="text-gold">{t("braid.boost_confirm", { gift, cost })}</b>
            <br />
            <span className="text-[11px] text-muted-foreground">{t("braid.boost_temp_note")}</span>
          </p>
          <button
            type="button"
            onClick={() => take.mutate()}
            disabled={take.isPending}
            className="flex w-full items-center justify-center gap-1.5 rounded-2xl gradient-gold px-4 py-3 text-sm font-bold text-gold-foreground disabled:opacity-50"
          >
            {take.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Dumbbell className="h-4 w-4" />
            )}
            {t("braid.boost_take")}
          </button>
          <button
            type="button"
            onClick={() => setConfirm(false)}
            className="w-full text-center text-[11px] text-muted-foreground"
          >
            {t("common.cancel")}
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => setConfirm(true)}
          disabled={!extra.can}
          className="flex w-full items-center justify-between rounded-2xl border border-border bg-card px-3.5 py-3 text-sm font-semibold disabled:opacity-40"
        >
          <span className="inline-flex min-w-0 items-center gap-2 text-left">
            <Dumbbell className="h-4 w-4 shrink-0 text-gold" />
            <span className="min-w-0">{gift}</span>
          </span>
          <span className="shrink-0 text-gold">{cost}</span>
        </button>
      )}
    </div>
  );
}
