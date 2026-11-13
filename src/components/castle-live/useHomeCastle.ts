// Вход в замок (владелец, 07.10.2026): у любого замка или ратуши на карте мира;
// своим делать не обязательно — «Сделать основным» отдельной кнопкой (первый
// раз бесплатно, дальше 2 500 золота, §8.61). Не у замка — «Герой не в замке».
// Статус спрашиваем свежим в момент нажатия: герой мог уйти.
import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getHomeCastle, setHomeCastle, type HomeCastleStatus } from "@/server/api/beta-raid/home-castle";
import { humanError } from "@/lib/humanError";
import { newOpId } from "@/lib/opId";
import { RESOURCES_KEY } from "@/lib/hooks/useResources";

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
    mutationFn: async () => {
      const target = offer?.here;
      if (!target) throw new Error(ru ? "Выбери ратушу заново" : "Select the town hall again");
      const result = await status.refetch();
      if (result.isError) throw result.error;
      const fresh = result.data;
      if (!fresh || fresh.island || fresh.away || !fresh.here ||
          fresh.here.kind !== target.kind || fresh.here.q !== target.q || fresh.here.r !== target.r)
        throw new Error(ru ? "Герой уже не у выбранной ратуши" : "Your hero is no longer at the selected town hall");
      return setHomeCastle({ data: { opId: newOpId() } });
    },
    onSuccess: (res) => {
      setOffer(null);
      toast.success(
        ru
          ? `${res.home.name} — теперь твой основной замок${res.cost ? ` · −${res.cost.toLocaleString("ru-RU")} золота` : ""}`
          : `${res.home.name} is now your main castle${res.cost ? ` · −${res.cost.toLocaleString("en-US")} gold` : ""}`,
      );
      void qc.invalidateQueries({ queryKey: HOME_CASTLE_KEY });
      void qc.invalidateQueries({ queryKey: RESOURCES_KEY, refetchType: "all" });
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  /** Open the existing confirmation only for the town hall selected in the map card. */
  const offerMainAt = async (q: number, r: number) => {
    try {
      const result = await status.refetch();
      if (result.isError) throw result.error;
      const fresh = result.data;
      if (!fresh) throw new Error(ru ? "Не удалось проверить, где герой" : "Could not check where your hero is");
      // The server moves home to the hero's current place, not to a client-supplied cell.
      if (fresh.island || fresh.away || !fresh.here || fresh.here.kind !== "town" ||
          fresh.here.q !== q || fresh.here.r !== r ||
          (fresh.home.kind === "town" && fresh.home.q === q && fresh.home.r === r)) return;
      setOffer(fresh);
    } catch (e) {
      toast.error(humanError(e as Error));
    }
  };

  return { status, tryEnter, checking, offer, offerMainAt, closeOffer: () => setOffer(null), relocate };
}
