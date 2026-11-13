// «Уведомления» в «Добыче» (владелец 04.11.2026, §8.106): «все уведомления
// только в окне добычи — цифрой на кружочке». Строка — потеря шахты или гриба:
// что случилось и где. Шахта в мире героя — булавка: окно закрывается, камера
// едет, клетка мигает (дойти можно самому). В другом мире — метка мира мигает;
// перейдёшь туда — булавка появится. «×» закрывает строку навсегда, «Закрыть
// все» — все разом. Несобранное с отнятой шахты закрытие не трогает: оно в
// списке шахт ниже (§8.71). Закрытие — сразу (без ожидания сервера).
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BellRing, MapPin, X } from "lucide-react";
import { toast } from "sonner";
import { useLang, useT } from "@/lib/i18n";
import { humanError } from "@/lib/humanError";
import { formatQty } from "@/lib/formatQty";
import { lostCore, lostPlace } from "@/lib/mineLost";
import type { MineNotice } from "@/lib/mineNotice";
import { dismissMineNotices } from "@/server/api/beta-raid/mine-lost/mine-notices";
import { CaptureCollectButton } from "./CaptureCollectButton";
import { HARVEST_KEY, fetchHarvest } from "./useHarvest";
import "./harvest-notices.css";

type Harvest = Awaited<ReturnType<typeof fetchHarvest>>;

/** Закрыть одну (id) или все (null); строка уходит сразу, сбой — вернётся. */
function useDismissNotices() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string | null) => dismissMineNotices({ data: { id } }),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: HARVEST_KEY });
      const prev = qc.getQueryData<Harvest>(HARVEST_KEY);
      if (prev) {
        qc.setQueryData<Harvest>(HARVEST_KEY, {
          ...prev,
          notices: id ? (prev.notices ?? []).filter((n) => n.id !== id) : [],
          noticeCount: id ? Math.max(0, (prev.noticeCount ?? 0) - 1) : 0,
        });
      }
      return { prev };
    },
    onError: (e: Error, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(HARVEST_KEY, ctx.prev);
      toast.error(humanError(e));
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: HARVEST_KEY, refetchType: "all" }),
  });
}

function NoticeRow({
  n,
  onShowCell,
  onClose,
}: {
  n: MineNotice;
  onShowCell?: (q: number, r: number) => void;
  onClose: (id: string) => void;
}) {
  const t = useT();
  const lang = useLang();
  const eventDate = n.at > 0 && Number.isFinite(n.at) ? new Date(n.at) : null;
  const validDate = eventDate && Number.isFinite(eventDate.getTime()) ? eventDate : null;
  const core = lostCore(t, {
    kind: n.kind,
    mushroom: n.mushroom,
    resource: n.resource ?? undefined,
  });
  const away = !n.here && !!n.world;
  return (
    <div data-harvest-notice className="harvest-notice">
      <div className="harvest-notice-main">
        <strong>{core}</strong>
        <span className="harvest-notice-place">
          {away && (
            <span
              className="harvest-notice-world"
              title={t("minelost.other_world", { world: n.world ?? "" })}
            >
              {n.world}
            </span>
          )}
          <span>{lostPlace({ q: n.q, r: n.r })}</span>
          {n.amount > 0 && (
            <span className="harvest-notice-ready">
              {t("harvest.ready_to_collect")} <b>{formatQty(n.amount)}</b>
            </span>
          )}
        </span>
        {validDate && <time className="harvest-notice-time" dateTime={validDate.toISOString()}>
          {validDate.toLocaleString(lang === "en" ? "en-GB" : "ru-RU", {
            day: "2-digit", month: "2-digit", year: "numeric",
            hour: "2-digit", minute: "2-digit", hour12: false,
          })}
        </time>}
      </div>
      <div className="harvest-notice-actions">
        {n.amount > 0 && <CaptureCollectButton id={n.id} name={`${core}, ${n.q},${n.r}`} />}
        {n.here && onShowCell && (
          <button
            type="button"
            data-game-button="icon"
            className="harvest-notice-icon"
            aria-label={t("minelost.show_label", { place: lostPlace(n) })}
            onClick={() => onShowCell(n.q, n.r)}
          >
            <MapPin aria-hidden size={20} />
          </button>
        )}
        <button
          type="button"
          data-game-button="icon"
          className="harvest-notice-icon"
          aria-label={`${t("minelost.close")}: ${core}`}
          onClick={() => onClose(n.id)}
        >
          <X aria-hidden size={20} />
        </button>
      </div>
    </div>
  );
}

export function HarvestNotices({
  notices,
  count,
  onShowCell,
}: {
  notices: MineNotice[];
  count: number;
  onShowCell?: (q: number, r: number) => void;
}) {
  const t = useT();
  const dismiss = useDismissNotices();
  if (notices.length === 0) return null;
  return (
    <section data-harvest-notices className="harvest-notices">
      <header>
        <span>
          <BellRing aria-hidden size={19} />
          {t("minelost.notices", { n: Math.max(count, notices.length) })}
        </span>
        {count > 1 && (
          <button
            type="button"
            className="harvest-notices-all"
            onClick={() => dismiss.mutate(null)}
          >
            {t("minelost.close_all")}
          </button>
        )}
      </header>
      {notices.map((n) => (
        <NoticeRow key={n.id} n={n} onShowCell={onShowCell} onClose={(id) => dismiss.mutate(id)} />
      ))}
    </section>
  );
}
