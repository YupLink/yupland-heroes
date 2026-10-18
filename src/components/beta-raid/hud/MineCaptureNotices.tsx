// Секция «Шахты отбили» в окне «Добыча».
//
// ПОЧЕМУ: начисление при перехвате было немым. SQL raid_mine_capture платит
// прежнему хозяину целые незаклеймленные часы в момент захвата, но шахта
// просто пропадала из списка, а ресурс ложился на счёт без подписи — игрок
// был уверен, что не получил ничего. Здесь та же строка журнала, что SQL
// написала в одной транзакции с начислением: «начислено N за M ч».
// Числа берём из строки, а не пересчитываем на клиенте — иначе подпись
// разъедется с выплатой по часам телефона.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Swords } from "lucide-react";
import { toast } from "sonner";
import { useLang, useT } from "@/lib/i18n";
import { humanError } from "@/lib/humanError";
import { formatQty } from "@/lib/formatQty";
import {
  markMineCapturesSeen,
  type MineCaptureNotice,
} from "@/server/api/beta-raid/mine-capture-log";
import type { HarvestSummary } from "@/server/api/beta-raid/harvest-summary";
import { HarvestSection } from "./HarvestSection";
import { CellLink } from "./HarvestLists";
import { HARVEST_KEY } from "./useHarvest";

export function MineCaptureNotices({
  captures,
  onShowCell,
}: {
  captures: MineCaptureNotice[];
  onShowCell?: (q: number, r: number) => void;
}) {
  const t = useT();
  const locale = useLang() === "en" ? "en-US" : "ru-RU";
  const qc = useQueryClient();

  /** «Понятно»: строки помечаются прочитанными, секция и цифра на кружке
   *  уходят сразу (правим кэш), сервер подтверждает фоновым перечтением. */
  const seen = useMutation({
    mutationFn: () => markMineCapturesSeen({ data: { ids: captures.map((c) => c.id) } }),
    onSuccess: () => {
      qc.setQueryData(HARVEST_KEY, (old: HarvestSummary | undefined) =>
        old ? { ...old, captures: [] } : old,
      );
      void qc.invalidateQueries({ queryKey: HARVEST_KEY });
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  // Ноль не показываем: нет захватов — нет секции.
  if (captures.length === 0) return null;

  /** Имя ресурса: монета — своим символом, ресурс — по словарю, иначе как есть. */
  const resName = (c: MineCaptureNotice): string => {
    if (c.resource === "token") return c.token ?? "token";
    if (!c.resource) return "";
    const key = `mine.res.${c.resource}`;
    const translated = t(key);
    return translated === key ? c.resource : translated;
  };
  const when = (ms: number) =>
    new Date(ms).toLocaleString(locale, {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <HarvestSection
      title={t("mine.captured_notice_title", { n: captures.length })}
      count={captures.length}
    >
      <div className="space-y-1.5">
        {captures.map((c) => (
          <div
            key={c.id}
            className="flex items-center justify-between gap-2 rounded-xl border border-rose-500/30 bg-rose-500/5 px-3 py-2"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-sm font-semibold">
                <Swords className="h-3.5 w-3.5 text-rose-300" />
                <span className="truncate">{resName(c) || t("harvest.mines")}</span>
              </div>
              <div className="text-[11px] text-muted-foreground">
                <CellLink q={c.q} r={c.r} onShow={onShowCell} /> · {when(c.at)}
              </div>
            </div>
            <div className="shrink-0 text-right text-[11px]">
              {c.amount > 0 ? (
                <span className="font-semibold text-amber-300">
                  {t("mine.captured_notice_row", {
                    n: formatQty(c.amount),
                    res: resName(c),
                    h: formatQty(c.dueHours),
                  })}
                </span>
              ) : (
                <span className="text-muted-foreground">{t("mine.captured_notice_zero")}</span>
              )}
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={() => seen.mutate()}
          disabled={seen.isPending}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          {seen.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {t("mine.captured_notice_ok")}
        </button>
      </div>
    </HarvestSection>
  );
}
