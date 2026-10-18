// Таверна: меняем основного героя за лайки, не доходя до замка.
//
// Замок бесплатен, но он один и в центре карты. Здесь цена — лайки (её задаёт
// админ), зато трактир стоит там же, где идёт бой. Сколько раз в сутки трактир
// открыт, решает тир постройки: вторая — раз в сутки, улучшенная — дважды.
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Beer, Check, Loader2, Sprout, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { thumb } from "@/lib/image";
import { getTavernOffer, swapHeroInTavern } from "@/server/api/beta-raid/tavern";
import { HeroRestBadge } from "@/components/heroes/HeroRestBadge";
import { RESTING_CLASS, heroRestView } from "@/components/heroes/heroRestView";
import { metaLabel } from "@/components/heroMeta";
import { useLang, useT } from "@/lib/i18n";
import { humanError } from "@/lib/humanError";
import { invalidateHeroQueries } from "@/lib/query";
import { swapWaitParts } from "@/lib/hero/heroSwapLimit";

// Те же цвета редкости, что в остальных карточках героев.
const RARITY_COLOR: Record<string, string> = {
  rare: "#5b9bff",
  epic: "#b46bff",
  legendary: "#f5c451",
};

/**
 * Ключи, которые врут после смены героя: сам герой, его список, снаряжение,
 * состояние карты (скидка шага и обзор считаются от героя) и баланс лайков.
 * refetchType "all" — часть из них лежит в суточном persist-кэше, и без него
 * игрок увидел бы прежнего героя до перезагрузки страницы.
 */

export function TavernModal({ q, r, onClose }: { q: number; r: number; onClose: () => void }) {
  const qc = useQueryClient();
  const t = useT();
  const lang = useLang();
  const [pending, setPending] = useState<string | null>(null);
  // Часы у трактирщика идут и при открытом окне: без тикера строка «через 12
  // мин» висела бы прежней, пока игрок не закроет и не откроет таверну заново.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const offer = useQuery({
    queryKey: ["tavern-offer", q, r],
    queryFn: () => getTavernOffer({ data: { q, r } }),
    staleTime: 5_000,
    retry: false,
  });

  const swap = useMutation({
    // У спящего героя экземпляра ещё нет — его заводит сервер по шаблону.
    mutationFn: (hero: { heroId?: string; templateId?: string }) =>
      swapHeroInTavern({ data: { ...hero, q, r } }),
    onSuccess: (res) => {
      toast.success(t("braid.tavern_swapped_toast", { hero: res.heroName, n: res.paid }));
      invalidateHeroQueries(qc, ["my-like-balance", "my-energy"]);
      qc.invalidateQueries({ queryKey: ["tavern-offer", q, r] });
      qc.invalidateQueries({ queryKey: ["beta-raid-building", q, r] });
      setPending(null);
      onClose();
    },
    onError: (e: Error) => {
      toast.error(humanError(e));
      setPending(null);
    },
  });

  const data = offer.data;
  const price = data?.priceLikes ?? 0;
  const likes = data?.likes ?? 0;
  const poor = !!data && price > likes;
  const swaps = data?.swaps ?? null;
  const spent = !!swaps && swaps.left <= 0;
  const wait = swaps?.nextAt ? swapWaitParts(swaps.nextAt - now) : null;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center bg-black/75 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85dvh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl border border-gold/30 bg-background sm:max-h-[88vh] sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between p-4 pb-2">
          <div className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-gold">
            <Beer className="h-3.5 w-3.5" />
            {t("braid.tavern_title")}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            className="grid h-8 w-8 place-items-center rounded-full border border-border text-muted-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 pb-[calc(env(safe-area-inset-bottom)+84px)] sm:pb-4">
          <p className="text-[11px] text-muted-foreground">
            {t("braid.tavern_hint")} {t("braid.tavern_your_likes", { n: Math.floor(likes) })}.
          </p>

          {swaps && (
            <p
              className={cn(
                "rounded-xl border px-3 py-2 text-center text-[11px]",
                spent ? "border-destructive/40 text-destructive" : "border-border text-gold",
              )}
            >
              {t("braid.tavern_swaps_left", { n: swaps.left, max: swaps.charges })}
              {spent && wait && (
                <>
                  {" · "}
                  {wait.h > 0
                    ? t("braid.tavern_next_swap", { h: wait.h, m: wait.m })
                    : t("braid.tavern_next_swap_min", { m: wait.m })}
                </>
              )}
            </p>
          )}

          {offer.isLoading ? (
            <div className="flex h-24 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-gold" />
            </div>
          ) : (data?.heroes ?? []).length === 0 ? (
            <p className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
              {t("braid.no_heroes")}
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {(data?.heroes ?? []).map((h) => {
                // Спящий герой (нулевой уровень, экземпляра нет) опознаётся по
                // шаблону: раньше он в таверне не показывался вовсе.
                const key = h.id ?? h.templateId;
                const chosen = pending === key;
                const color = RARITY_COLOR[h.rarity] ?? "#9aa4bd";
                // Отдыхающий (снят с грядки издалека) и батрачащий основным
                // не встают — плитка выключена, как в замке.
                const rest = heroRestView(h.restUntil, now, t);
                const busy = !!h.busyField;
                return (
                  <button
                    key={key}
                    type="button"
                    disabled={h.selected || rest.resting || busy}
                    onClick={() => setPending(chosen ? null : key)}
                    className={cn(
                      "flex flex-col items-center gap-1 rounded-xl border p-2 transition disabled:opacity-60",
                      chosen ? "border-gold bg-gold/10" : "border-border hover:border-gold/40",
                      busy && "opacity-60",
                      rest.resting && RESTING_CLASS,
                    )}
                  >
                    <div
                      className="relative h-14 w-14 overflow-hidden rounded-lg bg-secondary/40"
                      style={{ boxShadow: `0 0 0 2px ${color}` }}
                    >
                      {h.imageUrl && (
                        <img
                          src={thumb(h.imageUrl, 120, "black")}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      )}
                      {h.selected && (
                        <span className="absolute bottom-0 right-0 grid h-5 w-5 place-items-center rounded-tl-lg bg-gold text-gold-foreground">
                          <Check className="h-3 w-3" />
                        </span>
                      )}
                      {busy && (
                        <span className="absolute left-0 top-0 grid h-5 w-5 place-items-center rounded-br-lg bg-emerald-500 text-black">
                          <Sprout className="h-3 w-3" />
                        </span>
                      )}
                      {rest.resting && <HeroRestBadge />}
                    </div>
                    <span className="w-full truncate text-center text-[10px] leading-tight">
                      {[h.race, h.spec]
                        .filter(Boolean)
                        .map((v) => metaLabel(v as string, lang))
                        .join(" · ") || h.name}
                    </span>
                    <span className="text-[9px] text-muted-foreground">
                      {h.selected
                        ? t("braid.tavern_current")
                        : rest.resting
                          ? rest.label
                          : busy
                            ? t("braid.hero_at_field")
                            : t("braid.hero_lvl_short", { n: h.level, max: h.maxLevel })}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {poor && (
            <p className="text-center text-[11px] text-destructive">
              {t("braid.tavern_need_likes", { n: price })}
            </p>
          )}

          <button
            type="button"
            onClick={() => {
              const h = (data?.heroes ?? []).find((x) => (x.id ?? x.templateId) === pending);
              if (h) swap.mutate(h.id ? { heroId: h.id } : { templateId: h.templateId });
            }}
            disabled={!pending || poor || spent || swap.isPending}
            className="flex w-full items-center justify-center gap-1.5 rounded-2xl gradient-gold px-4 py-3 text-sm font-bold text-gold-foreground disabled:opacity-50"
          >
            {swap.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Beer className="h-4 w-4" />
            )}
            {spent
              ? t("braid.tavern_no_swaps")
              : !pending
                ? t("braid.tavern_pick")
                : price > 0
                  ? t("braid.tavern_swap_for", { n: price })
                  : t("braid.tavern_swap_free")}
          </button>
        </div>
      </div>
    </div>
  );
}
