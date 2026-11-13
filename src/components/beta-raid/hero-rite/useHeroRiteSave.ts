// «Сохранить» у админа: весь список обрядов одним запросом (saveHeroRites).
// Ответ — свежие обряды с id от сервера: сразу в кэш окна, игрок в этом же окне
// видит правку без F5.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { saveHeroRites } from "@/server/api/beta-raid";
import { humanError } from "@/lib/humanError";
import { useT } from "@/lib/i18n";
import type { HeroRite, HeroRiteView } from "@/lib/enchant/heroRite";
import { heroRiteKey, type RiteAt } from "@/components/beta-raid/hero-rite/heroRiteQueries";

type Shop = { rites: HeroRiteView[]; canEdit: boolean };

export function useHeroRiteSave(at: RiteAt, onSaved: (rites: HeroRiteView[]) => void) {
  const qc = useQueryClient();
  const t = useT();
  return useMutation({
    mutationFn: (rites: HeroRite[]) =>
      saveHeroRites({ data: { mapId: at.mapId, q: at.q, r: at.r, rites } }),
    onSuccess: (res) => {
      qc.setQueryData<Shop>(heroRiteKey(at), (old) => (old ? { ...old, rites: res.rites } : old));
      void qc.invalidateQueries({ queryKey: heroRiteKey(at) });
      toast.success(t("enchantshop.saved"));
      onSaved(res.rites);
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });
}
