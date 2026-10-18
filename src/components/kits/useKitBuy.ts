// Покупка набора: ключ нажатия, тост и ВСЁ, что покупка меняет, — сразу, без
// перезагрузки: витрина (остаток тиража, мой лимит, цены по курсу), подарки
// (кружок на карте и окно «Подарки» в замке), деньги счёта.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { humanError } from "@/lib/humanError";
import { newOpId } from "@/lib/opId";
import { ACC_BALANCES_KEY } from "@/lib/hooks/useAccountBalances";
import { buyKit } from "@/api";
import type { KitToken } from "@/lib/kits";

/** Ключ витрины. Новый: у ответа новая форма, суточный кэш старой не нужен. */
export const KITS_KEY = ["kit-shop"] as const;

/** Что игрок видел на карточке: сервер сверит цену, бокс и количество. */
export type KitPick = {
  kitId: string;
  token: KitToken;
  price: number;
  boxId: string;
  boxCount: number;
};

const TOUCHED: ReadonlyArray<readonly string[]> = [
  KITS_KEY,
  ["my-gifts"],
  ACC_BALANCES_KEY,
  ["my-darai-balance"],
];

export function useKitBuy(onDone: () => void) {
  const t = useT();
  const qc = useQueryClient();
  return useMutation({
    // Ключ — один на нажатие «Купить»: повтор того же запроса не спишет дважды.
    // expected, бокс и количество — что игрок видел: набор поменялся — откажет.
    mutationFn: (p: KitPick) =>
      buyKit({
        data: {
          kitId: p.kitId,
          token: p.token,
          expected: p.price,
          boxId: p.boxId,
          boxCount: p.boxCount,
          opId: newOpId(),
        },
      }),
    onSuccess: () => {
      toast.success(t("kits.done"));
      onDone();
    },
    onError: (e: Error) => {
      toast.error(humanError(e));
      onDone();
    },
    // И при отказе: «распродано» и «цена изменилась» лечатся свежей витриной.
    onSettled: () => {
      for (const key of TOUCHED) {
        void qc.invalidateQueries({ queryKey: [...key], refetchType: "all" });
      }
    },
  });
}
