// Портал в окне постройки: цена прохода, требование к герою и кнопка входа.
//
// Куда именно выведет, не показываем — сеть тянется в том числе туда, где
// игрок ещё не был, и список выходов работал бы бесплатной разведкой. Видно
// только сколько выходов у сети.
//
// Дверь (сеть 0) никуда не переносит: берёт плату и пропускает. Кнопка у неё
// называется иначе — иначе игрок ждал бы прыжка, которого не будет.
//
// Портал острова новичка — выход навсегда: остров после него сносится со всем
// оставленным (владелец, 14.10.2026). Над кнопкой — одна строка об этом.
import { announceWorldArrival } from "./world-arrival/worldArrival";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { DoorOpen, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { serverErrorText } from "@/lib/serverErrorText";
import { moveBetaRaid } from "@/server/api/beta-raid/move";
import { useT } from "@/lib/i18n";
import { enterBetaPortal } from "@/server/api/beta-raid/portal-use";
import { ENERGY_KEY } from "@/lib/hooks/useEnergy";
import { RESOURCES_KEY } from "@/lib/hooks/useResources";
import { priceText } from "./portalPriceText";
import type { PortalPrice } from "@/lib/portal";
import { exitCutList } from "./island/exitCutList";

export function PortalAction({
  q,
  r,
  group,
  groupName,
  prices,
  level,
  exits,
  can,
  reasonKey,
  reasonParams,
  island = false,
  onDone,
}: {
  q: number;
  r: number;
  group: number;
  groupName: string;
  prices: PortalPrice[];
  /** Ограничение уровня строкой: «5–10», «5+», «≤ 10». */
  level: string | null;
  exits: number;
  can: boolean;
  reasonKey: string | null;
  reasonParams?: Record<string, string | number>;
  island?: boolean;
  onDone: () => void;
}) {
  const t = useT();
  const qc = useQueryClient();
  const door = group === 0;

  // Дверь проходится ШАГОМ на её клетку: плату берёт сам шаг (gate-toll), и
  // второго списания быть не может. Портал сети — своим действием.
  const go = useMutation({
    mutationFn: () =>
      door ? moveBetaRaid({ data: { q, r } }) : enterBetaPortal({ data: { q, r } }),
    onSuccess: (res) => {
      announceWorldArrival(!door && res && "map" in res ? (res.map ?? null) : null);
      toast.success(door ? t("braid.portal_passed") : t("braid.portal_jumped"));
      const cut = res && "islandCut" in res ? res.islandCut : null;
      if (cut && Object.keys(cut).length > 0)
        toast(t("island.exit_cut", { list: exitCutList(cut, t) }), { duration: 10_000 });
      // Другой этаж — другая карта: всё, что знало прежнюю (сама карта, соседи,
      // корабли, постройки), перечитываем. Карта увидит чужой id в журнале и
      // скачается целиком (useMapProgressive.catchUp).
      if (res && "map" in res && res.map) {
        void qc.invalidateQueries({
          predicate: (q) => String(q.queryKey[0] ?? "").startsWith("beta-raid"),
        });
      }
      // Позиция, ресурсы и энергия меняются разом: без этого герой оставался
      // бы на прежней клетке до перезагрузки.
      qc.invalidateQueries({ queryKey: ["beta-raid-state"] });
      qc.invalidateQueries({ queryKey: ["beta-raid-ships"] });
      qc.invalidateQueries({ queryKey: RESOURCES_KEY });
      qc.invalidateQueries({ queryKey: ENERGY_KEY });
      qc.invalidateQueries({ queryKey: ["my-like-balance"] });
      onDone();
    },
    onError: (e: Error) => toast.error(serverErrorText(e, t)),
  });

  return (
    <div className="space-y-1.5 rounded-2xl border border-border/60 bg-secondary/20 p-3">
      <div className="text-center text-sm">
        <b className="text-gold">{groupName}</b>
        {!door && (
          <span className="ml-1.5 text-[11px] text-muted-foreground">
            {t("braid.portal_exits", { n: exits })}
          </span>
        )}
      </div>

      <p className="text-center text-[11px] text-muted-foreground">
        {prices.length === 0 ? t("braid.portal_free") : priceText(prices, t)}
      </p>

      {level && (
        <p className="text-center text-[11px] text-muted-foreground">
          {t("braid.portal_level_hint", { range: level })}
        </p>
      )}

      {island && (
        <p className="text-center text-xs font-semibold text-gold">{t("island.leave_warn")}</p>
      )}

      <button
        type="button"
        onClick={() => go.mutate()}
        disabled={!can || go.isPending}
        className="flex w-full items-center justify-center gap-1.5 rounded-2xl gradient-gold px-4 py-2.5 text-sm font-bold text-gold-foreground disabled:opacity-50"
      >
        {go.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : door ? (
          <DoorOpen className="h-4 w-4" />
        ) : (
          <Sparkles className="h-4 w-4" />
        )}
        {door ? t("braid.portal_pass") : t("braid.portal_enter")}
      </button>

      {!can && reasonKey && (
        <p className="text-center text-[11px] text-muted-foreground">
          {t(reasonKey, reasonParams)}
        </p>
      )}
    </div>
  );
}
