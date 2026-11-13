// Блок верфи в окне постройки: спуск обычного и большого корабля.
// Вынесено из BuildingExtraActions.tsx без изменения поведения — тот держит
// все постройки разом и должен оставаться в лимите ≤250 строк.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Sailboat } from "lucide-react";
import { toast } from "sonner";
import { humanError } from "@/lib/humanError";
import { useT } from "@/lib/i18n";
import { createShip } from "@/server/api/beta-raid/ship-action";
import type { BuildingExtra } from "@/lib/buildingEffect";

type ShipyardExtra = Extract<NonNullable<BuildingExtra>, { kind: "shipyard" }>;

export function ShipyardAction({
  q,
  r,
  extra,
  onDone,
}: {
  q: number;
  r: number;
  extra: ShipyardExtra;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const t = useT();

  const ship = useMutation({
    mutationFn: (kind: "small" | "big") => createShip({ data: { q, r, kind } }),
    onSuccess: (res) => {
      toast.success(
        res.kind === "big"
          ? t("braid.big_ship_launched_toast")
          : t("braid.ship_launched_toast", { n: res.paid }),
      );
      qc.invalidateQueries({ queryKey: ["beta-raid-ships"] });
      qc.invalidateQueries({ queryKey: ["my-like-balance"] });
      // Большой платит деревом и товаром — обновим ресурсы и рюкзак героя.
      qc.invalidateQueries({ queryKey: ["beta-raid-state"] });
      qc.invalidateQueries({ queryKey: ["my-game-items"] });
      onDone();
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  // Картинка кораблика над каждым ценником — те же ассеты, что видны на
  // карте (public/ships/mine.png и big-mine.png). Так глазами понятно, ЧТО
  // строим, а не только сколько это стоит.
  return (
    <div className="space-y-1.5 rounded-2xl border border-border/60 bg-secondary/20 p-3">
      <img src="/ships/mine.webp" alt="" className="mx-auto h-16 w-16 object-contain" />
      <div className="text-center text-sm">
        <b className="text-gold">{t("braid.launch_ship_for", { n: extra.priceLikes })}</b>
      </div>
      {extra.reasonKey && (
        <p className="text-center text-[11px] text-destructive">
          {t(extra.reasonKey, extra.reasonParams)}
        </p>
      )}
      <button
        type="button"
        data-build-small-ship
        onClick={() => ship.mutate("small")}
        disabled={ship.isPending || !extra.can}
        className="flex w-full items-center justify-center gap-1.5 rounded-2xl gradient-gold px-4 py-3 text-sm font-bold text-gold-foreground disabled:opacity-50"
      >
        {ship.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Sailboat className="h-4 w-4" />
        )}
        {t("braid.build_ship")}
      </button>

      {/* Большой корабль — с 3-го тира верфи. Цена деревом и товаром. */}
      {extra.bigAvailable && (
        <>
          <img
            src="/ships/big-mine.webp"
            alt=""
            className="mx-auto mt-2 h-20 w-20 object-contain"
          />
          <div className="text-center text-sm">
            <b className="text-gold">
              {t("braid.big_ship_for", { wood: extra.bigWood, item: extra.bigItemName })}
            </b>
          </div>
          {extra.bigReasonKey && (
            <p className="text-center text-[11px] text-destructive">{t(extra.bigReasonKey)}</p>
          )}
          <button
            type="button"
            onClick={() => ship.mutate("big")}
            disabled={ship.isPending || !extra.bigCan}
            className="flex w-full items-center justify-center gap-1.5 rounded-2xl border border-gold/70 bg-gold/10 px-4 py-3 text-sm font-bold text-gold disabled:opacity-50"
          >
            {ship.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sailboat className="h-4 w-4" />
            )}
            {t("braid.build_big_ship")}
          </button>
        </>
      )}
    </div>
  );
}
