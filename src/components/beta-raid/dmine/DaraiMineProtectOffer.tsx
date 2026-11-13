// «Защита на час» сразу после ручной посадки гриба (владелец, 22.10.2026;
// lib/mushroomRipe): «Защитить» — MUSHROOM_PROTECT_ENERGY энергии, гриб час от
// посадки созревает, другой игрок его не поднимет; «Не надо» или закрыть окно —
// защиты нет, гриб можно поднять сразу. Ключ — нажатие посадки: повтор
// «Защитить» второй раз не спишет. Энергия и окно гриба — сразу, без F5.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { serverErrorText } from "@/lib/serverErrorText";
import { MUSHROOM_PROTECT_ENERGY } from "@/lib/mushroomRipe";
import { ENERGY_KEY } from "@/lib/hooks/useEnergy";
import { protectMushroom } from "@/server/api/beta-raid/dmine/dmine-protect";
import { ResourceActionDialog } from "@/components/beta-raid/ResourceActionDialog";

export function DaraiMineProtectOffer({
  q,
  r,
  placeOp,
  onClose,
}: {
  q: number;
  r: number;
  /** Ключ нажатия посадки (тот же, что ушёл в «Посадить»). */
  placeOp: string;
  onClose: () => void;
}) {
  const t = useT();
  const qc = useQueryClient();
  const title = t("dmine.protect_title", { n: MUSHROOM_PROTECT_ENERGY });
  const protect = useMutation({
    mutationFn: () => protectMushroom({ data: { op: placeOp } }),
    onSuccess: () => {
      toast.success(t("dmine.protected_toast"));
      onClose();
    },
    onError: (e: Error) => toast.error(serverErrorText(e, t)),
    // Энергия и окно этого гриба (подпись созревания) — сразу.
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ENERGY_KEY });
      void qc.invalidateQueries({ queryKey: ["beta-raid-building", q, r] });
    },
  });

  if (typeof document === "undefined") return null;
  return (
    <ResourceActionDialog
      title={title}
      busy={protect.isPending}
      onClose={onClose}
      overlayClassName="fixed inset-0 z-[140] flex items-end justify-center bg-black/75 sm:items-center sm:p-4"
      className="w-full max-w-xs rounded-t-2xl border border-border bg-background pb-[calc(env(safe-area-inset-bottom)+84px)] sm:rounded-2xl sm:pb-0"
    >
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <h4 className="font-display text-sm font-bold">{title}</h4>
        <button
          type="button"
          onClick={onClose}
          disabled={protect.isPending}
          aria-label={t("common.close")}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-border text-muted-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2 p-4">
        <button
          type="button"
          onClick={onClose}
          disabled={protect.isPending}
          className="rounded-2xl border border-border px-4 py-3 text-sm font-semibold text-muted-foreground disabled:opacity-50"
        >
          {t("dmine.protect_no")}
        </button>
        <button
          type="button"
          onClick={() => protect.mutate()}
          disabled={protect.isPending}
          className="flex items-center justify-center gap-1.5 rounded-2xl gradient-gold px-4 py-3 text-sm font-bold text-gold-foreground disabled:opacity-50"
        >
          {protect.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ShieldCheck className="h-4 w-4" />
          )}
          {t("dmine.protect_yes")}
        </button>
      </div>
    </ResourceActionDialog>
  );
}
