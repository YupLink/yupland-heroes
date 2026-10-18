// Посадка на борт и сход на берег: мутации окна корабля.
//
// Вынесено из ShipModal — там осталась разметка. Правка кэша живёт здесь же:
// сервер возвращает и новую клетку героя, и списанную энергию, так что
// перезапрашивать карту незачем.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { serverErrorText } from "@/lib/serverErrorText";
import { useT } from "@/lib/i18n";
import { boardShip, leaveShip } from "@/server/api/beta-raid/ship-action";
import { applyShipDeltas, type ShipCellDelta, type ShipsData } from "./patchShipsCache";
import { makeStepCache } from "./stepCache";

export function useShipBoard({
  q,
  r,
  shipId,
  onClose,
}: {
  q: number;
  r: number;
  /** Выбранный борт: на клетке их бывает несколько. */
  shipId: string | null;
  onClose: () => void;
}) {
  const t = useT();
  const qc = useQueryClient();
  /**
   * Что изменилось после посадки или схода — правим в кэше, не перезапрашивая.
   *
   * Раньше здесь стояли четыре инвалидации, хотя сервер вернул в ответе всё:
   * куда встал герой и сколько списал. Раскладка игроков среди них была лишней
   * вдвойне — своего кошелька и сестёр в ней нет вовсе (players.ts), то есть
   * четыре похода в БД перечитывали данные, которые от нашего действия не
   * менялись. Судьёй по-прежнему остаётся сервер: числа берём из его ответа.
   */
  const cache = makeStepCache(qc);
  const done = (to: { q: number; r: number }, spent: number, fleet: ShipCellDelta) => {
    cache.applyStep(to.q, to.r, spent);
    qc.setQueryData(["beta-raid-ships"], (old: unknown) =>
      applyShipDeltas(old as ShipsData, [fleet]),
    );
    onClose();
  };

  const board = useMutation({
    mutationFn: () => boardShip({ data: { q, r, shipId } }),
    onSuccess: (res) => {
      toast.success(t("braid.ship_aboard_toast", { n: res.spent }));
      // Судов на причале столько же, занятых на одно больше — и одно наше.
      // Вид посаженного судна ставит сервер (res.big): без него на смешанной
      // клетке mineBig оставался прежним, и цена гребка на клиенте расходилась
      // с той, что списывал сервер.
      done(res, res.spent, {
        q,
        r,
        busy: 1,
        mine: true,
        big: res.big ? true : undefined,
        mineBig: !!res.big,
      });
    },
    onError: (e: Error) => toast.error(serverErrorText(e, t)),
  });

  const leave = useMutation({
    mutationFn: () => leaveShip(),
    onSuccess: (res) => {
      toast.success(t("braid.ship_ashore_toast", { n: res.spent }));
      // Судно осталось у берега и снова свободно — и уже не наше.
      done(res, res.spent, { q, r, busy: -1, mine: false, mineBig: false });
    },
    onError: (e: Error) => toast.error(serverErrorText(e, t)),
  });

  return { board, leave };
}
