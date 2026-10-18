// Постройка «Забвение»: заплатил — получил эффект «Забвение».
//
// Что выдаёт (уровень или время) и почём — из настройки клетки
// (oblivion-extra.ts). Цена стоит прямо на кнопке: «Получить забвение · 50 золота».
// Эффект после покупки виден сразу: значок над героем и «Забыть» в книге читают
// ключ "my-oblivion" из HERO_QUERY_KEYS, балансы — свои ключи ниже.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BookMinus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { takeOblivion } from "@/api";
import { serverErrorText } from "@/lib/serverErrorText";
import { useLang, useT } from "@/lib/i18n";
import { newOpId } from "@/lib/opId";
import { invalidateHeroQueries } from "@/lib/query";
import { oblivionText } from "@/lib/hero/boostOblivion";
import type { OblivionExtra } from "@/lib/oblivionConfig";
import { priceText } from "@/components/beta-raid/portalPriceText";

/** Чем бы ни платили: счёт, ресурсы, лайки, билеты, энергия (товар — в HERO-ключах). */
const BALANCES = ["acc-balances", "my-resources", "my-like-balance", "my-tickets", "my-energy"];

export function OblivionAction({
  q,
  r,
  extra,
  onDone,
}: {
  q: number;
  r: number;
  extra: OblivionExtra;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const t = useT();
  const lang = useLang() === "en" ? "en" : "ru";
  const prices = Array.isArray(extra.prices) ? extra.prices : [];
  const cost = prices.length > 0 ? priceText(prices, t) : null;

  const take = useMutation({
    // Ключ нажатия свой на каждое нажатие: повтор моста не спишет второй раз.
    mutationFn: () => takeOblivion({ data: { q, r, op: newOpId() } }),
    onSuccess: (res) => {
      if (!res.repeat) {
        toast.success(t("oblivion.got", { what: oblivionText(res.level, res.minutes, lang) }));
      }
      invalidateHeroQueries(qc, BALANCES);
      void qc.invalidateQueries({ queryKey: ["beta-raid-building", q, r] });
      onDone();
    },
    // Отказы сервер шлёт ключами (и «ключ|{…}» с подстановкой) — на языке игрока.
    onError: (e: Error) => toast.error(serverErrorText(e, t)),
  });

  return (
    <div className="space-y-2 rounded-2xl border border-border/60 bg-secondary/20 p-3">
      <div className="flex items-center justify-center gap-1.5 text-sm">
        <BookMinus className="h-4 w-4 shrink-0 text-gold" />
        <b className="text-gold">{oblivionText(extra.level, extra.minutes, lang)}</b>
      </div>

      {extra.reasonKey && (
        <p className="text-center text-[11px] text-destructive">
          {t(extra.reasonKey, extra.reasonParams)}
        </p>
      )}

      <button
        type="button"
        onClick={() => take.mutate()}
        disabled={take.isPending || !extra.can}
        className="flex w-full items-center justify-center gap-1.5 rounded-2xl gradient-gold px-4 py-3 text-sm font-bold text-gold-foreground disabled:opacity-50"
      >
        {take.isPending ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
        ) : (
          <BookMinus className="h-4 w-4 shrink-0" />
        )}
        <span className="min-w-0 break-words">
          {cost ? `${t("oblivion.take")} · ${cost}` : t("oblivion.take")}
        </span>
      </button>
    </div>
  );
}
