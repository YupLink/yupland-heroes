// «Открыть» мешочек или сундук за энергию (владелец, 29–30.09.2026; ПРАВИЛА
// §8.23): каждое новое открытие — новая плата (мешочек 1⚡, сундук — занятые
// ячейки, не меньше 1); цену называет сервер в ответе окна, кнопка отдаёт её
// назад — дороже сервер не спишет. Внутри входа «Положить» и «Забрать»
// бесплатны. Окно закрыли — его входы закрыты (по ключам его нажатий:
// опоздавшее закрытие не погасит вход, оплаченный новым окном), следующее
// открытие снова платное; сошёл с клетки или прошло 10 минут от нажатия —
// закрыт сервером.
//
// После открытия — энергия (шапка), окна мешочков, обычного и магического
// сундука: содержимое приходит тем же ответом. Кнопка занята, пока окно не
// перечитано (мутация ждёт перечитку); тап по ещё не перечитанному окну сервер
// и так не берёт второй раз — вход жив.
import { useEffect, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { humanError } from "@/lib/humanError";
import { newOpId } from "@/lib/opId";
import { ENERGY_KEY } from "@/lib/hooks/useEnergy";
import { closeStorage, openStorage } from "@/server/api/beta-raid/open-pass/pass";
import { BAGS_KEY, PLAIN_KEY } from "@/components/beta-raid/loot-bag/lootBagLive";
import { CHEST_NET_KEY } from "@/components/beta-raid/chest/chestLive";

/** Энергия списалась (открыть, лопата): шапка и полоса рейда — сразу. */
export function invalidateEnergy(qc: ReturnType<typeof useQueryClient>): void {
  void qc.invalidateQueries({ queryKey: ENERGY_KEY, refetchType: "all" });
}

/** Окна мешочков клетки, обычного и магического сундука — перечитать. */
function refetchWindows(qc: ReturnType<typeof useQueryClient>): Promise<unknown> {
  return Promise.all([
    qc.invalidateQueries({ queryKey: [BAGS_KEY, "at"] }),
    qc.invalidateQueries({ queryKey: [CHEST_NET_KEY] }),
    qc.invalidateQueries({ queryKey: [PLAIN_KEY], refetchType: "active" }),
  ]);
}

/**
 * Вход окна клетки. what: "bags" — окно мешочков (вход в сундук под ними оно
 * не закрывает), иначе окно сундука.
 */
export function useOpenStorage(cell: { q: number; r: number }, what: "chest" | "bags" = "chest") {
  const qc = useQueryClient();
  // Ключи нажатий окна и мешочки, которые оно открывало, — закрыть с окном.
  const ops = useRef(new Set<string>());
  const bagIds = useRef(new Set<string>());
  const open = useMutation({
    mutationFn: (v: { bagId?: string; price?: number }) => {
      const op = newOpId();
      ops.current.add(op);
      if (v.bagId) bagIds.current.add(v.bagId);
      return openStorage({ data: { q: cell.q, r: cell.r, bagId: v.bagId, op, price: v.price } });
    },
    // Содержимое приходит окнам тем же ответом: окна мешочков клетки, обычного
    // сундука и сети магического — слой карты не трогаем. Промис — кнопка
    // «Открыть» остаётся занятой, пока окно не перечитано.
    onSuccess: () => {
      invalidateEnergy(qc);
      return refetchWindows(qc);
    },
    // Отказ («цена изменилась», «подойди», сундука нет) — окно тоже перечитать.
    onError: (e: Error) => {
      toast.error(humanError(e));
      void refetchWindows(qc);
    },
  });
  const { q, r } = cell;
  const chest = what === "chest";
  useEffect(() => {
    const [mine, bags] = [ops.current, bagIds.current];
    return () => {
      if (mine.size === 0) return;
      // Вход клетки помнит только последнее нажатие — хватит сотни последних.
      const data = { q, r, bagIds: [...bags].slice(-100), chest, ops: [...mine].slice(-100) };
      void closeStorage({ data }).catch(() => {});
    };
  }, [q, r, chest]);
  return open;
}
