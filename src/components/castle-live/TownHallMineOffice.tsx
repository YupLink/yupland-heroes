import {useTownHallPurchaseSuccess} from './TownHallPurchaseSuccess';
// Ратуша замка → «Управление шахтами» (владелец, 25.10.2026): покупается как
// Храм (§8.64) — одно на аккаунт, место в лимите зданий, оплата до постройки
// одной функцией базы. Построено — в замке иконка у «Добычи» и здание на
// площади. Карточка годится и для окна Ратуши Ангелины (renderService), и
// для старой (TownHallLegacy).
import { useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Hammer, Loader2 } from "lucide-react";
import { useT } from "@/lib/i18n";
import { humanError } from "@/lib/humanError";
import { newOpId } from "@/lib/opId";
import { TOWN_HALL_RES, type TownHallRes } from "@/lib/townHall";
import { MINE_OFFICE_KIND } from "@/lib/townHallCatalog";
import { useResources } from "@/lib/hooks/useResources";
import { buyCastleBuilding } from "@/server/api/castle-townhall/townhall-buy";
import { RES_ICON } from "./architect/architectIcons";
import { MINE_OFFICE_LOOK } from "./modularMineOffice";
import { refreshTownHall, useTownHall } from "./useTownHall";
import { refreshMineOffice } from "./useWithMineOffice";

/** Ключ данных окна Ратуши Ангелины (TownHallScreen) — тоже обновить. */
const CATALOGUE_KEY = ["townhall-catalogue-data"] as const;

function useBuyMineOffice() {
  const t = useT();
 const purchaseSuccess=useTownHallPurchaseSuccess();
  const qc = useQueryClient();
  // Ключ повтора живёт до успеха: двойной тап и обрыв связи — та же покупка.
  const op = useRef<string | null>(null);
  return useMutation({
    mutationFn: () => {
      op.current ??= newOpId();
      return buyCastleBuilding({ data: { kind: MINE_OFFICE_KIND, opId: op.current } });
    },
    onSuccess: () => {
      purchaseSuccess({kind:'building',id:'mine_office'});
      op.current = null;
      toast.success(t("mineoffice.built_toast"));
    },
    onError: (e: unknown) => toast.error(humanError(e)),
    onSettled: () => {
      refreshTownHall(qc);
      refreshMineOffice(qc);
      void qc.invalidateQueries({ queryKey: CATALOGUE_KEY });
    },
  });
}

export function TownHallMineOffice({ ru }: { ru: boolean }) {
  const t = useT();
  const q = useTownHall();
  const res = useResources().data;
  const buy = useBuyMineOffice();
  const v = q.data;
  const offer = v?.catalog.find((c) => c.kind === MINE_OFFICE_KIND);
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
      ? t("mineoffice.slot")
      : offer.problem === "level"
        ? t("mineoffice.need_level", { n: offer.needLevel })
        : null;
  return (
    <section className="town-hall-build" aria-label={t("mineoffice.title")}>
      <div className="town-hall-build__looks">
        <img className={owned ? undefined : "town-hall-build__next"} src={MINE_OFFICE_LOOK} alt="" />
      </div>
      <div className="town-hall-build__info">
        <h2>{t("mineoffice.title")}</h2>
        <p>{owned ? <b>{t("mineoffice.built")}</b> : <span>{why ?? t("mineoffice.takes_slot")}</span>}</p>
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
            {t("mineoffice.build")}
          </button>
        </>
      )}
    </section>
  );
}

