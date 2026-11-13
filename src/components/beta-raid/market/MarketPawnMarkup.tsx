// Наценка ломбарда (админ): во сколько раз дороже лавка продаёт то, что ей сдали
// в скупку «Любой …». Своя у артефактов и у героев (kind); показывается, только
// если у лавки есть такая скупка. По умолчанию ×5.
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { getPawnMarkup, setPawnMarkup, type PawnKind } from "@/server/api/beta-raid/market-pawn";

export function MarketPawnMarkup({
  q,
  r,
  kind = "art",
}: {
  q: number;
  r: number;
  kind?: PawnKind;
}) {
  const t = useT();
  const qc = useQueryClient();
  const key = ["market-pawn-markup", q, r, kind];
  const markupQ = useQuery({
    queryKey: key,
    queryFn: () => getPawnMarkup({ data: { q, r, kind } }),
  });
  const [value, setValue] = useState("");
  useEffect(() => {
    if (markupQ.data) setValue(String(markupQ.data.markup));
  }, [markupQ.data]);
  const save = useMutation({
    mutationFn: (markup: number) => setPawnMarkup({ data: { q, r, markup, kind } }),
    onSuccess: (res) => {
      toast.success(t(`market.pawn_markup_saved.${kind}`, { n: res.markup }));
      void qc.invalidateQueries({ queryKey: key });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const num = Number(value.replace(",", "."));
  // Не ниже ×1 (сервер — PAWN_MARKUP_MIN): иначе лавка продаёт дешевле, чем платит.
  const valid = Number.isFinite(num) && num >= 1 && num <= 1000;
  const changed = markupQ.data && num !== markupQ.data.markup;
  return (
    <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-secondary/20 p-2 text-xs">
      <span className="flex-1">
        {t(`market.pawn_markup.${kind}`)}
        <span className="block text-[10px] text-muted-foreground">
          {t(`market.pawn_markup_hint.${kind}`)}
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
        {t("market.pawn_markup_save")}
      </button>
    </div>
  );
}
