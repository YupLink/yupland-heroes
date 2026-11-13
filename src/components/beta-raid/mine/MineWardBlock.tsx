// Замок шахтёра в окне шахты (§8.123, lib/mineWard.ts).
//   • MineWardOwner — хозяину: живой замок — замочек с отсчётом; нет замка и
//     выбранный герой Шахтёр — кнопка «Замок на 3 ч · 40 ⚡».
//   • MineWardLocked — захватчику вместо «Захватить»: замочек с отсчётом.
// Отсчёт — от остатка с сервера (не от часов телефона); кончился — окно
// перечитывается, и у захватчика возвращается кнопка.
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2, Lock } from "lucide-react";
import { nanoid } from "nanoid";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { humanError } from "@/lib/humanError";
import { wardClock } from "@/lib/mineWard";
import { putMineWard } from "@/server/api/beta-raid/mine-ward/mine-ward";
import { useMineInvalidate } from "./useMineInvalidate";
import { useSecondTick } from "./useMineV2Clock";

/** Остаток замка сейчас, мс: от ответа сервера, раз в секунду. Кончился — перечит окна. */
function useWardLeft(q: number, r: number, leftMs: number): number {
  const end = useMemo(() => Date.now() + Math.max(0, leftMs), [leftMs]);
  const now = useSecondTick(leftMs > 0);
  const left = leftMs > 0 ? Math.max(0, end - now) : 0;
  const invalidate = useMineInvalidate(q, r);
  const fired = useRef(false);
  useEffect(() => {
    if (leftMs > 0 && left <= 0 && !fired.current) {
      fired.current = true;
      invalidate();
    }
    if (left > 0) fired.current = false;
  }, [left, leftMs, invalidate]);
  return left;
}

function WardClock({ left }: { left: number }) {
  return (
    <p className="flex items-center justify-center gap-1 text-sm font-semibold tabular-nums text-sky-300">
      <Lock className="h-4 w-4" />
      {wardClock(left)}
    </p>
  );
}

export function MineWardOwner(props: {
  q: number;
  r: number;
  leftMs: number;
  energy: number | null;
}) {
  const t = useT();
  const { q, r } = props;
  const left = useWardLeft(q, r, props.leftMs);
  const invalidate = useMineInvalidate(q, r);
  const put = useMutation({
    mutationFn: () => putMineWard({ data: { q, r, opId: nanoid(16) } }),
    onSuccess: (res) => {
      toast.success(t("mine.ward_done", { n: res.energy }));
      invalidate();
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });
  if (left > 0) return <WardClock left={left} />;
  if (props.energy == null) return null;
  return (
    <button
      type="button"
      onClick={() => put.mutate()}
      disabled={put.isPending}
      className="flex w-full items-center justify-center gap-1.5 rounded-2xl border border-sky-400/40 bg-sky-500/10 px-4 py-2.5 text-sm font-bold text-sky-200 disabled:opacity-50"
    >
      {put.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
      {t("mine.ward_put", { n: props.energy })}
    </button>
  );
}

/** Захватчику: замочек с отсчётом вместо кнопки; замка нет — сама кнопка (children). */
export function MineWardLocked(props: {
  q: number;
  r: number;
  leftMs: number;
  children: ReactNode;
}) {
  const left = useWardLeft(props.q, props.r, props.leftMs);
  if (left <= 0) return <>{props.children}</>;
  return (
    <div className="flex w-full items-center justify-center gap-1.5 rounded-2xl border border-sky-400/30 bg-sky-500/10 px-4 py-3 text-sm font-bold tabular-nums text-sky-200">
      <Lock className="h-4 w-4" />
      {wardClock(left)}
    </div>
  );
}
