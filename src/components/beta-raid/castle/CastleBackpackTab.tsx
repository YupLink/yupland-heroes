// Вкладка «Рюкзак» в окне замка. Данные общие с остальными вкладками замка
// (useCastle → backpack), второго запроса к серверу не делает. Показывает
// рюкзак выбранного героя — того же, кого правят на вкладках «Герой»/«Снаряжение».
import { BackpackGrid } from "@/components/beta-raid/BackpackGrid";
import type { Castle } from "./useCastle";

export function CastleBackpackTab({
  castle,
  compartment,
  paged,
}: {
  castle: Castle;
  compartment?: "backpack" | "potions";
  paged?: boolean;
  /** Совместимость вызывающих окон; склады перенесены в здание «Склад». */
  onShowCell?: (q: number, r: number) => void;
}) {
  return (
    <div className="space-y-3">
      <BackpackGrid
        data={castle.backpack.data}
        compartment={compartment}
        paged={paged}
        loading={castle.backpack.isLoading}
        readOnly={castle.readOnly}
        allowUse={castle.backpackUseAllowed}
        beforeUse={castle.beforeUseBackpack}
      />
    </div>
  );
}
