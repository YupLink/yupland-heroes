// Действия админа над клеткой, которые НЕ ложатся в очередь правок карты.
//
// Слои клетки (декор, объект, постройка, тир, живость, настройки) копятся в
// очереди и уходят по «Выгрузить». Здесь то, что живёт в СВОИХ таблицах и
// применяется сразу: корабль (beta_raid_ship) и беглец (beta_raid_runner).
// Рисуются они до ответа сервера: ждать полный перезапрос ради одной иконки —
// это те самые «ставится очень долго».
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { humanError } from "@/lib/humanError";
import { useLang } from "@/lib/i18n";
import { godText } from "./adminCellText";
import { adminPlaceShip, adminRemoveShip } from "@/server/api/beta-raid/admin-live-ship";
import { adminRemoveRunner } from "@/server/api/beta-raid/admin-runner";
import { applyShipDeltas, type ShipsData } from "./patchShipsCache";
import { patchMapCache, type MapLike } from "./patchMapCache";

/** Что делает админ с судном на клетке: поставить малый/большой или убрать.
 *  При удалении kind опционален — «убрать» универсальна и сносит любой
 *  свободный корабль (жалоба владельца: «нельзя удалить большой корабль
 *  кнопкой»). Для постановки kind обязателен. */
export type ShipAct = { place: true; kind: "small" | "big" } | { place: false; kind?: "small" | "big" };

export function useAdminCellActions(q: number, r: number) {
  const qc = useQueryClient();
  const t = godText(useLang());

  /** Судно на клетке: показываем сразу, откатываем, если сервер отказал. */
  const bump = (delta: 1 | -1, big?: boolean) =>
    qc.setQueryData(["beta-raid-ships"], (old: unknown) =>
      applyShipDeltas(old as ShipsData, [{ q, r, ships: delta, big }]),
    );

  const ship = useMutation({
    mutationFn: async (arg: ShipAct) => {
      const { place, kind } = arg;
      // При постройке большого сразу помечаем клетку big=true — без этого
      // рисунок судна отставал бы до ответа сервера. При удалении флаг
      // ставит уже ответ (remainingBig): здесь мы не знаем, остался ли на
      // клетке ещё один большой.
      bump(place ? 1 : -1, place && kind === "big" ? true : undefined);
      try {
        if (place) {
          await adminPlaceShip({ data: { q, r, kind } });
          toast.success(kind === "big" ? t.bigShipPlaced : t.shipPlaced);
        } else {
          // Сервер знает, ЧТО удалить: если не передать kind — снесётся первое
          // попавшееся. Особенно грабельно с большим: админ жал «убрать
          // большой», а падал малый, а «попытка ещё раз» упиралась в занятого
          // хозяина большого — до перезагрузки не отпускало.
          const res = await adminRemoveShip({ data: { q, r, kind } });
          // Пост-состояние клетки: остался ли на ней ещё большой. Проставляем
          // явно — оптимистичный bump знал только про счётчик и мог оставить
          // фантом-иконку большого после удаления единственного большого.
          qc.setQueryData(["beta-raid-ships"], (old: unknown) =>
            applyShipDeltas(old as ShipsData, [{ q, r, big: res.remainingBig }]),
          );
          toast.success(t.shipRemoved);
        }
      } catch (e) {
        bump(place ? -1 : 1);
        toast.error(humanError(e as Error));
      }
    },
  });

  /**
   * Убрать беглеца. Он не слой клетки (server runners.ts), поэтому идёт мимо
   * очереди правок — и с карты снимается сразу, не дожидаясь своего же события
   * (его автору сервер не шлёт).
   */
  const runner = useMutation({
    mutationFn: async () => {
      await adminRemoveRunner({ data: { q, r } });
      qc.setQueryData(["beta-raid-map"], (old: MapLike) =>
        patchMapCache(old, { q, r, objectId: null, runner: false }),
      );
      toast.success(t.runnerRemoved);
    },
    onError: (e) => toast.error(humanError(e as Error)),
  });

  const busy = ship.isPending || runner.isPending;
  return { ship, runner, busy };
}
