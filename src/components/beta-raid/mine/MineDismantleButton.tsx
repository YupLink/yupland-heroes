// «Разобрать · ⚡100» в окне сломанной или ничьей шахты v2 (ПРАВИЛА §8.70):
// сначала окно подтверждения — что вернётся (30 % цены заготовки у Архитектора
// сейчас; считает сервер, getMineDismantleQuote): ресурсы — сразу на баланс,
// товары — мешочком на клетке; потом разборка.
// Шахты больше нет — окно постройки закрывается (onDone).
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Hammer, Loader2 } from "lucide-react";
import { useLang, useT } from "@/lib/i18n";
import { MINE_DISMANTLE_ENERGY } from "@/lib/mineDismantle";
import { localizeAssetName } from "@/lib/translations/assetNames";
import { getMineDismantleQuote } from "@/server/api/beta-raid/mine-dismantle/mine-dismantle";
import { ResourceActionDialog } from "@/components/beta-raid/ResourceActionDialog";
import { MineRepairLabel } from "./MineRepairLabel";
import { useMineDismantle } from "./useMineV2Actions";

export function MineDismantleButton({
  q,
  r,
  onDone,
}: {
  q: number;
  r: number;
  onDone: () => void;
}) {
  const t = useT();
  const lang = useLang();
  const [open, setOpen] = useState(false);
  const quote = useQuery({
    queryKey: ["beta-raid-mine-dismantle", q, r],
    queryFn: () => getMineDismantleQuote({ data: { q, r } }),
    enabled: open,
    staleTime: 0,
  });
  const dismantle = useMineDismantle(q, r, () => {
    setOpen(false);
    onDone();
  });
  const n = quote.data?.energy ?? MINE_DISMANTLE_ENERGY;
  const res = quote.data?.res ?? {};
  const goods = quote.data?.goods ?? [];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-gold/40 py-2 text-xs font-semibold text-gold"
      >
        <Hammer className="h-4 w-4" />
        {t("mine2.dismantle_btn", { n: MINE_DISMANTLE_ENERGY })}
      </button>
      {open && (
        <ResourceActionDialog
          title={t("mine2.dismantle_title")}
          busy={dismantle.isPending}
          onClose={() => setOpen(false)}
          overlayClassName="fixed inset-0 z-[140] flex items-end justify-center bg-black/75 sm:items-center sm:p-4"
          className="w-full max-w-xs space-y-3 rounded-t-2xl border border-border bg-background p-4 pb-[calc(env(safe-area-inset-bottom)+84px)] sm:rounded-2xl sm:pb-4"
        >
          <h4 className="text-center font-display text-sm font-bold">
            {t("mine2.dismantle_title")}
          </h4>
          {quote.isLoading ? (
            <Loader2 className="mx-auto h-4 w-4 animate-spin text-muted-foreground" />
          ) : (
            <div className="space-y-1 text-center text-xs text-muted-foreground">
              {Object.keys(res).length > 0 && (
                <p className="flex flex-wrap items-center justify-center gap-1.5">
                  <MineRepairLabel textKey="mine2.dismantle_get" cost={res} />
                </p>
              )}
              {goods.length > 0 && (
                <p>
                  {t("mine2.dismantle_get_bag", {
                    list: goods
                      .map((g) => `${localizeAssetName(g.name, lang)} ×${g.qty}`)
                      .join(", "),
                  })}
                </p>
              )}
            </div>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={dismantle.isPending}
              className="flex-1 rounded-xl border border-border py-2.5 text-sm font-semibold"
            >
              {t("common.cancel")}
            </button>
            <button
              type="button"
              onClick={() => dismantle.mutate()}
              disabled={dismantle.isPending}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl gradient-gold py-2.5 text-sm font-bold text-gold-foreground disabled:opacity-50"
            >
              {dismantle.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("mine2.dismantle_btn", { n })}
            </button>
          </div>
        </ResourceActionDialog>
      )}
    </>
  );
}
