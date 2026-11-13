// Выброс из рюкзака: какой ВИД выбрасывают и сколько. Спрашиваем не только
// «точно?», но и «сколько»: стек занимает несколько ячеек, и урна на ячейке
// раньше уносила весь вид целиком. Вынесено из BackpackGrid.tsx (лимит строк).
import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { humanError } from "@/lib/humanError";
import { useT } from "@/lib/i18n";
import { newOpId } from "@/lib/opId";
import { formatQty } from "@/lib/formatQty";
import { invalidateBackpack } from "@/lib/query";
import { invalidateBags } from "@/components/beta-raid/loot-bag/lootBagLive";
import { discardBackpackStack } from "@/server/api/beta-raid/market-backpack-read";

export function useBackpackDiscard(guard: () => void) {
  const t = useT();
  const qc = useQueryClient();
  const [discarding, setDiscarding] = useState<string | null>(null);
  // Ключ нажатия — один на окно выброса: повтор после обрыва не выбросит дважды.
  const discardOp = useRef(newOpId());
  // Выброшенное падает мешочком на клетке героя (§8.21): слой мешочков — сразу.
  const discard = useMutation({
    mutationFn: (v: { stackKey: string; qty: number }) => {
      guard();
      return discardBackpackStack({ data: { ...v, op: discardOp.current } });
    },
    onSuccess: (res) => {
      if (res.put > 0) toast.success(t("bag.discarded", { n: formatQty(res.put) }));
      else toast(t("bag.discard_worn_gone"));
      invalidateBackpack(qc);
      invalidateBags(qc);
      setDiscarding(null);
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });
  const openDiscard = (key: string | null) => {
    discardOp.current = newOpId();
    setDiscarding(key);
  };
  return { discarding, setDiscarding, discard, openDiscard };
}
