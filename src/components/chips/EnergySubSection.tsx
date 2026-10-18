// Витрина подписки на энергию в окне «Купить энергию».
//
// Цены — готовые числа с сервера (курс DARAI обновляется там раз в 5 минут).
// Скидка DARAI и наценка Stars игроку не показываются — только итоговая цена.
// Оплата со счёта; перед списанием — подтверждение, сумма крупная.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarClock, Landmark, Loader2, ShieldCheck, Zap } from "lucide-react";
import { useLang, useT } from "@/lib/i18n";
import { humanError } from "@/lib/humanError";
import { newOpId } from "@/lib/opId";
import { getEnergySubOffers, type SubOffer } from "@/server/api/energy-sub/tiers";
import { buyEnergySub } from "@/server/api/energy-sub/buy";
import { subPriceText, type SubToken } from "@/lib/energySub";
import { SubPriceButtons } from "./SubPriceButtons";
import { licenseTier } from "@/lib/bankLicense";

export const ESUB_KEY = ["energy-sub-offers"];

type Pick = { tier: SubOffer; token: SubToken; price: number };

export function EnergySubSection() {
  const t = useT();
  const lang = useLang();
  const qc = useQueryClient();
  const offers = useQuery({ queryKey: ESUB_KEY, queryFn: () => getEnergySubOffers(), staleTime: 60_000 });
  const [pick, setPick] = useState<Pick | null>(null);

  const buy = useMutation({
    mutationFn: (p: Pick) =>
      buyEnergySub({ data: { tierId: p.tier.id, token: p.token, expected: p.price, opId: newOpId() } }),
    onSuccess: () => {
      toast.success(t("esub.done"));
      setPick(null);
      // bank-license: подписка даёт лицензию банка (esub-06).
      const keys = [ESUB_KEY, ["acc-balances"], ["my-gifts"], ["my-darai-balance"], ["my-energy"], ["bank-license"]];
      for (const key of keys) {
        void qc.invalidateQueries({ queryKey: key, refetchType: "all" });
      }
    },
    onError: (e: Error) => {
      toast.error(humanError(e));
      if (e.message.includes("esub.price_changed")) void qc.invalidateQueries({ queryKey: ESUB_KEY });
      setPick(null);
    },
  });

  const data = offers.data;
  if (!data?.visible || data.tiers.length === 0) return null;
  const name = (x: SubOffer) => (lang === "en" && x.nameEn ? x.nameEn : x.name);

  return (
    <section className="space-y-2 rounded-2xl border border-gold/30 bg-gold/5 p-3">
      <div className="flex items-center gap-2 font-display text-base font-bold">
        <CalendarClock className="h-4 w-4 text-gold" />
        {t("esub.title")}
      </div>

      {data.mine.length > 0 && (
        <div className="space-y-1 rounded-xl border border-border bg-background/60 p-2 text-[11px]">
          <div className="font-semibold text-muted-foreground">{t("esub.mine")}</div>
          {data.mine.map((m) => (
            <div key={m.id}>
              {t("esub.active", {
                tier: m.tierName,
                date: new Date(m.endsAt).toLocaleDateString(lang === "en" ? "en-GB" : "ru-RU"),
                given: String(m.daysGiven),
                days: String(m.days),
              })}
            </div>
          ))}
        </div>
      )}

      {data.tiers.map((x) => (
        <div key={x.id} className="space-y-2 rounded-xl border border-border bg-background/70 p-3">
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-display text-sm font-bold">{name(x)}</span>
            <span className="text-[11px] text-muted-foreground">{t("esub.days", { n: String(x.days) })}</span>
          </div>
          <div className="space-y-0.5 text-[12px]">
            <div className="flex items-center gap-1">
              <Zap className="h-3.5 w-3.5 text-rose-400" />
              {t("esub.energy_day", { n: x.energyPerDay.toLocaleString() })}
            </div>
            {x.boxesPerDay > 0 && x.boxName && (
              <div className="flex items-center gap-1">
                {x.boxImage && <img src={x.boxImage} alt="" className="h-4 w-4 rounded object-cover" />}
                {t("esub.boxes_day", { n: String(x.boxesPerDay), box: x.boxName })}
              </div>
            )}
            {x.noDecay && (
              <div className="flex items-center gap-1">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                {t("esub.no_decay")}
              </div>
            )}
            {x.licenseTier && (
              <div className="flex items-center gap-1">
                <Landmark className="h-3.5 w-3.5 text-amber-300" />
                {t("esub.license", {
                  tier: (lang === "ru" ? licenseTier(x.licenseTier)?.ru : licenseTier(x.licenseTier)?.en) ?? "",
                })}
              </div>
            )}
          </div>
          <SubPriceButtons
            prices={x.prices}
            disabled={buy.isPending}
            onPick={(token, price) => setPick({ tier: x, token, price })}
          />
          {pick?.tier.id === x.id && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-gold/40 bg-gold/10 p-2 text-[12px]">
              <span className="min-w-0 flex-1">
                {t("esub.buy_confirm", {
                  tier: name(x),
                  price: subPriceText(pick.token, pick.price, lang),
                })}
              </span>
              <button
                type="button"
                onClick={() => buy.mutate(pick)}
                disabled={buy.isPending}
                className="inline-flex items-center gap-1 rounded-lg gradient-gold px-3 py-1.5 font-bold text-gold-foreground disabled:opacity-50"
              >
                {buy.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {t("esub.buy")}
              </button>
              <button
                type="button"
                onClick={() => setPick(null)}
                disabled={buy.isPending}
                className="rounded-lg border border-border px-3 py-1.5"
              >
                {t("esub.cancel")}
              </button>
            </div>
          )}
        </div>
      ))}
    </section>
  );
}
