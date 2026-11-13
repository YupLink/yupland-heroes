// «Забрать в рюкзак» у охраны своей шахты (lib/mineGuardTake): сначала окно
// подтверждения с ценой — она считается по запасу службы шахты (не v2 — 100)
// и уходит на сервер. Цена успела вырасти (запас перешёл порог) — сервер
// отвечает новой ценой, окно показывает её, повтор — по ней.
import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, PackagePlus } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { humanError } from "@/lib/humanError";
import { newOpId } from "@/lib/opId";
import { invalidateBackpack } from "@/lib/query";
import { changedPriceOf, guardTakeEnergy } from "@/lib/mineGuardTake";
import { takeMineGuard } from "@/server/api/beta-raid/mine-guard-take";
import { ResourceActionDialog } from "@/components/beta-raid/ResourceActionDialog";

export function MineGuardTakeButton({
  q,
  r,
  name,
  life,
  onTaken,
}: {
  q: number;
  r: number;
  name: string;
  /** Запас службы шахты сейчас (0..1); null — у шахты запаса нет. По нему цена. */
  life: number | null;
  onTaken: () => void;
}) {
  const t = useT();
  const qc = useQueryClient();
  const [price, setPrice] = useState<number | null>(null);
  const op = useRef(newOpId());
  const take = useMutation({
    mutationFn: (expect: number) => takeMineGuard({ data: { q, r, expect, op: op.current } }),
    onSuccess: () => {
      toast.success(t("mineguard.taken_toast"));
      invalidateBackpack(qc);
      setPrice(null);
      onTaken();
    },
    onError: (e: Error) => {
      op.current = newOpId();
      const fresh = changedPriceOf(e);
      if (fresh !== null) setPrice(fresh);
      toast.error(humanError(e));
    },
  });
  const shown = guardTakeEnergy(life);
  const open = () => {
    op.current = newOpId();
    setPrice(shown);
  };

  return (
    <>
      <button
        type="button"
        onClick={open}
        className="mt-1.5 flex w-full items-center justify-center gap-1.5 rounded-xl border border-gold/40 py-2 text-xs font-semibold text-gold"
      >
        <PackagePlus className="h-4 w-4" />
        {t("mineguard.take_btn", { n: shown })}
      </button>
      {price !== null && (
        <ResourceActionDialog
          title={t("mineguard.confirm_title")}
          busy={take.isPending}
          onClose={() => setPrice(null)}
          overlayClassName="fixed inset-0 z-[140] flex items-end justify-center bg-black/75 sm:items-center sm:p-4"
          className="w-full max-w-xs space-y-3 rounded-t-2xl border border-border bg-background p-4 pb-[calc(env(safe-area-inset-bottom)+84px)] sm:rounded-2xl sm:pb-4"
        >
          <h4 className="text-center font-display text-sm font-bold">
            {t("mineguard.confirm_title")}
          </h4>
          <p className="text-center text-xs text-muted-foreground">
            {t("mineguard.confirm_text", { name, n: price })}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPrice(null)}
              disabled={take.isPending}
              className="flex-1 rounded-xl border border-border py-2.5 text-sm font-semibold"
            >
              {t("common.cancel")}
            </button>
            <button
              type="button"
              onClick={() => take.mutate(price)}
              disabled={take.isPending}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl gradient-gold py-2.5 text-sm font-bold text-gold-foreground disabled:opacity-50"
            >
              {take.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("mineguard.confirm_btn", { n: price })}
            </button>
          </div>
        </ResourceActionDialog>
      )}
    </>
  );
}
