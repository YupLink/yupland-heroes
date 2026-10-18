// Мистические боксы — карточки со стаком (×N) и открытием. Живёт в «Паки»
// (Фишки → Паки), а не в «Инвентарь»: там теперь только герои/артефакты
// (готовые предметы из открытых боксов). Раньше бокс дублировался в обоих
// местах, а открытие в «Паки» не работало — там был обычный chip-опенер,
// который не понимал drop_table мистик-бокса.
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Sparkles, Loader } from "lucide-react";
import { listMyMysticPacks, openMysticBox, type MysticPrize } from "@/server/api/mystic";
import { useT } from "@/lib/i18n";
import { invalidateHeroQueries } from "@/lib/query";
import { humanError } from "@/lib/humanError";
import { MysticPrizeReveal } from "./MysticPrizeReveal";
import type { MysticRewardDestination } from "@/lib/mysticRewardDestination";
import { OpenPackConfirmModal } from "./chips/OpenPackConfirmModal";

type Box = Awaited<ReturnType<typeof listMyMysticPacks>>[number];

// Стак одинаковых боксов (по паку) в одну карточку со счётчиком.
function groupBoxes(list: Box[]): { first: Box; count: number }[] {
  const acc: Record<string, { first: Box; count: number }> = {};
  for (const g of list) {
    if (!acc[g.packId]) acc[g.packId] = { first: g, count: 0 };
    acc[g.packId].count++;
  }
  return Object.values(acc);
}

export function MysticBoxesSection({ onViewMysticReward, initialPackId }: { onViewMysticReward?: (kind: MysticRewardDestination) => void; initialPackId?: string } = {}) {
  const t = useT();
  const boxes = useQuery({
    queryKey: ["my-mystic-packs"],
    queryFn: () => listMyMysticPacks(),
  });
  const [reveal, setReveal] = useState<MysticPrize | null>(null);
  const boxList = (boxes.data ?? []).filter((b) => !b.opened);
  // Пока показывается приз (reveal) — НЕ размонтируем секцию, даже если открыт
  // ПОСЛЕДНИЙ бокс (boxList опустел). Иначе секция вернула бы null и утащила с
  // собой модал приза → «открыл последний пак, меню не выпало, он исчез».
  if (boxList.length === 0)
    return reveal ? <MysticPrizeReveal prize={reveal} onClose={() => setReveal(null)} onViewMysticReward={onViewMysticReward} /> : null;

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {groupBoxes(boxList).map((grp) => (
          <BoxCard key={grp.first.packId} g={grp.first} count={grp.count} onReveal={setReveal} initiallyConfirm={grp.first.packId === initialPackId} />
        ))}
      </div>
      {reveal && <MysticPrizeReveal prize={reveal} onClose={() => setReveal(null)} onViewMysticReward={onViewMysticReward} />}
    </div>
  );
}

function BoxCard({
  g,
  count,
  onReveal,
  initiallyConfirm = false,
}: {
  g: Box;
  count: number;
  onReveal: (p: MysticPrize) => void;
  initiallyConfirm?: boolean;
}) {
  const t = useT();
  const qc = useQueryClient();
  // Приз бокса разыгрывается на сервере в момент открытия — спрашиваем заранее,
  // чтобы случайный тап по карточке не сжёг бокс.
  const [confirming, setConfirming] = useState(initiallyConfirm);
  const open = useMutation({
    // Открываем по packId (стак): сервер атомарно берёт свободный бокс. Иначе после
    // открытия одной коробки старый grantId уходит повторно → «уже открыт».
    mutationFn: () => openMysticBox({ data: { packId: g.packId } }),
    onSuccess: (r) => {
      setConfirming(false);
      onReveal(r.prize);
      // refetchType: "all" — приз падает в подвкладки, которые сейчас НЕ
      // смонтированы (артефакт/герой в «Инвентарь», пак в «Паки»), а суточный
      // persist-кэш держит прежний ответ. Без этого игрок доходит до нужной
      // вкладки и не находит там ничего.
      // Из бокса падает что угодно (владелец, 29.09): счёт, ресурсы, лайки,
      // билеты, энергия, рюкзак героя — обновляем всё это разом.
      for (const key of [
        "my-mystic-packs",
        "session",
        "my-chip-packs",
        "my-chip-pack-grants",
        "acc-balances",
        "my-resources",
        "my-like-balance",
        "my-tickets",
        "my-energy",
        "my-darai-balance",
      ]) {
        void qc.invalidateQueries({ queryKey: [key], refetchType: "all" });
      }
      invalidateHeroQueries(qc);
    },
    onError: (e: Error) => {
      setConfirming(false);
      toast.error(humanError(e));
    },
  });
  return (
    <div className="overflow-hidden rounded-2xl border border-gold/40 bg-card">
      <div className="relative aspect-square w-full bg-secondary/40">
        {g.coverImageUrl ? (
          <img src={g.coverImageUrl} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
        ) : (
          <div className="grid h-full place-items-center">
            <Sparkles className="h-8 w-8 text-gold/60" />
          </div>
        )}
        {count > 1 && (
          <span className="mystic-boxes__count absolute right-1.5 top-1.5 z-10 rounded-full border border-gold/40 bg-black/85 px-1.5 py-0.5 text-[10px] leading-none font-bold text-gold">
            ×{count}
          </span>
        )}
        <button
          onClick={() => setConfirming(true)}
          disabled={open.isPending}
          className="absolute inset-x-1.5 bottom-1.5 inline-flex items-center justify-center gap-1 rounded-lg bg-gold/90 px-2 py-1 text-[11px] font-bold text-background backdrop-blur transition active:scale-95 disabled:opacity-60"
        >
          {open.isPending ? <Loader className="h-3.5 w-3.5 animate-spin" /> : t("chips.open")}
        </button>
      </div>
      <div className="p-2">
        <div className="truncate text-xs font-semibold">{g.packName}</div>
      </div>
      {confirming && (
        // Бокс всегда открывается по одному, даже если в стаке ×N.
        <OpenPackConfirmModal
          packName={g.packName}
          imageUrl={g.coverImageUrl}
          count={1}
          pending={open.isPending}
          onCancel={() => setConfirming(false)}
          onConfirm={() => open.mutate()}
        />
      )}
    </div>
  );
}

