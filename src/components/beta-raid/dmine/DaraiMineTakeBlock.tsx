// «Забрать в рюкзак» в окне чужого или ничьего гриба DARAI (lib/daraiMine) —
// это и есть его захват: обычной кнопки захвата у гриба нет. Цена —
// MUSHROOM_ENERGY (её отдаёт окно как captureCost); can — как у кнопки
// захвата, почему нельзя — подпись окна. Хозяину кнопки нет: свой гриб
// поднимает только другой игрок. После «Забрать» гриба на карте нет — окно
// закрывается, рюкзак и таймер — сразу.
import { useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, PackagePlus } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { humanError } from "@/lib/humanError";
import { newOpId } from "@/lib/opId";
import { takeDaraiMine } from "@/server/api/beta-raid/dmine/dmine-take";
import { useMineInvalidate } from "@/components/beta-raid/mine/useMineInvalidate";
import { invalidateDaraiMines } from "./useDaraiMines";

export function DaraiMineTakeBlock({
  q,
  r,
  cost,
  can,
  onDone,
}: {
  q: number;
  r: number;
  /** Энергия захвата этой шахты — она же цена «Забрать». */
  cost: number;
  /** Забрать можно сейчас (как кнопка захвата: построена, не моя, без охраны). */
  can: boolean;
  onDone: () => void;
}) {
  const t = useT();
  const qc = useQueryClient();
  const invalidate = useMineInvalidate(q, r);
  // Ключ нажатия: повтор после обрыва второй раз не возьмёт и не спишет.
  const op = useRef(newOpId());
  const take = useMutation({
    mutationFn: () => takeDaraiMine({ data: { q, r, op: op.current } }),
    onSuccess: () => {
      toast.success(t("dmine.taken_toast"));
      invalidate();
      invalidateDaraiMines(qc);
      onDone();
    },
    onError: (e: Error) => {
      op.current = newOpId();
      toast.error(humanError(e));
      // Отказ («не созрел», «гриба нет») — окно гриба заново: часики созревания
      // (защита на час) появляются, даже если окно открыли до защиты.
      void qc.invalidateQueries({ queryKey: ["beta-raid-building", q, r] });
    },
  });
  return (
    <button
      type="button"
      onClick={() => take.mutate()}
      disabled={take.isPending || !can}
      className="flex w-full items-center justify-center gap-1.5 rounded-2xl gradient-gold px-4 py-3 text-sm font-bold text-gold-foreground disabled:opacity-50"
    >
      {take.isPending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <PackagePlus className="h-4 w-4" />
      )}
      {cost > 0 ? t("dmine.take_btn", { n: cost }) : t("dmine.take_free")}
    </button>
  );
}
