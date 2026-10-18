// Зелья турнира «Зелья скорости» (владелец, 12.10.2026: «Кто больше выпьет
// зелий скорости»): чипы зелий справочника со скоростью в бусте, можно
// несколько. «Все со скоростью» — пустой список: тогда засчитываются все
// зелья со скоростью (tour-rows.POTION_PICK_SQL). Не выбирали (undefined) —
// как только справочник догрузится, подставляется «Дурман зелье»
// (tourPotions.defaultPotions): клик по категории до ответа справочника не
// превращает турнир в «все зелья». Список — тот же, что у маркета
// (listCustomItems), ключ кэша общий.
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Package } from "lucide-react";
import { cn } from "@/lib/utils";
import { thumb } from "@/lib/image";
import { useT } from "@/lib/i18n";
import { listCustomItems } from "@/server/api/beta-raid/market-custom";
import { CAP, chipCls } from "@/components/admin/tournaments/tourCls";
import {
  CUSTOM_ITEMS_KEY,
  isSpeedPotion,
  potionFill,
} from "@/components/admin/tournaments/tourPotions";

export function TourPotionPick({
  value,
  onChange,
}: {
  value: readonly string[] | undefined;
  onChange: (ids: string[]) => void;
}) {
  const t = useT();
  const list = useQuery({ queryKey: CUSTOM_ITEMS_KEY, queryFn: () => listCustomItems() });
  useEffect(() => {
    const fill = potionFill(value, list.data);
    if (fill) onChange(fill);
  }, [value, list.data, onChange]);
  const potions = (list.data ?? []).filter(isSpeedPotion);
  const picked = value ?? [];
  const toggle = (id: string) =>
    onChange(picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id]);
  return (
    <div>
      <span className={CAP}>{t("tour.adm.f_potions")}</span>
      <div className="flex flex-wrap gap-1">
        <button type="button" onClick={() => onChange([])} className={chipCls(value?.length === 0)}>
          {t("tour.adm.potions_all")}
        </button>
        {potions.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => toggle(c.id)}
            className={cn(chipCls(picked.includes(c.id)), "inline-flex items-center gap-1.5")}
          >
            {c.image ? (
              <img src={thumb(c.image, 48)} alt="" className="h-5 w-5 rounded object-contain" />
            ) : (
              <Package className="h-4 w-4" />
            )}
            <span className="max-w-[10rem] truncate">{c.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
