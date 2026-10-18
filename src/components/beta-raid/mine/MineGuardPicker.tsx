// Пикер босса-охранника: попап поверх окна шахты со стеками рюкзака ВЫБРАННОГО
// героя, отфильтрованными до боссов. Тап по боссу — ставим его на охрану шахты
// (списывается один из рюкзака). Порталом в body, чтобы не обрезался модалкой.
import { useState } from "react";
import { ResourceActionDialog } from "@/components/beta-raid/ResourceActionDialog";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, ImageOff, X, ShieldPlus } from "lucide-react";
import { toast } from "sonner";
import { humanError } from "@/lib/humanError";
import { thumb } from "@/lib/image";
import { useT } from "@/lib/i18n";
import { getMyBackpack } from "@/server/api/beta-raid/market-backpack-read";
import { placeMineGuard } from "@/server/api/beta-raid/mine-guard";
import { invalidateBackpack } from "@/lib/query";

export function MineGuardPicker({
  q,
  r,
  onClose,
  onPlaced,
}: {
  q: number;
  r: number;
  onClose: () => void;
  onPlaced: () => void;
}) {
  const t = useT();
  const qc = useQueryClient();
  const [picked, setPicked] = useState<string | null>(null);

  const bp = useQuery({ queryKey: ["my-hero-backpack"], queryFn: () => getMyBackpack() });
  const bosses = (bp.data?.stacks ?? []).filter((s) => s.kind === "boss");

  const place = useMutation({
    mutationFn: (stackKey: string) => placeMineGuard({ data: { q, r, stackKey } }),
    onSuccess: () => {
      toast.success(t("mine.guard_placed_toast"));
      qc.invalidateQueries({ queryKey: ["beta-raid-building", q, r] });
      qc.invalidateQueries({ queryKey: ["beta-raid-mine-guards"] });
      invalidateBackpack(qc);
      onPlaced();
      onClose();
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  if (typeof document === "undefined") return null;
  return (
    <ResourceActionDialog
      title={t("mine.guard_pick_title")}
      busy={place.isPending}
      onClose={onClose}
      overlayClassName="fixed inset-0 z-[140] flex items-end justify-center bg-black/75 p-0 sm:items-center sm:p-4"
      className="flex max-h-[85dvh] w-full max-w-sm flex-col overflow-hidden rounded-t-2xl border border-border bg-background sm:rounded-2xl"
    >
        <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
          <h4 className="font-display text-sm font-bold">{t("mine.guard_pick_title")}</h4>
          <button
            type="button"
            onClick={onClose}
            disabled={place.isPending}
            aria-label={t("common.close")}
            className="grid h-8 w-8 place-items-center rounded-full border border-border text-muted-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 pb-[calc(env(safe-area-inset-bottom)+16px)]">
          {bp.isLoading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> …
            </div>
          ) : bosses.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {t("mine.guard_pick_empty")}
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {bosses.map((b) => (
                <button
                  key={b.stackKey}
                  type="button"
                  onClick={() => setPicked(b.stackKey)}
                  className={`flex flex-col gap-1 rounded-lg border p-1.5 text-left ${
                    b.stackKey === picked ? "border-gold bg-gold/10" : "border-border"
                  }`}
                >
                  {b.image ? (
                    <img
                      src={thumb(b.image, 120, "black")}
                      alt=""
                      className="aspect-square w-full rounded-lg border border-border object-cover"
                    />
                  ) : (
                    <div className="grid aspect-square w-full place-items-center rounded-lg border border-border text-muted-foreground">
                      <ImageOff className="h-5 w-5" />
                    </div>
                  )}
                  <span className="truncate text-[11px] leading-tight">{b.name}</span>
                  <span className="text-[10px] text-muted-foreground">×{b.count}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="shrink-0 border-t border-border p-3 pb-[calc(env(safe-area-inset-bottom)+12px)]">
          <button
            type="button"
            onClick={() => picked && place.mutate(picked)}
            disabled={!picked || place.isPending}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl gradient-gold px-4 py-3 text-sm font-bold text-gold-foreground disabled:opacity-50"
          >
            {place.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ShieldPlus className="h-4 w-4" />
            )}
            {t("mine.guard_place")}
          </button>
        </div>
    </ResourceActionDialog>
  );
}
