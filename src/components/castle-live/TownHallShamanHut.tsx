import {useTownHallPurchaseSuccess} from './TownHallPurchaseSuccess';
// Ратуша замка → «Хижина шаманов» (владелец, 28.10.2026): покупается как
// «Метеостанция» — одна на аккаунт, место в лимите зданий, оплата до постройки
// одной функцией базы. Построена — в замке иконка у «Добычи» и здание на
// площади. Карточка годится и для окна Ратуши Ангелины (renderService), и для
// старой (TownHallLegacy).
import { useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Hammer, Loader2 } from "lucide-react";
import { useT } from "@/lib/i18n";
import { humanError } from "@/lib/humanError";
import { newOpId } from "@/lib/opId";
import { TOWN_HALL_RES, type TownHallRes } from "@/lib/townHall";
import { SHAMAN_HUT_KIND } from "@/lib/townHallCatalog";
import { useResources } from "@/lib/hooks/useResources";
import { buyCastleBuilding } from "@/server/api/castle-townhall/townhall-buy";
import { RES_ICON } from "./architect/architectIcons";
import { SHAMAN_HUT_LOOK } from "./modularShamanHut";
import { refreshTownHall, useTownHall } from "./useTownHall";
import { refreshShamanHut } from "./useWithShamanHut";

/** Ключ данных окна Ратуши Ангелины (TownHallScreen) — тоже обновить. */
const CATALOGUE_KEY = ["townhall-catalogue-data"] as const;

function useBuyShamanHut() {
  const t = useT();
 const purchaseSuccess=useTownHallPurchaseSuccess();
  const qc = useQueryClient();
  // Ключ повтора живёт до успеха: двойной тап и обрыв связи — та же покупка.
  const op = useRef<string | null>(null);
  return useMutation({
    mutationFn: () => {
      op.current ??= newOpId();
      return buyCastleBuilding({ data: { kind: SHAMAN_HUT_KIND, opId: op.current } });
    },
    onSuccess: () => {
      purchaseSuccess({kind:'building',id:'shaman_hut'});
      op.current = null;
      toast.success(t("shaman.built_toast"));
    },
    onError: (e: unknown) => toast.error(humanError(e)),
    onSettled: () => {
      refreshTownHall(qc);
      refreshShamanHut(qc);
      void qc.invalidateQueries({ queryKey: CATALOGUE_KEY });
    },
  });
}

export function TownHallShamanHut({ ru }: { ru: boolean }) {
  const t = useT();
  const q = useTownHall();
  const res = useResources().data;
  const buy = useBuyShamanHut();
  const v = q.data;
  const offer = v?.catalog.find((c) => c.kind === SHAMAN_HUT_KIND);
  if (q.isError && !v) {
    return (
      <section className="town-hall-build" role="alert">
        <p>{t("shaman.load_error")}</p>
        <button type="button" data-game-button="secondary" onClick={() => void q.refetch()}>
          {t("shaman.retry")}
        </button>
      </section>
    );
  }
  if (!v || !offer) {
    return (
      <section className="town-hall-build town-hall-build--loading">
        <Loader2 className="town-hall-build__spin animate-spin" aria-hidden="true" />
      </section>
    );
  }
  const owned = offer.owned > 0;
  const have: Record<string, number> = res ?? v.resources;
  const short = (k: TownHallRes) => (have[k] ?? 0) < offer.cost[k];
  const why =
    offer.problem === "slot"
      ? t("shaman.slot")
      : offer.problem === "level"
        ? t("shaman.need_level", { n: offer.needLevel })
        : null;
  return (
    <section className="town-hall-build" aria-label={t("shaman.hut")}>
      <div className="town-hall-build__looks">
        <img className={owned ? undefined : "town-hall-build__next"} src={SHAMAN_HUT_LOOK} alt="" />
      </div>
      <div className="town-hall-build__info">
        <h2>{t("shaman.hut")}</h2>
        <p>{owned ? <b>{t("shaman.built")}</b> : <span>{why ?? t("shaman.takes_slot")}</span>}</p>
      </div>
      {!owned && (
        <>
          <div className="town-hall-build__cost">
            {TOWN_HALL_RES.filter((k) => offer.cost[k] > 0).map((k) => (
              <span key={k} className={short(k) ? "town-hall-build__lack" : undefined}>
                <img src={RES_ICON[k]} alt="" />
                {offer.cost[k].toLocaleString(ru ? "ru-RU" : "en-US")}
              </span>
            ))}
          </div>
          <button
            type="button"
            className="town-hall-build__go"
            disabled={buy.isPending || offer.problem !== null || TOWN_HALL_RES.some(short)}
            onClick={() => buy.mutate()}
          >
            {buy.isPending ? (
              <Loader2 className="town-hall-build__spin animate-spin" />
            ) : (
              <Hammer aria-hidden="true" />
            )}
            {t("shaman.build")}
          </button>
        </>
      )}
    </section>
  );
}

