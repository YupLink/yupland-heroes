// Куда посадить гриб DARAI из рюкзака (lib/daraiMine): под себя или на одну из
// шести соседних клеток (та же сетка, что у сундуков — PlaceDirGrid). Тап —
// встаёт гриб с ближайшим выпадением и работает, за MUSHROOM_ENERGY энергии;
// отказ (дорога, проход, игрок, энергия) — от сервера. Сверху — сколько до
// ближайшего выпадения и цена.
// Под сеткой — «Съесть · награда» (DaraiMineEatButton, §8.85).
// Гриб встал — на месте сетки предложение «Защита на час» (DaraiMineProtectOffer):
// только после ручной посадки, с ключом этой посадки.
// Порталом в body, как пикер сундука: рюкзак живёт и в модалках.
// «В руку» (31.10.2026) — гриб в главной руке, сажать тапом по карте (hand/handStore).
import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Hand, X } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { newOpId } from "@/lib/opId";
import { serverErrorText } from "@/lib/serverErrorText";
import { PLACE_DIRS } from "@/lib/plainChest";
import { MUSHROOM_ENERGY } from "@/lib/daraiMine";
import { placeDaraiMine } from "@/server/api/beta-raid/dmine/dmine-place";
import { ResourceActionDialog } from "@/components/beta-raid/ResourceActionDialog";
import { PlaceDirGrid } from "@/components/beta-raid/chest/PlaceDirGrid";
import { DaraiMineTimer } from "./DaraiMineTimer";
import { DaraiMineProtectOffer } from "./DaraiMineProtectOffer";
import { invalidateDaraiMines } from "./useDaraiMines";
import { DaraiMineEatButton } from "./DaraiMineEatButton";
import { requestHand } from "@/components/beta-raid/hand/handStore";

export function DaraiMinePlacePicker({
  stackKey,
  onClose,
}: {
  stackKey: string;
  onClose: () => void;
}) {
  const t = useT();
  const qc = useQueryClient();
  // Ключ нажатия — один на клетку выбора: повтор после обрыва второй гриб не ставит.
  const op = useRef(newOpId());
  // Гриб встал: клетка и ключ посадки — для «Защиты на час».
  const [placed, setPlaced] = useState<{ q: number; r: number; op: string } | null>(null);
  const place = useMutation({
    mutationFn: (i: number) =>
      placeDaraiMine({ data: { stackKey, ...PLACE_DIRS[i], op: op.current } }),
    onSuccess: (res) => {
      toast.success(t("dmine.placed_toast"));
      void qc.invalidateQueries({ queryKey: ["beta-raid-building", res.q, res.r] });
      setPlaced({ q: res.q, r: res.r, op: op.current });
    },
    onError: (e: Error) => {
      op.current = newOpId();
      toast.error(serverErrorText(e, t));
    },
    // Рюкзак, таймер, энергия, «Добыча», плашка сбора и флажки — сразу.
    onSettled: () => invalidateDaraiMines(qc),
  });
  const busyAt = place.isPending ? place.variables : null;

  if (typeof document === "undefined") return null;
  if (placed) {
    return (
      <DaraiMineProtectOffer q={placed.q} r={placed.r} placeOp={placed.op} onClose={onClose} />
    );
  }
  return (
    <ResourceActionDialog
      title={t("dmine.place_title")}
      busy={place.isPending}
      onClose={onClose}
      overlayClassName="fixed inset-0 z-[140] flex items-end justify-center bg-black/75 sm:items-center sm:p-4"
      className="w-full max-w-xs rounded-t-2xl border border-border bg-background pb-[calc(env(safe-area-inset-bottom)+84px)] sm:rounded-2xl sm:pb-0"
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h4 className="font-display text-sm font-bold">{t("dmine.place_title")}</h4>
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
      <div className="space-y-3 p-4">
        <DaraiMineTimer stackKey={stackKey} line />
        <p className="text-center text-xs font-semibold text-gold">
          {t("dmine.place_cost", { n: MUSHROOM_ENERGY })}
        </p>
        <PlaceDirGrid busyAt={busyAt} disabled={place.isPending} onPick={(i) => place.mutate(i)} />
        <button
          type="button"
          onClick={() => {
            if (!requestHand(stackKey)) toast(t("dmine.hand_on_map"));
            onClose();
          }}
          disabled={place.isPending}
          className="flex h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-border text-sm font-semibold disabled:opacity-50"
        >
          <Hand className="h-4 w-4" />
          {t("land.hand")}
        </button>
        {/* «Съесть» (§8.85): за ⚡50 с подтверждением, награда сразу, гриб исчезает. */}
        <DaraiMineEatButton stackKey={stackKey} disabled={place.isPending} onEaten={onClose} />
      </div>
    </ResourceActionDialog>
  );
}
