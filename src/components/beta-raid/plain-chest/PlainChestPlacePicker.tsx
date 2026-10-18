// Куда поставить обычный сундук (ПРАВИЛА §8.22): под себя или на одну из
// шести соседних клеток (сетка — PlaceDirGrid, общая с магическим). Тап —
// сундук встаёт.
// Порталом в body, как пикер магического сундука: рюкзак живёт и в модалках.
import { ResourceActionDialog } from "@/components/beta-raid/ResourceActionDialog";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { newOpId } from "@/lib/opId";
import { serverErrorText } from "@/lib/serverErrorText";
import { PLACE_DIRS } from "@/lib/plainChest";
import { placePlainChest } from "@/server/api/beta-raid/plain-chest/pchest-place";
import { refreshPlain } from "@/components/beta-raid/plain-chest/plainChestLive";
import { PlaceDirGrid } from "@/components/beta-raid/chest/PlaceDirGrid";

export function PlainChestPlacePicker({
  stackKey,
  onClose,
}: {
  stackKey: string;
  onClose: () => void;
}) {
  const t = useT();
  const qc = useQueryClient();
  const place = useMutation({
    mutationFn: (i: number) =>
      placePlainChest({ data: { stackKey, ...PLACE_DIRS[i], op: newOpId() } }),
    onSuccess: () => {
      toast.success(t("chest.placed_toast"));
      onClose();
    },
    onError: (e: Error) => toast.error(serverErrorText(e, t)),
    onSettled: () => refreshPlain(qc, true),
  });
  const busyAt = place.isPending ? place.variables : null;

  if (typeof document === "undefined") return null;
  return (
    <ResourceActionDialog
      title={t("pchest.place_title")}
      busy={place.isPending}
      onClose={onClose}
      overlayClassName="fixed inset-0 z-[140] flex items-end justify-center bg-black/75 sm:items-center sm:p-4"
      className="w-full max-w-xs rounded-t-2xl border border-border bg-background pb-[calc(env(safe-area-inset-bottom)+84px)] sm:rounded-2xl sm:pb-0"
    >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h4 className="font-display text-sm font-bold">{t("pchest.place_title")}</h4>
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
        <div className="p-4">
          <PlaceDirGrid
            busyAt={busyAt}
            disabled={place.isPending}
            onPick={(i) => place.mutate(i)}
          />
        </div>
    </ResourceActionDialog>
  );
}
