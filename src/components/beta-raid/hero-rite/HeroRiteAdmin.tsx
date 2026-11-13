// Вкладка «Админ» зачарования героев — в том же окне постройки, видна только
// при canEdit. Обряды ячейками и «+», под ними форма выбранного, внизу
// «Сохранить» (весь список разом). Заранее ничего не создаём: пусто — одна «+».
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { listEnchantCostOptions } from "@/server/api/beta-raid";
import { useT } from "@/lib/i18n";
import type { HeroRiteView } from "@/lib/enchant/heroRite";
import { costChips } from "@/components/beta-raid/enchant/enchantView";
import { ENCHANT_COST_OPTIONS_KEY } from "@/components/beta-raid/enchant/EnchantAdmin";
import {
  newRiteDraft,
  riteDraftOdds,
  riteSavePayload,
  toRiteDraft,
  type RiteDraft,
} from "@/components/beta-raid/hero-rite/heroRiteDraft";
import { HeroRiteCell } from "@/components/beta-raid/hero-rite/HeroRiteCell";
import { HeroRiteForm } from "@/components/beta-raid/hero-rite/HeroRiteForm";
import { useHeroRiteSave } from "@/components/beta-raid/hero-rite/useHeroRiteSave";
import type { RiteAt } from "@/components/beta-raid/hero-rite/heroRiteQueries";

export function HeroRiteAdmin({ at, rites }: { at: RiteAt; rites: HeroRiteView[] }) {
  const t = useT();
  const [drafts, setDrafts] = useState<RiteDraft[]>(() => rites.map(toRiteDraft));
  const [sel, setSel] = useState(0);
  const opts = useQuery({
    queryKey: ENCHANT_COST_OPTIONS_KEY,
    queryFn: () => listEnchantCostOptions(),
    staleTime: 60_000,
  });
  const options = opts.data ?? [];
  const save = useHeroRiteSave(at, (fresh) => {
    setDrafts(fresh.map(toRiteDraft));
    setSel((i) => Math.min(i, Math.max(0, fresh.length - 1)));
  });
  const payload = riteSavePayload(drafts);
  const cur = drafts[sel] ?? null;

  const patch = (d: RiteDraft) => setDrafts((list) => list.map((x, i) => (i === sel ? d : x)));
  const add = () => {
    setDrafts((list) => [...list, newRiteDraft(t("herorite.new_name"), options)]);
    setSel(drafts.length);
  };
  const remove = () => {
    setDrafts((list) => list.filter((_, i) => i !== sel));
    setSel((i) => Math.max(0, i - 1));
  };

  return (
    <>
      <div className="ench-cells is-spells">
        {drafts.map((d, i) => (
          <HeroRiteCell
            key={i}
            name={d.name}
            rarity={d.rarity}
            need={d.need}
            odds={riteDraftOdds(d)}
            chips={costChips(d.cost, options, false)}
            pressed={i === sel}
            onClick={() => setSel(i)}
          />
        ))}
        <button
          type="button"
          className="ench-cell ench-add-cell"
          aria-label={t("herorite.new_rite")}
          disabled={!opts.data}
          onClick={add}
        >
          {opts.isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : "+"}
        </button>
      </div>

      {cur && (
        <HeroRiteForm key={sel} d={cur} options={options} onChange={patch} onDelete={remove} />
      )}

      <button
        type="button"
        className="ench-go"
        disabled={!payload || save.isPending}
        onClick={() => payload && save.mutate(payload)}
      >
        {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
        {t("enchantshop.save")}
      </button>
    </>
  );
}
