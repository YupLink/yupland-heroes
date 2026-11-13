// Вкладка «Админ» лавки зачарования — в том же окне постройки, видна только
// при canEdit. Заклинания ячейками и «+», под ними форма выбранного, внизу
// «Сохранить» (saveEnchantSpells, весь список разом). Заранее ничего не
// создаём: пустая лавка — одна ячейка «+».
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { listEnchantCostOptions } from "@/server/api/beta-raid";
import { useT } from "@/lib/i18n";
import type { EnchantSpellView } from "@/lib/enchant/enchant";
import { costChips } from "@/components/beta-raid/enchant/enchantView";
import {
  draftOdds,
  newDraft,
  parseBoost,
  savePayload,
  toDraft,
  type EnchantDraft,
} from "@/components/beta-raid/enchant/enchantDraft";
import { EnchantSpellCell } from "@/components/beta-raid/enchant/EnchantSpellCell";
import { EnchantSpellForm } from "@/components/beta-raid/enchant/EnchantSpellForm";
import { useEnchantSave } from "@/components/beta-raid/enchant/useEnchantSave";
import type { EnchantAt } from "@/components/beta-raid/enchant/enchantQueries";

export const ENCHANT_COST_OPTIONS_KEY = ["enchant-cost-options"] as const;

export function EnchantAdmin({ at, spells }: { at: EnchantAt; spells: EnchantSpellView[] }) {
  const t = useT();
  const [drafts, setDrafts] = useState<EnchantDraft[]>(() => spells.map(toDraft));
  const [sel, setSel] = useState(0);
  const opts = useQuery({
    queryKey: ENCHANT_COST_OPTIONS_KEY,
    queryFn: () => listEnchantCostOptions(),
    staleTime: 60_000,
  });
  const options = opts.data ?? [];
  const save = useEnchantSave(at, (fresh) => {
    setDrafts(fresh.map(toDraft));
    setSel((i) => Math.min(i, Math.max(0, fresh.length - 1)));
  });
  const payload = savePayload(drafts);
  const cur = drafts[sel] ?? null;

  const patch = (d: EnchantDraft) => setDrafts((list) => list.map((x, i) => (i === sel ? d : x)));
  const add = () => {
    setDrafts((list) => [...list, newDraft(t("enchantshop.new_name"), options)]);
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
          <EnchantSpellCell
            key={i}
            name={d.name}
            rarity={d.rarity}
            boost={parseBoost(d.boost)}
            odds={draftOdds(d)}
            chips={costChips(d.cost, options, false)}
            pressed={i === sel}
            onClick={() => setSel(i)}
          />
        ))}
        <button
          type="button"
          className="ench-cell ench-add-cell"
          aria-label={t("enchantshop.new_spell")}
          // Новое заклинание берёт первую позицию цены из списка — ждём список.
          disabled={!opts.data}
          onClick={add}
        >
          {opts.isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : "+"}
        </button>
      </div>

      {cur && (
        <EnchantSpellForm key={sel} d={cur} options={options} onChange={patch} onDelete={remove} />
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
