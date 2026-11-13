// Окно «Ваш корабль подорвали — вас телепортировало в город» (владелец, 26.10.2026;
// §8.75а). Сервер пишет его, когда синий динамит снял игрока с корабля и отнёс в
// основной город; живое «sentHome» перечитывает ключ beta-raid-* (sentHomeLive), вход
// на карту — тоже. Сколько бы взрывов ни было, окно одно; «Понятно» гасит все.
// Поверх окон карты (слой 140) — порталом на 170.
import { memo } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ship } from "lucide-react";
import { useT } from "@/lib/i18n";
import {
  getShipBlastNotice,
  markShipBlastSeen,
} from "@/server/api/beta-raid/dynamite/ship-blast-notice";

export const SHIP_BLAST_KEY = ["beta-raid-ship-blast"] as const;

function ShipBlastNoticeView() {
  const t = useT();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: SHIP_BLAST_KEY,
    queryFn: () => getShipBlastNotice(),
    staleTime: 60_000,
  });
  const seen = useMutation({
    mutationFn: (ids: string[]) => markShipBlastSeen({ data: { ids } }),
    onMutate: () => qc.setQueryData(SHIP_BLAST_KEY, { ids: [] }),
    onSettled: () => qc.invalidateQueries({ queryKey: SHIP_BLAST_KEY }),
  });
  const ids = q.data?.ids ?? [];
  if (ids.length === 0 || typeof document === "undefined") return null;
  return createPortal(
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="ship-blast-text"
      className="fixed inset-0 z-[170] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-xs rounded-3xl border border-destructive/50 bg-background p-5 text-center">
        <span className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-destructive/15">
          <Ship className="h-6 w-6 text-destructive" />
        </span>
        <p id="ship-blast-text" className="mb-4 text-sm font-semibold leading-snug">
          {t("dynamite.sent_home")}
        </p>
        <button
          type="button"
          onClick={() => seen.mutate(ids)}
          className="h-11 w-full rounded-xl bg-gold font-bold text-gold-foreground transition active:scale-95"
        >
          {t("dynamite.got_it")}
        </button>
      </div>
    </div>,
    document.body,
  );
}

// memo: экран рейда перерисовывается на каждый шаг героя, а этому компоненту
// шаг ни при чём — без memo он с иконками шёл следом (замер 06.11.2026).
export const ShipBlastNotice = memo(ShipBlastNoticeView);
