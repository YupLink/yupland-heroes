// «Зачаровать»: один запрос на нажатие. opId — новый на КАЖДОЕ нажатие (мост
// к базе повторяет запрос вслепую — сервер по ключу не спишет второй раз).
// Пока запрос идёт, кнопка заблокирована (isPending). После ответа — всё, что
// задела попытка, перечитывается без F5 (invalidateAfterEnchant).
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { enchantArtifact } from "@/server/api/beta-raid";
import { humanError } from "@/lib/humanError";
import { newOpId } from "@/lib/opId";
import {
  ENCHANT_ARTS_KEY,
  enchantShopKey,
  invalidateAfterEnchant,
  type EnchantAt,
} from "@/components/beta-raid/enchant/enchantQueries";
import type { EnchantOutcome } from "@/components/beta-raid/enchant/EnchantResult";

export type EnchantTry = { spellId: string; itemId: string; steps: number };

/** Тело запроса — отдельно, чтобы тест видел форму без React. */
export function enchantCall(at: EnchantAt, v: EnchantTry): Promise<EnchantOutcome> {
  return enchantArtifact({ data: { ...at, ...v, opId: newOpId() } });
}

export function useEnchantRun(
  at: EnchantAt,
  onResult: (res: EnchantOutcome, v: EnchantTry) => void,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: EnchantTry) => enchantCall(at, v),
    onSuccess: (res, v) => {
      onResult(res, v);
      invalidateAfterEnchant(qc, at);
    },
    onError: (e: Error) => {
      toast.error(humanError(e));
      // Отказ мог быть из-за устаревшего окна (админ поменял заклинания,
      // артефакт уже не тот) — перечитываем, но ничего не списано.
      void qc.invalidateQueries({ queryKey: enchantShopKey(at) });
      void qc.invalidateQueries({ queryKey: ENCHANT_ARTS_KEY });
    },
  });
}
