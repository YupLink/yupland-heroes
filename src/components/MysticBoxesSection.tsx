// Мистические боксы — карточки со стаком (×N) и открытием. Живёт в «Паки»
// (Фишки → Паки), а не в «Инвентарь»: там теперь только герои/артефакты
// (готовые предметы из открытых боксов). Раньше бокс дублировался в обоих
// местах, а открытие в «Паки» не работало — там был обычный chip-опенер,
// который не понимал drop_table мистик-бокса.
// Карточка с открытием (в т.ч. Bonus Box пачкой) — MysticBoxCard.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listMyMysticPacks } from "@/server/api/mystic";
import { MysticPrizeReveal } from "./MysticPrizeReveal";
import { MysticBatchReveal } from "./MysticBatchReveal";
import { MysticBoxCard, type MysticBox, type MysticReveal } from "./MysticBoxCard";
import type { MysticRewardDestination } from "@/lib/mysticRewardDestination";

// Стак одинаковых боксов (по паку) в одну карточку со счётчиком.
function groupBoxes(list: MysticBox[]): { first: MysticBox; count: number }[] {
  const acc: Record<string, { first: MysticBox; count: number }> = {};
  for (const g of list) {
    if (!acc[g.packId]) acc[g.packId] = { first: g, count: 0 };
    acc[g.packId].count++;
  }
  return Object.values(acc);
}

export function MysticBoxesSection({
  onViewMysticReward,
  initialPackId,
}: { onViewMysticReward?: (kind: MysticRewardDestination) => void; initialPackId?: string } = {}) {
  const boxes = useQuery({
    queryKey: ["my-mystic-packs"],
    queryFn: () => listMyMysticPacks(),
  });
  const [reveal, setReveal] = useState<MysticReveal | null>(null);
  const boxList = (boxes.data ?? []).filter((b) => !b.opened);
  // Один приз — прежнее окно; пачка — одно окно со списком выпавшего.
  const revealModal = !reveal ? null : reveal.prizes.length === 1 ? (
    <MysticPrizeReveal
      prize={reveal.prizes[0]}
      onClose={() => setReveal(null)}
      onViewMysticReward={onViewMysticReward}
    />
  ) : (
    <MysticBatchReveal
      title={reveal.title}
      prizes={reveal.prizes}
      onClose={() => setReveal(null)}
      onViewMysticReward={onViewMysticReward}
    />
  );
  // Пока показывается приз (reveal) — НЕ размонтируем секцию, даже если открыт
  // ПОСЛЕДНИЙ бокс (boxList опустел). Иначе секция вернула бы null и утащила с
  // собой модал приза → «открыл последний пак, меню не выпало, он исчез».
  if (boxList.length === 0) return revealModal;

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {groupBoxes(boxList).map((grp) => (
          <MysticBoxCard
            key={grp.first.packId}
            g={grp.first}
            count={grp.count}
            onReveal={setReveal}
            initiallyConfirm={grp.first.packId === initialPackId}
          />
        ))}
      </div>
      {revealModal}
    </div>
  );
}
