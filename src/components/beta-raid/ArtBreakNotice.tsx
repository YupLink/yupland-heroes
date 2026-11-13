// Плашка «Сломан: <имя>» над героем, там же, где дебафы (владелец, 23.10.2026;
// ПРАВИЛА §8.63 п.3): «выскакивало бы уведомление на время — условно 5 секунд —
// с иконкой арта и значком поломки; главное, чтобы было понятно, что это
// уведомление о том, что арт сломанный».
//
// Очередь — useArtBreakQueue: удар кладёт поломки сразу (takeArtBreaks), вход
// на карту дочитывает непоказанные с сервера. Видно до трёх стопкой, каждая —
// 5 секунд со своего появления (тап — убрать раньше); ушла — помечаем показанной
// на сервере, и после перезагрузки она не всплывёт.
import { memo, useCallback, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArtBrokenOverlay } from "@/components/ArtBrokenMark";
import { stripStatSuffix } from "@/components/heroMeta";
import type { ArtBreakNote } from "@/lib/hero/artBroken";
import {
  finishArtBreak,
  scheduleArtBreak,
  useArtBreakQueue,
  useArtBrokenOn,
  visibleArtBreaks,
} from "@/lib/hooks/useArtBroken";
import { useLang, useT } from "@/lib/i18n";
import { thumb } from "@/lib/image";
import { localizeAssetName } from "@/lib/translations/assetNames";

function ArtBreakNoticesView() {
  const on = useArtBrokenOn();
  const qc = useQueryClient();
  const queue = useArtBreakQueue(on);
  const done = useCallback((id: string) => finishArtBreak(qc, id), [qc]);
  const items = visibleArtBreaks(queue.data?.items);
  if (!on || items.length === 0) return null;
  return (
    <div role="status" aria-live="polite" className="flex flex-col items-start gap-1">
      {items.map((n) => (
        <ArtBreakToast key={n.id} note={n} onDone={done} />
      ))}
    </div>
  );
}

function ArtBreakToast({ note, onDone }: { note: ArtBreakNote; onDone: (id: string) => void }) {
  const t = useT();
  const lang = useLang();
  useEffect(() => scheduleArtBreak(note.id, onDone), [note.id, onDone]);
  const name = stripStatSuffix(localizeAssetName(note.name, lang));
  return (
    <button
      type="button"
      data-art-break-notice={note.id}
      onClick={() => onDone(note.id)}
      className="flex max-w-[70vw] items-center gap-2 rounded-xl border border-destructive/50 bg-black/85 py-1 pl-1 pr-2.5 text-left backdrop-blur-sm transition active:scale-95 sm:max-w-xs"
    >
      <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded-lg bg-secondary/60">
        {note.imageUrl && (
          <img
            src={thumb(note.imageUrl, 96, "black")}
            alt=""
            className="h-full w-full object-cover"
          />
        )}
        <ArtBrokenOverlay shade="bg-black/25" />
      </span>
      <span className="min-w-0 truncate text-xs font-bold">
        <span className="text-destructive">{t("artbroken.title")}:</span>{" "}
        <span className="text-foreground">{name}</span>
      </span>
    </button>
  );
}

// memo: экран рейда перерисовывается на каждый шаг героя, а этому компоненту
// шаг ни при чём — без memo он с иконками шёл следом (замер 06.11.2026).
export const ArtBreakNotices = memo(ArtBreakNoticesView);
