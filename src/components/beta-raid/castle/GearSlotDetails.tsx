import { thumb } from "@/lib/image";
import { useLang, useT } from "@/lib/i18n";
import { metaLabel, stripStatSuffix } from "@/components/heroMeta";
import { RARITY_COLOR } from "@/components/heroes/heroLabels";
import type { GearItemView, GearSlotView } from "@/server/api/heroes-gear";
import { GearSlotIcon } from "./GearPaperDoll";
import { GearItemLines } from "./GearItemLines";
import { ArtWearBar } from "@/components/ArtWearBar";
import { useArtLocked } from "@/lib/hooks/useArtBroken";
import { EnchantMark } from "@/components/EnchantMark";

export const gearSlotLabel = (slot: GearSlotView, lang: string) =>
  slot.index > 1 ? `${metaLabel(slot.slot, lang)} ${slot.index}` : metaLabel(slot.slot, lang);

export function GearSlotDetails({
  slot,
  candidates,
  readOnly,
  atCastle,
  equipPending,
  unequipPending,
  onEquip,
  onUnequip,
}: {
  slot: GearSlotView;
  candidates: GearItemView[];
  readOnly: boolean;
  atCastle: boolean;
  equipPending: boolean;
  unequipPending: boolean;
  onEquip: (itemId: string, slotKey: string) => void;
  onUnequip: (slotKey: string) => void;
}) {
  const t = useT();
  const lang = useLang();
  // Сломанный при запущенной механике не надевается (§8.63 п.3): строка видна с
  // накладкой, но неактивна — сначала в кузницу.
  const locked = useArtLocked();
  return (
    <div data-gear-item-list className="space-y-2 p-1">
      <div className="text-xs font-bold">
        {readOnly
          ? `${lang === "ru" ? "Слот" : "Slot"}: ${gearSlotLabel(slot, lang)}`
          : t("braid.gear_pick", { slot: gearSlotLabel(slot, lang) })}
      </div>
      <p className="text-[11px] text-muted-foreground">
        {lang === "ru" ? "Предметов" : "Items"}: {candidates.length + (slot.item ? 1 : 0)}
      </p>
      {slot.item && (
        <div className="flex items-start gap-2 rounded-xl border border-gold/40 bg-gold/5 p-2">
          <div
            className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-secondary/40"
            style={{ boxShadow: `0 0 0 2px ${RARITY_COLOR[slot.item.rarity ?? ""] ?? "#9aa4bd"}` }}
          >
            {slot.item.imageUrl ? (
              <img
                src={thumb(slot.item.imageUrl, 96, "black")}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <GearSlotIcon slot={slot.slot} />
            )}
            <ArtWearBar durability={slot.item.durability} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-1">
              <span className="min-w-0 truncate text-[11px] font-bold">{stripStatSuffix(slot.item.name)}</span>
              <EnchantMark pct={slot.item.enchantPct} show="pct" className="text-[10px]" />
            </div>
            <GearItemLines item={slot.item} />
          </div>
          <button
            data-game-button="legacy"
            type="button"
            onClick={() => onUnequip(slot.key)}
            disabled={readOnly || unequipPending || !atCastle}
            className="min-h-11 shrink-0 rounded-lg border border-border px-2 py-1 text-[10px] font-bold text-muted-foreground disabled:opacity-50"
          >
            {t("braid.gear_take_off")}
          </button>
        </div>
      )}
      {candidates.length === 0 ? (
        <p className="py-2 text-center text-[11px] text-muted-foreground">
          {t("braid.gear_none_for_slot")}
        </p>
      ) : (
        <div className="space-y-2">
          {candidates.map((item) => (
            <button
              data-game-button="surface"
              key={item.itemId}
              type="button"
              onClick={() => onEquip(item.itemId, slot.key)}
              disabled={readOnly || equipPending || !atCastle || locked(item.durability)}
              data-art-locked={locked(item.durability) ? "1" : undefined}
              className="flex min-h-11 w-full items-start gap-2.5 rounded-xl border border-border p-2.5 text-left transition hover:border-gold/40 disabled:opacity-50"
            >
              <div
                className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-secondary/40"
                style={{ boxShadow: `0 0 0 2px ${RARITY_COLOR[item.rarity ?? ""] ?? "#9aa4bd"}` }}
              >
                {item.imageUrl ? (
                  <img
                    src={thumb(item.imageUrl, 96, "black")}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <GearSlotIcon slot={slot.slot} />
                )}
                <ArtWearBar durability={item.durability} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-1">
                  <span className="min-w-0 truncate text-[11px] font-bold">
                    {stripStatSuffix(item.name)}
                  </span>
                  <EnchantMark pct={item.enchantPct} show="pct" className="text-[10px]" />
                  {item.count > 1 && (
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      ×{item.count}
                    </span>
                  )}
                </div>
                <GearItemLines item={item} />
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
