// Наценка ломбарда (админ): во сколько раз дороже лавка продаёт артефакт,
// сданный ей в скупку «Любой … артефакт». Показывается, только если у лавки есть
// такая скупка. По умолчанию ×5.
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getPawnMarkup, setPawnMarkup } from "@/server/api/beta-raid/market-pawn";

export function MarketPawnMarkup({ q, r }: { q: number; r: number }) {
  const qc = useQueryClient();
  const key = ["market-pawn-markup", q, r];
  const markupQ = useQuery({ queryKey: key, queryFn: () => getPawnMarkup({ data: { q, r } }) });
  const [value, setValue] = useState("");
  useEffect(() => {
    if (markupQ.data) setValue(String(markupQ.data.markup));
  }, [markupQ.data]);
  const save = useMutation({
    mutationFn: (markup: number) => setPawnMarkup({ data: { q, r, markup } }),
    onSuccess: (res) => {
      toast.success(`Наценка ломбарда ×${res.markup}`);
      void qc.invalidateQueries({ queryKey: key });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const num = Number(value.replace(",", "."));
  const valid = Number.isFinite(num) && num > 0 && num <= 1000;
  const changed = markupQ.data && num !== markupQ.data.markup;
  return (
    <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-secondary/20 p-2 text-xs">
      <span className="flex-1">
        Наценка ломбарда, ×
        <span className="block text-[10px] text-muted-foreground">
          Сданный «любой артефакт» продаётся здесь же по цене выплаты × наценка
        </span>
      </span>
      <input
        inputMode="decimal"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="w-16 rounded-md border border-border bg-background px-2 py-1 text-right tabular-nums"
      />
      <button
        type="button"
        disabled={!valid || !changed || save.isPending}
        onClick={() => save.mutate(num)}
        className="rounded-md bg-gold px-2 py-1 font-semibold text-gold-foreground disabled:opacity-40"
      >
        Сохранить
      </button>
    </div>
  );
}
