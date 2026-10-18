// Запись на турнир у Арены: своя запись на каждый турнир, цена — у турнира.
//
// После записи без F5: плашка сразу «Вы участвуете», плашки и таблица турнира
// перечитываются, и то, чем заплатили, — тоже (золото в шапке, энергия, лайки,
// билеты, токены, рюкзак), иначе списание выглядело бы пропажей. Отказ —
// текстом tour.err.* на языке игрока, плашки перечитываются: турнир мог уже
// начаться, закончиться, сменить цену или запись уже есть.
import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useLang, useT } from "@/lib/i18n";
import { errText } from "@/lib/tournament/errText";
import { tourEntryPriceLabel } from "@/lib/tournament/entryPrice";
import type { TourEntryPrice } from "@/lib/tournament/types";
import { RESOURCES_KEY } from "@/lib/hooks/useResources";
import { ENERGY_KEY } from "@/lib/hooks/useEnergy";
import { invalidateBackpack } from "@/lib/query";
import { joinTournament } from "@/server/api/tournament/tour-entry";
import { markJoined, type PlatesData } from "./tourJoin";

/** Перечитать то, чем платили, — и только это (лишние запросы не будим). */
function refreshPaid(qc: QueryClient, price: readonly TourEntryPrice[]): void {
  const has = (r: TourEntryPrice["resource"]) => price.some((p) => p.resource === r);
  // Шапка может быть перекрыта окном — перечитать и без подписчика.
  void qc.invalidateQueries({ queryKey: RESOURCES_KEY, refetchType: "all" });
  if (has("energy")) void qc.invalidateQueries({ queryKey: ENERGY_KEY });
  if (has("likes")) void qc.invalidateQueries({ queryKey: ["my-like-balance"] });
  if (has("tickets")) void qc.invalidateQueries({ queryKey: ["my-tickets"] });
  if (has("token")) {
    void qc.invalidateQueries({ queryKey: ["acc-balances"] });
    void qc.invalidateQueries({ queryKey: ["my-darai-balance"] });
  }
  if (has("item")) invalidateBackpack(qc);
}

export function useTourJoin(q: number, r: number) {
  const t = useT();
  const lang = useLang();
  const qc = useQueryClient();
  const platesKey = ["tour-plates", q, r] as const;

  return useMutation({
    mutationFn: (v: { id: string; price: TourEntryPrice[] }) =>
      joinTournament({ data: { q, r, id: v.id } }),
    onSuccess: (res, v) => {
      qc.setQueryData<PlatesData>(platesKey, (d) => markJoined(d, v.id));
      // Подпись — по тому, что списал сервер (цена из базы), а не по плашке.
      const price = tourEntryPriceLabel(res.price ?? v.price, lang);
      // Повтор (уже записан с другого устройства) второй раз не платит.
      toast.success(
        res.already
          ? t("tour.joined")
          : price
            ? t("tour.joined_paid", { price })
            : t("tour.joined_free"),
      );
      void qc.invalidateQueries({ queryKey: ["tour-plates"] });
      void qc.invalidateQueries({ queryKey: ["tour-table", q, r, v.id] });
      refreshPaid(qc, res.price ?? v.price);
    },
    onError: (e: Error, v) => {
      toast.error(errText(e, t));
      void qc.invalidateQueries({ queryKey: platesKey });
      // Сорванная плата откатывается на сервере — показать честный остаток.
      refreshPaid(qc, v.price);
    },
  });
}
