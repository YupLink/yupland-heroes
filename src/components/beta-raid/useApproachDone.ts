import { useEffect, useRef } from "react";
import { createRouteLifetime } from "./routeLifetime";
// «Дойти и сделать»: что происходит, когда герой добрался до цели маршрута.
//
// Тап по дальнему объекту — это одно действие, а не два: игрок подтверждает
// общую цену, а по прибытии постройка открывается сама, лут забирается сам.
// Вынесено из BetaRaidScreen, чтобы экран остался оркестратором (§13.6).
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useT } from "@/lib/i18n";
import { readCellDetails, type MapLike } from "./patchMapCache";
import type { Cell } from "./unpackMap";
import type { PendingAction } from "./useBetaMovement";
import type { ShipMark } from "./useShips";
import { shovelOffer } from "./tool/shovelOffer";

type ObjectInfo = {
  id: string;
  name: string;
  imageUrl: string | null;
  meta: unknown;
  kind: string | null;
};

export function useApproachDone(opts: {
  /** Снимок карты на момент постройки маршрута — запасной источник, см. ниже. */
  cells: Record<string, Cell>;
  objects: Record<string, ObjectInfo> | undefined;
  pendingPath: Array<{ q: number; r: number; cost: number }> | null;
  pendingAction: PendingAction | null;
  /** Возвращает true, только если дошли до конца маршрута. */
  moveAlongPath: (path: Array<{ q: number; r: number; cost: number }>) => Promise<boolean>;
  openBuilding: (cell: { q: number; r: number }) => void;
  interact: (obj: { id: string; meta: unknown; kind: string | null; q: number; r: number }) => void;
  /** Дошли до декора со взаимодействием (useDecorInteract.arrive). */
  onDecor?: (q: number, r: number) => void;
  /** Причалы и окно корабля: дошли до разбитого — открываем его с починкой. */
  ships?: ReadonlyMap<string, ShipMark>;
  openShip?: (ship: { q: number; r: number; mark: ShipMark }) => void;
}) {
  const { cells, objects, pendingPath, pendingAction, moveAlongPath, openBuilding, interact } =
    opts;
  const qc = useQueryClient();
  const t = useT();

  const lifetime = useRef(createRouteLifetime()).current;
  useEffect(() => {
    lifetime.mount();
    return () => lifetime.unmount();
  }, [lifetime]);
  return async () => {
    if (!pendingPath) return;
    const token = lifetime.begin();
    if (token === null) return;
    try {
      const action = pendingAction;
      // Маршрут мог оборваться на полпути (сервер отказал, кончилась энергия).
      // Тогда герой стоит не у цели, и бить по ней всё равно — это удар из-за
      // угла: сервер откажет, а игрок увидит ошибку на ровном месте.
      const arrived = await moveAlongPath(pendingPath);
      if (!arrived || !action || !lifetime.valid(token)) return;
      // Постройка — единственный случай окна; бой и сбор идут через interact.
      if (action.kind === "build") {
        openBuilding({ q: action.q, r: action.r });
        return;
      }
      if (action.kind === "decor") {
        opts.onDecor?.(action.q, action.r);
        return;
      }
      // «Копать / Закопать / Выкопать · N шагов» (§8.24): дело лопаты по приходу.
      if (action.kind === "dig") {
        shovelOffer.arrive({ q: action.q, r: action.r });
        return;
      }
      if (action.kind === "ship") {
        const mark = opts.ships?.get(`${action.q},${action.r}`);
        if (mark) opts.openShip?.({ q: action.q, r: action.r, mark });
        else toast(t("braid.target_gone"));
        return;
      }
      // Клетку читаем ЗАНОВО, а не из снимка `cells`: тот замер сделан, когда
      // игрок только подтверждал маршрут, и за дорогу успевает устареть — цель
      // могла убежать (сервер flee-move уводит её от подошедшего вплотную) или
      // её мог забрать сосед. По старому снимку мы били бы в пустое место и
      // показывали игроку «Объект не найден».
      //
      // Кэш карты к этому моменту уже знает о побеге: его правит ответ самого
      // шага (useBetaMovement → applyFled), а не только живой поток. Снимок
      // остаётся запасным ответом на случай, если карты в кэше нет вовсе.
      const map = qc.getQueryData(["beta-raid-map"]) as MapLike;
      const objectId = map
        ? readCellDetails(map, action.q, action.r).objectId
        : (cells[`${action.q},${action.r}`]?.objectId ?? null);
      const objNow = objectId ? objects?.[objectId] : undefined;
      if (!objNow) {
        // Молчать нельзя: игрок потратил энергию на дорогу и обязан понять, куда
        // делась цель. Почему её нет — уже не важно: убежала или её забрали.
        toast(t("braid.target_gone"));
        return;
      }
      interact({
        id: objNow.id,
        meta: objNow.meta,
        kind: objNow.kind ?? null,
        q: action.q,
        r: action.r,
      });
    } finally {
      lifetime.finish();
    }
  };
}
