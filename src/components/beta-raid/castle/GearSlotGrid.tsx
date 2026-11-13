import { Plus } from "lucide-react";
import { thumb } from "@/lib/image";
import { useLang } from "@/lib/i18n";
import type { GearItemView, GearSlotView } from "@/server/api/heroes-gear";
import { gearSlotLabel } from "./GearSlotDetails";
import { ArtWearBar } from "@/components/ArtWearBar";
import { EnchantMark } from "@/components/EnchantMark";

export function GearSlotGrid({ slots, available, selectedKey, onSelect }: {
  slots: GearSlotView[];
  available: Record<string, GearItemView[]>;
  selectedKey: string | null;
  onSelect: (key: string | null) => void;
}) {
  const lang = useLang();
  return (
    <div className="grid grid-cols-4 gap-2">
      {slots.map((slot) => {
        const ready = (available[slot.slot] ?? []).reduce((n, item) => n + item.count, 0);
        return (
          <button data-game-button="surface"
            key={slot.key}
            type="button"
            onClick={() => onSelect(selectedKey === slot.key ? null : slot.key)}
            className={`flex min-h-16 flex-col items-center gap-1 rounded-xl border p-1.5 transition ${selectedKey === slot.key ? "border-gold bg-gold/10" : "border-border hover:border-gold/40"}`}
          >
            <div className="relative grid h-12 w-12 place-items-center overflow-hidden rounded-lg bg-secondary/40">
              {slot.item?.imageUrl ? <img src={thumb(slot.item.imageUrl, 96, "black")} alt="" className="h-full w-full object-cover" /> : <Plus className="h-4 w-4 text-muted-foreground" />}
              {slot.item && <ArtWearBar durability={slot.item.durability} />}
              <EnchantMark pct={slot.item?.enchantPct} corner />
              {ready > 0 && <span className="absolute bottom-0 right-0 rounded-tl-md bg-background/85 px-1 text-[9px] font-bold text-gold">{ready}</span>}
            </div>
            <span className="w-full truncate text-center text-[9px] leading-tight text-muted-foreground">{gearSlotLabel(slot, lang)}</span>
          </button>
        );
      })}
    </div>
  );
}
