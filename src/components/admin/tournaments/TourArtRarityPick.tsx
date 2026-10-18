// «Артефакт по редкости» (владелец, 04.10): сначала редкость, потом —
// «Любой» (случайный активный артефакт этой редкости выберется на финише:
// refId 'rarity:<r>', tour-art.ts) или конкретный артефакт этой редкости
// (приз art с refId шаблона, как у обычного «Артефакта»).
//
// В списке — только активные этой редкости; уже выбранный виден, даже если
// его потом выключили. Ключ кэша общий с пикером «Артефакт».
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { TOUR_ART_RARITIES, artRarityOf } from "@/lib/tournament/prizeText";
import { adminListItems } from "@/server/api/items";
import { ItemPickerSelect } from "@/components/admin/ItemPickerSelect";
import { chipCls } from "./tourCls";
import type { PrizeDraft } from "./tourDraft";

type Patch = Partial<PrizeDraft>;

export function TourArtRarityPick({
  prize,
  onPatch,
}: {
  prize: PrizeDraft;
  onPatch: (p: Patch) => void;
}) {
  const t = useT();
  const anyRarity = artRarityOf(prize.refId);
  const rarity = anyRarity ?? prize.rarity ?? "legendary";
  const arts = useQuery({
    queryKey: ["admin-items", "artifact"],
    queryFn: () => adminListItems({ data: { kind: "artifact" } }),
  });
  const items = (arts.data ?? []).filter(
    (i) => i.rarity === rarity && (i.active || i.id === prize.refId),
  );

  // «Любой» этой редкости. Подпись — как была у приза по редкости.
  const anyOf = (r: string): Patch => ({
    kind: "art",
    refId: `rarity:${r}`,
    title: `${t(`tour.adm.rarity.${r}`)} артефакт`,
    image: null,
    rarity: r,
  });

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-1">
        {TOUR_ART_RARITIES.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => onPatch(anyOf(r))}
            className={chipCls(rarity === r)}
          >
            {t(`tour.adm.rarity.${r}`)}
          </button>
        ))}
      </div>
      <div className="flex items-start gap-1.5">
        <button
          type="button"
          onClick={() => onPatch(anyOf(rarity))}
          className={cn(chipCls(anyRarity !== null), "h-10 shrink-0")}
        >
          {t("tour.adm.art_any")}
        </button>
        <div className="min-w-0 flex-1">
          <ItemPickerSelect
            items={items}
            value={anyRarity !== null ? "" : (prize.refId ?? "")}
            placeholder={t("tour.adm.art_exact")}
            onChange={(id) => {
              const it = items.find((x) => x.id === id);
              if (!it) return;
              onPatch({
                kind: "art",
                refId: it.id,
                title: it.name,
                image: it.imageUrl ?? null,
                rarity,
              });
            }}
          />
        </div>
      </div>
    </div>
  );
}
