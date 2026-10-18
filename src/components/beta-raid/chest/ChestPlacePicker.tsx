// Установка магического сундука: куда (под себя или на соседнюю клетку —
// сетка как у обычного, владелец 03.10.2026) и охрана — боссы из рюкзака
// выбранного героя или «Без охраны» (правило владельца 28.09.2026: охрана по
// желанию). Тап по охране ставит сундук (и охрану) на выбранную клетку.
// Порталом в body, как пикер охраны шахты: рюкзак живёт и в модалках.
import { useState } from "react";
import { ResourceActionDialog } from "@/components/beta-raid/ResourceActionDialog";
import { ImageOff, Loader2, ShieldOff, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { thumb } from "@/lib/image";
import { useT } from "@/lib/i18n";
import { formatQty } from "@/lib/formatQty";
import type { BackpackStack } from "@/server/api/beta-raid/market-backpack";
import { usePlaceChest } from "@/components/beta-raid/chest/useChestActions";
import { PLACE_DIRS } from "@/lib/plainChest";
import { PLACE_HERE, PlaceDirGrid } from "@/components/beta-raid/chest/PlaceDirGrid";

export function ChestPlacePicker({
  chestKey,
  bosses,
  onClose,
}: {
  /** Стек сундука, который ставим. */
  chestKey: string;
  bosses: readonly BackpackStack[];
  onClose: () => void;
}) {
  const t = useT();
  const place = usePlaceChest(onClose);
  // Куда ставим: по умолчанию — под себя, как раньше.
  const [dir, setDir] = useState(PLACE_HERE);
  const at = PLACE_DIRS[dir];
  const put = (guardKey?: string) =>
    place.mutate({ stackKey: chestKey, ...(guardKey ? { guardKey } : {}), dq: at.dq, dr: at.dr });
  // Какая кнопка крутится: ключ босса или «без охраны» (ключа нет).
  const busyKey = place.isPending ? (place.variables?.guardKey ?? "") : null;

  if (typeof document === "undefined") return null;
  return (
    <ResourceActionDialog
      title={t("chest.guard_title")}
      busy={place.isPending}
      onClose={onClose}
      overlayClassName="fixed inset-0 z-[140] flex items-end justify-center bg-black/75 sm:items-center sm:p-4"
      className="flex max-h-[85dvh] w-full max-w-sm flex-col overflow-hidden rounded-t-2xl border border-border bg-background sm:rounded-2xl"
    >
        <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
          <h4 className="font-display text-sm font-bold">{t("chest.guard_title")}</h4>
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
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain p-3 pb-[calc(env(safe-area-inset-bottom)+84px)] sm:pb-3">
          <PlaceDirGrid selected={dir} disabled={place.isPending} onPick={setDir} />
          <button
            type="button"
            onClick={() => put()}
            disabled={place.isPending}
            className={cn(
              "flex w-full items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-sm font-semibold disabled:opacity-60",
              busyKey === "" ? "border-gold bg-gold/10" : "border-border",
            )}
          >
            {busyKey === "" ? (
              <Loader2 className="h-4 w-4 animate-spin text-gold" />
            ) : (
              <ShieldOff className="h-4 w-4 text-muted-foreground" />
            )}
            {t("chest.no_guard")}
          </button>
          {bosses.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {bosses.map((b) => (
                <button
                  key={b.stackKey}
                  type="button"
                  onClick={() => put(b.stackKey)}
                  disabled={place.isPending}
                  className={cn(
                    "relative flex min-w-0 flex-col gap-1 rounded-lg border p-1.5 text-left disabled:opacity-60",
                    busyKey === b.stackKey ? "border-gold bg-gold/10" : "border-border",
                  )}
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
                  <span className="text-[10px] text-muted-foreground">×{formatQty(b.count)}</span>
                  {busyKey === b.stackKey && (
                    <Loader2 className="absolute right-2 top-2 h-4 w-4 animate-spin text-gold" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
    </ResourceActionDialog>
  );
}
