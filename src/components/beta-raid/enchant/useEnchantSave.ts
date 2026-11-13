// «Сохранить» у админа: весь список заклинаний лавки одним запросом
// (saveEnchantSpells). Ответ — свежие заклинания с id от сервера: кладём его
// в кэш лавки сразу, игрок в этом же окне видит правку без F5.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { saveEnchantSpells } from "@/server/api/beta-raid";
import { humanError } from "@/lib/humanError";
import { useT } from "@/lib/i18n";
import type { EnchantSpell, EnchantSpellView } from "@/lib/enchant/enchant";
import { enchantShopKey, type EnchantAt } from "@/components/beta-raid/enchant/enchantQueries";

type Shop = { spells: EnchantSpellView[]; canEdit: boolean };

/** Тело запроса — отдельно, чтобы тест видел форму без React. */
export function saveSpellsCall(
  at: EnchantAt,
  spells: EnchantSpell[],
): Promise<{ spells: EnchantSpellView[] }> {
  return saveEnchantSpells({ data: { mapId: at.mapId, q: at.q, r: at.r, spells } });
}

export function useEnchantSave(at: EnchantAt, onSaved: (spells: EnchantSpellView[]) => void) {
  const qc = useQueryClient();
  const t = useT();
  return useMutation({
    mutationFn: (spells: EnchantSpell[]) => saveSpellsCall(at, spells),
    onSuccess: (res) => {
      qc.setQueryData<Shop>(enchantShopKey(at), (old) =>
        old ? { ...old, spells: res.spells } : old,
      );
      void qc.invalidateQueries({ queryKey: enchantShopKey(at) });
      toast.success(t("enchantshop.saved"));
      onSaved(res.spells);
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });
}
