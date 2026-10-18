// YUPLINK · Мелочи, общие для карточек раздачи DARAI: формат суммы,
// чип «копировать» и строка доли. Вынесено, чтобы каждая карточка не тащила
// свою копию одного и того же (и чтобы файлы держались в пределах 250 строк).

import { toast } from "sonner";
import { Copy } from "lucide-react";
import type { adminGetDaraiDistributionPreview } from "@/server/api/payouts";

/** Выкладка раздачи целиком — тип берём прямо у server-fn, чтобы не разъехался. */
export type DaraiPreview = Awaited<
  ReturnType<typeof adminGetDaraiDistributionPreview>
>;

/** Суммы DARAI показываем с двумя знаками и пробелами в разрядах. */
export function fmt(n: number): string {
  return n.toLocaleString("ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Иконка-кнопка «копировать» в едином чип-стиле админки. */
export function CopyChip({ value, label }: { value: string; label: string }) {
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(value).then(
          () => toast.success("Скопировано"),
          () => toast.error("Не удалось скопировать")
        );
      }}
      title={`Копировать ${label}: ${value}`}
      aria-label={`Копировать ${label}`}
      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border/50 bg-secondary/40 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
    >
      <Copy className="h-3 w-3" />
    </button>
  );
}

/** Карточка одной доли: кому, сколько процентов, сколько DARAI. */
export function SplitRow({
  color,
  title,
  wallet,
  percent,
  amount,
}: {
  color: string;
  title: string;
  wallet: string;
  percent: number;
  amount: number;
}) {
  return (
    <div className={`rounded-xl border p-3 ${color}`}>
      <div className="text-[10px] uppercase tracking-widest">
        {title} ({percent}%)
      </div>
      <div className="mt-0.5 font-mono text-lg font-bold">
        {fmt(amount)} DARAI
      </div>
      <div className="mt-0.5 flex min-w-0 items-center gap-1">
        <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-muted-foreground">
          {wallet}
        </span>
        <CopyChip value={wallet} label={`кошелёк ${title}`} />
      </div>
    </div>
  );
}
