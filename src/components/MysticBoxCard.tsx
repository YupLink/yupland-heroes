// Карточка стака мистических боксов (×N) с открытием. Вынесена из
// MysticBoxesSection. У Bonus Box при N ≥ 2 под «Открыть» — «Открыть все»
// (владелец, 28.10.2026): «Все ×N» при N ≤ 50, иначе «Открыть 50».
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Sparkles, Loader } from "lucide-react";
import {
  openMysticBox,
  openMysticBoxes,
  type listMyMysticPacks,
  type MysticBatchResult,
  type MysticPrize,
} from "@/server/api/mystic";
import { useT } from "@/lib/i18n";
import { invalidateHeroQueries } from "@/lib/query";
import { humanError } from "@/lib/humanError";
import { mysticOpenAllCount } from "@/lib/mysticBatch";
import { OpenPackConfirmModal } from "./chips/OpenPackConfirmModal";

export type MysticBox = Awaited<ReturnType<typeof listMyMysticPacks>>[number];
export type MysticReveal = { title: string; prizes: MysticPrize[] };

// refetchType: "all" — приз падает в подвкладки, которые сейчас НЕ
// смонтированы (артефакт/герой в «Инвентарь», пак в «Паки»), а суточный
// persist-кэш держит прежний ответ. Без этого игрок доходит до нужной
// вкладки и не находит там ничего.
// Из бокса падает что угодно (владелец, 29.09): счёт, ресурсы, лайки,
// билеты, энергия, рюкзак героя — обновляем всё это разом.
const AFTER_OPEN_KEYS = [
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
];

export function MysticBoxCard({
  g,
  count,
  onReveal,
  initiallyConfirm = false,
}: {
  g: MysticBox;
  count: number;
  onReveal: (r: MysticReveal) => void;
  initiallyConfirm?: boolean;
}) {
  const t = useT();
  const qc = useQueryClient();
  // «Открыть все» — только Bonus Box при N ≥ 2: min(N, 50).
  const all = mysticOpenAllCount(g.packId, count);
  // Приз бокса разыгрывается на сервере в момент открытия — спрашиваем заранее,
  // чтобы случайный тап по карточке не сжёг бокс. Число — сколько открываем.
  const [confirm, setConfirm] = useState<number | null>(initiallyConfirm ? 1 : null);
  const open = useMutation({
    // Открываем по packId (стак): сервер атомарно берёт свободный бокс. Иначе после
    // открытия одной коробки старый grantId уходит повторно → «уже открыт».
    mutationFn: async (n: number): Promise<MysticBatchResult> =>
      n > 1
        ? openMysticBoxes({ data: { packId: g.packId, count: n } })
        : { prizes: [(await openMysticBox({ data: { packId: g.packId } })).prize] },
    onSuccess: (r) => {
      setConfirm(null);
      onReveal({ title: `${g.packName} ×${r.prizes.length}`, prizes: r.prizes });
      // Пачка остановилась на сбое выдачи: выпавшее показано, причина — тостом.
      if (r.stopped) toast.error(humanError(r.stopped));
      for (const key of AFTER_OPEN_KEYS)
        void qc.invalidateQueries({ queryKey: [key], refetchType: "all" });
      invalidateHeroQueries(qc);
    },
    onError: (e: Error) => {
      setConfirm(null);
      toast.error(humanError(e));
    },
  });
  return (
    <div className="overflow-hidden rounded-2xl border border-gold/40 bg-card">
      <div className="relative aspect-square w-full bg-secondary/40">
        {g.coverImageUrl ? (
          <img
            src={g.coverImageUrl}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
          />
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
          onClick={() => setConfirm(1)}
          disabled={open.isPending}
          className="absolute inset-x-1.5 bottom-1.5 inline-flex items-center justify-center gap-1 rounded-lg bg-gold/90 px-2 py-1 text-[11px] font-bold text-background backdrop-blur transition active:scale-95 disabled:opacity-60"
        >
          {open.isPending && open.variables === 1 ? (
            <Loader className="h-3.5 w-3.5 animate-spin" />
          ) : (
            t("chips.open")
          )}
        </button>
      </div>
      <div className="p-2">
        <div className="truncate text-xs font-semibold">{g.packName}</div>
        {all > 0 && (
          <button
            onClick={() => setConfirm(all)}
            disabled={open.isPending}
            data-mystic-open-all={all}
            className="mt-1.5 inline-flex w-full items-center justify-center rounded-lg border border-gold/60 bg-gold/10 px-1.5 py-1 text-[11px] font-bold whitespace-nowrap text-gold transition active:scale-95 disabled:opacity-60"
          >
            {open.isPending && open.variables === all ? (
              <Loader className="h-3.5 w-3.5 animate-spin" />
            ) : all === count ? (
              t("chips.all_n", { n: all })
            ) : (
              t("chips.mystic_open_count", { n: all })
            )}
          </button>
        )}
      </div>
      {confirm !== null && (
        // Один диалог: count = 1 («Открыть») или n («Открыть все» → «Открыть ×n»).
        <OpenPackConfirmModal
          packName={g.packName}
          imageUrl={g.coverImageUrl}
          count={confirm}
          pending={open.isPending}
          onCancel={() => setConfirm(null)}
          onConfirm={() => open.mutate(confirm)}
        />
      )}
    </div>
  );
}
