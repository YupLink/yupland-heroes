import { useGearContainerPreview } from "./useGearContainerPreview";
// Снаряжение героя «на фигуре» — таверна замка (дизайн Ангелины, 07.10.2026).
// Те же данные и действия, что у сетки в окне героя (CastleGearTab), но места
// разложены вокруг силуэта; «Надеть лучшее» и комплекты сверяют перед нажатием,
// что открытый герой и есть активный (castle.guardGear).
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useLang, useT } from "@/lib/i18n";
import { BestGearButton } from "../BestGearButton";
import { GearPresets } from "../gear/GearPresets";
import { GearPaperDoll } from "./GearPaperDoll";
import { GearSlotDetails } from "./GearSlotDetails";
import type { Castle } from "./useCastle";

export function CastleGearDoll({
  castle,
  atCastle,
  race,
  onNavigate,
}: {
  castle: Castle;
  atCastle: boolean;
  race?: string | null;
  onNavigate?: (tab: "backpack" | "potions" | "spells") => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const containers = useGearContainerPreview(castle);
  const gear = castle.gear.data;
  const slots = Array.isArray(gear?.slots) ? gear.slots : [];
  const available = gear?.available ?? {};
  const openSlot = open ? (slots.find((d) => d.key === open) ?? null) : null;
  const candidates = openSlot ? (available[openSlot.slot] ?? []) : [];
  const { equip, unequip } = castle.mut;
  const ru = useLang() === "ru";
  const t = useT();

  const slotDetails = openSlot && (
    <GearSlotDetails
      slot={openSlot}
      candidates={candidates}
      readOnly={castle.gearReadOnly}
      atCastle={atCastle}
      equipPending={equip.isPending}
      unequipPending={unequip.isPending}
      onUnequip={(slotKey) => unequip.mutate(slotKey)}
      onEquip={(itemId, slotKey) =>
        equip.mutate({ itemId, slotKey }, { onSuccess: () => setOpen(null) })
      }
    />
  );

  if (castle.gear.isLoading) {
    return (
      <div className="flex h-24 items-center justify-center">
        <Loader2 className="h-4 w-4 animate-spin text-gold" />
      </div>
    );
  }
  if (!gear?.heroId) {
    return (
      <p className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
        {t("braid.castle_no_hero")}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {castle.viewedHeroId && castle.selected.isError && (
        <div role="alert" className="text-xs">
          <p>
            {ru
              ? "Не удалось проверить активного героя. Изменение экипировки временно недоступно."
              : "Unable to verify the active hero. Equipment changes are temporarily unavailable."}
          </p>
          <button
            type="button"
            className="min-h-11 text-gold"
            onClick={() => void castle.selected.refetch()}
          >
            {ru ? "Повторить" : "Retry"}
          </button>
        </div>
      )}
      {!castle.gearReadOnly && (
        <BestGearButton
          beforeAction={castle.guardGear}
          gain={gear?.bestGain ?? 0}
          disabled={!atCastle}
          onDone={() => setOpen(null)}
        />
      )}
      <GearPaperDoll
        containers={containers}
        slots={slots}
        selectedKey={open}
        onSelect={setOpen}
        slotDetails={slotDetails}
        race={race}
        onNavigate={onNavigate}
      />
      <GearPresets beforeAction={castle.guardGear} disabled={!atCastle || castle.gearReadOnly} />
    </div>
  );
}

