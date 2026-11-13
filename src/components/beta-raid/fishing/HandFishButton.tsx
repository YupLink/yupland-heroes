// «Ловить руками» над картой (lib/raid/handFish): остров новичка, герой на
// берегу, удочки нет. Нажатие — одна попытка за энергию и сытость, как рубка
// руками; улов или «ничего» — тостом, рюкзак, энергия и сытость перечитываются.
// Мало сытости или энергии — кнопка неактивна (решает всё равно сервер).
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Hand, Loader2, Zap } from "lucide-react";
import { useT } from "@/lib/i18n";
import { humanError } from "@/lib/humanError";
import { invalidateBackpack } from "@/lib/query";
import { gameInfoToast } from "@/lib/gameInfoToast";
import { useEnergy } from "@/lib/hooks/useEnergy";
import { handChopBlock } from "@/lib/raid/handChop";
import { HAND_FISH_ENERGY, HAND_FISH_SATIETY } from "@/lib/raid/handFish";
import { scaleEnergy } from "@/lib/raid/island/energy";
import { scaleSatiety } from "@/lib/raid/island/satiety";
import { fishByHand } from "@/server/api/beta-raid/fishing/fish-hand";
import { useSatiety } from "@/components/beta-raid/SatietyBar";
import { useEnergyMult, useSatietyMult } from "@/components/beta-raid/useEnergyMult";

const PILL =
  "raid-fishing-cast flex h-11 items-center gap-1.5 rounded-full border-2 border-gold/70 bg-black/85 px-3 text-sm font-bold text-gold shadow-lg transition active:scale-95 disabled:opacity-60";

export function HandFishButton() {
  const t = useT();
  const qc = useQueryClient();
  const cost = scaleEnergy(HAND_FISH_ENERGY, useEnergyMult());
  const satNeed = scaleSatiety(HAND_FISH_SATIETY, useSatietyMult());
  const energy = useEnergy().data?.energy;
  const satiety = useSatiety()?.now;
  const block = handChopBlock({ energy, satiety, need: cost, satNeed });
  const fish = useMutation({
    mutationFn: () => fishByHand({ data: {} }),
    onSuccess: (res) => {
      if (res.got.length > 0) {
        const items = res.got.map((g) => (g.n > 1 ? `${g.name} ×${g.n}` : g.name)).join(", ");
        gameInfoToast.success(t("fish.got", { items }));
        invalidateBackpack(qc);
      } else gameInfoToast(t("fish.nothing"));
      for (const key of [["my-energy"], ["beta-raid-state"]]) {
        void qc.invalidateQueries({ queryKey: key, refetchType: "all" });
      }
    },
    onError: (e: Error) => {
      toast.error(humanError(e));
      void qc.invalidateQueries({ queryKey: ["beta-raid-state"] });
    },
  });
  const why =
    block === "satiety"
      ? t("braid.decor_hand_low_satiety", { n: satNeed })
      : block === "energy"
        ? t("braid.decor_hand_low_energy", { n: cost })
        : undefined;
  return (
    <button
      type="button"
      disabled={fish.isPending || block !== null}
      onClick={() => fish.mutate()}
      className={`${PILL} raid-hand-fish`}
      aria-label={t("fish.hand")}
      title={why ?? t("fish.hand")}
    >
      {fish.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Hand className="raid-hand-fish__icon" />}
      <span>{t("fish.hand")}</span>
      <span className="flex items-center gap-0.5 tabular-nums">
        <Zap className="h-4 w-4" />−{cost}
      </span>
    </button>
  );
}
