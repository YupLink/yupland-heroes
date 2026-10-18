// Сундуки: кнопка на главной, инвентарь, магазин, модалка награды.

import { useState, type RefObject } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Box, Star, X } from "lucide-react";
import { ChipImage, chipPanelClasses } from "@/components/ChipImage";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { openHallwayChest, getHallwayStarOffers, createHallwayChipInvoice } from "@/server/api/hallway";
import { humanError } from "@/lib/humanError";

const STAR_LABEL = (s: number) => (s === 1 ? "1★" : `${s}★`);

// ── Кнопка «Открыть сундук» на главной вкладке ──
export function HomeChestButton({
  awareness,
  chestPrice,
  chipsUnlocked,
  chipUnlockLevel,
  openPending,
  onOpen,
  chestRef,
}: {
  awareness: number;
  chestPrice: number;
  chipsUnlocked: boolean;
  chipUnlockLevel: number;
  openPending: boolean;
  onOpen: () => void;
  chestRef: RefObject<HTMLButtonElement>;
}) {
  const t = useT();
  return (
    <button
      ref={chestRef}
      type="button"
      onClick={onOpen}
      disabled={openPending || awareness < chestPrice}
      className={cn(
        "flex w-full items-center gap-3 rounded-2xl border p-4 text-left transition",
        awareness < chestPrice
          ? "border-border bg-secondary/30 opacity-60"
          : "border-gold/30 bg-card/60 hover:border-gold/50"
      )}
    >
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gold/10 text-gold">
        {openPending ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <Box className="h-6 w-6" />
        )}
      </span>
      <div className="flex-1">
        <div className="text-sm font-bold">{t("hallway.chest_open")}</div>
        <div className="text-xs text-muted-foreground">
          {chipsUnlocked
            ? t("hallway.chest_desc_unlocked")
            : t("hallway.chest_desc_locked", { lvl: chipUnlockLevel })}
        </div>
      </div>
      <span className="shrink-0 rounded-lg bg-gold/15 px-2.5 py-1 text-sm font-bold text-gold">
        {chestPrice}
      </span>
    </button>
  );
}

// ── Вкладка «Инвентарь» — все тренировочные фишки ──
export function InventoryTab({
  chipCount,
  chipUnlockLevel,
  topChipCount,
  pendingChests,
  chipsByStar,
  chipImages,
  openPendingPending,
  onOpenPending,
}: {
  chipCount: number;
  chipUnlockLevel: number;
  topChipCount: number;
  pendingChests: number;
  chipsByStar: Record<string, number>;
  chipImages?: Record<string, string>;
  openPendingPending: boolean;
  onOpenPending: () => void;
}) {
  const t = useT();
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-bold">{t("hallway.inventory_title")}</h2>
        <span className="text-xs text-muted-foreground">
          {t("hallway.chips_summary_top10", { count: chipCount })}
        </span>
      </div>
      {/* Неоткрытые сундуки — юзер открывает сам, по одному */}
      {pendingChests > 0 && (
        <button
          type="button"
          onClick={onOpenPending}
          disabled={openPendingPending}
          className="flex w-full items-center gap-3 rounded-2xl border border-gold/40 bg-gold/5 p-4 text-left transition hover:border-gold/60 disabled:opacity-60"
        >
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gold/15 text-gold">
            {openPendingPending ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Box className="h-6 w-6" />
            )}
          </span>
          <div className="flex-1">
            <div className="text-sm font-bold">
              {t("hallway.chests_count", { count: pendingChests })}
            </div>
            <div className="text-xs text-muted-foreground">
              {t("hallway.chests_desc")}
            </div>
          </div>
          <span className="shrink-0 rounded-lg gradient-gold px-3 py-1.5 text-sm font-bold text-gold-foreground">
            {t("hallway.open")}
          </span>
        </button>
      )}
      {chipCount === 0 ? (
        <div className="rounded-2xl border border-border bg-card/60 p-6 text-center text-sm text-muted-foreground">
          {t("hallway.chips_empty_full", { lvl: chipUnlockLevel })}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {[3, 2.5, 2, 1.5, 1].map((star) => {
            const n = chipsByStar[String(star)] ?? 0;
            if (n === 0) return null;
            return (
              <div
                key={star}
                className={cn(
                  "overflow-hidden rounded-2xl p-2 backdrop-blur",
                  chipPanelClasses(star)
                )}
              >
                <ChipImage
                  src={chipImages?.[String(star)] ?? ""}
                  level={star}
                  alt={STAR_LABEL(star)}
                  className="w-full"
                />
                <div className="mt-1.5 text-center text-xs font-semibold text-muted-foreground">
                  × {n}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <p className="text-center text-[11px] leading-relaxed text-muted-foreground">
        {t("hallway.inventory_goal")}
      </p>
    </div>
  );
}

// Карточка «Купить фишки за ⭐» (Telegram Stars). Оплата открывается через
// WebApp.openInvoice; фишки выдаёт ВЕБХУК (successful_payment), клиентский
// статус — только для UX. После оплаты поллим состояние прихожи.
export function HallwayStarShop() {
  const t = useT();
  const qc = useQueryClient();
  // Ревил выданных фишек (звёздности) — модалка «что выпало».
  const [reveal, setReveal] = useState<number[] | null>(null);
  const offers = useQuery({
    queryKey: ["hallway-star-offers"],
    queryFn: () => getHallwayStarOffers(),
    staleTime: 300_000,
  });
  const buy = useMutation({
    mutationFn: (offerId: string) =>
      createHallwayChipInvoice({ data: { offerId } }),
    onSuccess: (r) => {
      // ТЕСТ: оффер за 0⭐ → фишки уже выданы на сервере, инвойса нет.
      // Показываем РЕВИЛ — что именно выпало (звёздности), а не просто тост.
      if ("free" in r && r.free) {
        setReveal(r.stars ?? []);
        qc.invalidateQueries({ queryKey: ["hallway-state"] });
        return;
      }
      const tg = (
        window as unknown as {
          Telegram?: {
            WebApp?: {
              version?: string;
              isVersionAtLeast?: (v: string) => boolean;
              openInvoice?: (url: string, cb: (status: string) => void) => void;
            };
          };
        }
      ).Telegram?.WebApp;
      // openInvoice есть как функция даже на неподдерживающем клиенте, но БРОСАЕТ
      // WebAppMethodUnsupported при вызове (нужен Telegram 6.1+, только внутри
      // приложения Telegram — не в браузере/старом вебвью). Проверяем ВЕРСИЮ.
      const canInvoice =
        !!tg &&
        typeof tg.openInvoice === "function" &&
        typeof tg.isVersionAtLeast === "function" &&
        tg.isVersionAtLeast("6.1");
      if (!canInvoice) {
        toast.error(t("hallway.toast_stars_only_tg"));
        return;
      }
      try {
        tg!.openInvoice!(r.link, (status: string) => {
        if (status === "paid") {
          toast.success(t("hallway.toast_payment_ok"));
          // Фишки выдаёт вебхук асинхронно → поллим состояние прихожи.
          setTimeout(() => qc.invalidateQueries({ queryKey: ["hallway-state"] }), 1500);
          setTimeout(() => qc.invalidateQueries({ queryKey: ["hallway-state"] }), 4000);
          setTimeout(() => qc.invalidateQueries({ queryKey: ["hallway-state"] }), 8000);
          } else if (status === "failed") {
            toast.error(t("hallway.toast_payment_failed"));
          }
          // cancelled / pending — молча
        });
      } catch {
        toast.error(t("hallway.toast_stars_unavailable"));
      }
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  const enabled = offers.data?.enabled ?? false;
  const list = offers.data?.offers ?? [];
  if (list.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card/60 p-6 text-center text-sm text-muted-foreground">
        {t("hallway.shop_coming_soon")}
      </div>
    );
  }
  return (
    <>
    <div className="rounded-2xl border border-gold/25 bg-card/60 p-4">
      <div className="space-y-2">
        {list.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => enabled && buy.mutate(o.id)}
            disabled={!enabled || buy.isPending}
            className={cn(
              "flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left transition",
              enabled
                ? "border-gold/30 bg-gold/5 hover:border-gold/50"
                : "cursor-not-allowed border-border bg-secondary/20 opacity-70"
            )}
          >
            <span className="min-w-0 text-sm font-semibold">
              {o.title}
              <span className="ml-1 text-xs font-normal text-muted-foreground">
                {o.kind === "random" ? t("hallway.offer_random") : t("hallway.offer_count", { count: o.count })}
              </span>
            </span>
            <span
              className={cn(
                "shrink-0 rounded-lg px-2.5 py-1 text-sm font-bold",
                enabled ? "bg-gold/15 text-gold" : "bg-secondary/40 text-muted-foreground"
              )}
            >
              {enabled ? `${o.priceStars} ⭐` : t("hallway.soon")}
            </span>
          </button>
        ))}
      </div>
    </div>

    {/* Ревил выданных фишек — что выпало (звёздности) */}
    {reveal !== null && (
      <div
        className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4 backdrop-blur-md"
        onClick={() => setReveal(null)}
      >
        <div
          className="relative w-full max-w-sm rounded-3xl border border-gold/40 bg-card/95 p-5 text-center backdrop-blur-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => setReveal(null)}
            className="absolute right-3 top-3 rounded-full bg-background/70 p-1 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="font-display text-xl font-bold text-gold">
            {t("hallway.reveal_title")}
          </div>
          <p className="mb-3 mt-0.5 text-xs text-muted-foreground">
            {t("hallway.reveal_count", { count: reveal.length })}
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {reveal.map((star, i) => (
              <div key={i} className="w-16 animate-count-pop">
                <ChipImage src="" level={star} className="w-16" />
                <div className="mt-0.5 text-center text-[11px] font-bold text-gold">
                  {star}★
                </div>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setReveal(null)}
            className="mt-4 w-full rounded-xl gradient-gold py-2.5 text-sm font-bold text-gold-foreground shadow-gold"
          >
            {t("hallway.claim")}
          </button>
        </div>
      </div>
    )}
    </>
  );
}

// ── Модалка награды сундука ──
export function RewardModal({
  reward,
  onClose,
}: {
  reward: Record<string, unknown>;
  onClose: () => void;
}) {
  const t = useT();
  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <div className="w-full max-w-xs rounded-2xl border border-gold/40 bg-card p-6 text-center">
        <Star className="mx-auto mb-2 h-8 w-8 text-gold" />
        <div className="text-lg font-bold">
          {reward.kind === "chip"
            ? t("hallway.reward_chip", { star: STAR_LABEL(Number(reward.star)) })
            : reward.kind === "premium_exp"
              ? t("hallway.reward_premium_exp", { amount: reward.amount as number })
              : reward.kind === "exp"
                ? `+${reward.amount} EXP`
                : t("hallway.reward_awareness", { amount: reward.amount as number })}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full rounded-xl bg-gold/15 py-2 text-sm font-bold text-gold"
        >
          {t("hallway.ok")}
        </button>
      </div>
    </div>
  );
}
