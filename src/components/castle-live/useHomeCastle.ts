// Вход в замок (владелец, 07.10.2026): у любого замка или ратуши на карте мира;
// своим делать не обязательно — «Сделать основным» отдельной кнопкой (первый
// раз бесплатно, дальше 5 билетов). Не у замка — «Герой не в замке».
// Статус спрашиваем свежим в момент нажатия: герой мог уйти.
import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getHomeCastle, setHomeCastle, type HomeCastleStatus } from "@/server/api/beta-raid/home-castle";
import { humanError } from "@/lib/humanError";
import { newOpId } from "@/lib/opId";
import { TICKETS_KEY } from "@/lib/hooks/useTickets";

export const HOME_CASTLE_KEY = ["home-castle"] as const;

export function useHomeCastle(ru: boolean, onEnter: () => void) {
  const qc = useQueryClient();
  const status = useQuery({ queryKey: HOME_CASTLE_KEY, queryFn: () => getHomeCastle(), staleTime: 0 });
  // Предложение переселиться: место и цена — из свежего статуса.
  const [offer, setOffer] = useState<HomeCastleStatus | null>(null);
  const [checking, setChecking] = useState(false);

  const entering = useRef(false);
  const tryEnter = async (target?: { q: number; r: number }): Promise<boolean> => {
    if (entering.current) return false;
    entering.current = true;
    setChecking(true);
    try {
      const result = await status.refetch();
      if (result.isError) throw result.error;
      const s = result.data;
      if (!s) throw new Error(ru ? "Не удалось проверить, где герой" : "Could not check where your hero is");
      // Войти можно у ЛЮБОГО замка или ратуши — своим делать не обязательно
      // (владелец, 07.10.2026); основной — по кнопке «Сделать основным».
      if (s.here && (!target || (s.here.q === target.q && s.here.r === target.r))) {
        onEnter();
        return true;
      }
      toast.error(
        ru
          ? `Герой не в замке. Основной замок — ${s.home.name} (${s.home.q}, ${s.home.r})`
          : `Your hero is not at the castle. Main castle: ${s.home.name} (${s.home.q}, ${s.home.r})`,
      );
    } catch (e) {
      toast.error(humanError(e as Error));
    } finally {
      entering.current = false;
      setChecking(false);
    }
    return false;
  };

  const relocate = useMutation({
    mutationFn: () => setHomeCastle({ data: { opId: newOpId() } }),
    onSuccess: (res) => {
      setOffer(null);
      toast.success(
        ru
          ? `${res.home.name} — теперь твой основной замок${res.cost ? ` · −${res.cost} билетов` : ""}`
          : `${res.home.name} is now your main castle${res.cost ? ` · −${res.cost} tickets` : ""}`,
      );
      void qc.invalidateQueries({ queryKey: HOME_CASTLE_KEY });
      void qc.invalidateQueries({ queryKey: TICKETS_KEY, refetchType: "all" });
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  /** Предложить сделать основным замок, у которого стоит герой. */
  const offerMain = () => {
    if (status.data?.here && !status.data.atHome) setOffer(status.data);
  };

  return { status, tryEnter, checking, offer, offerMain, closeOffer: () => setOffer(null), relocate };
}
