// Окно клетки для админа: что здесь стоит и что с этим сделать.
//
// Открывается в режиме «Правка» тапом по любой клетке живой карты. Правится
// только то, что на клетке УЖЕ есть (палитра живёт в режиме «Кисть»), а сами
// правки копятся в общей очереди и уезжают кнопкой «Выгрузить» — вместе с
// мазками кисти. Исключение — корабль: он живёт в своей таблице и уходит сразу.
import { useState } from "react";
import { Loader2, Upload, X } from "lucide-react";
import { useLang } from "@/lib/i18n";
import { godText } from "./adminCellText";
import { useAdminCellActions } from "./useAdminCellActions";
import { useAdminCellView } from "./useAdminCellView";
import { AdminCellState } from "./AdminCellState";
import { AdminObjectSettings } from "./AdminObjectSettings";
import { AdminMobSpawnRow } from "./AdminMobSpawnRow";
import { AdminLootSpawnRow } from "./AdminLootSpawnRow";
import { AdminSpawnPointRow } from "./spawn-point/AdminSpawnPointRow";
import { AdminIslandStartRow } from "./island-start/AdminIslandStartRow";
import { withKeptSnapshot } from "@/components/admin/hex-editor/hexShared";
import type { GodMoveFrom, GodMovePick } from "@/components/beta-raid/god-move/useGodMove";
import type { CellPatch } from "./patchMapCache";
import type { useAdminBrush } from "./useAdminBrush";
import { toBody } from "@/lib/toBody";

export function AdminCellModal({
  q,
  r,
  brush,
  onMove,
  onClose,
}: {
  q: number;
  r: number;
  /** Общая очередь правок: окно клетки пишет в неё же, что и кисть. */
  brush: ReturnType<typeof useAdminBrush>;
  /** Взять на перенос; true — взято (окно закрывается, ждём цель). */
  onMove: (from: GodMoveFrom) => boolean;
  onClose: () => void;
}) {
  /** Полная форма объекта (HP, награды, способности) — как в редакторе карт. */
  const [settings, setSettings] = useState(false);
  const t = godText(useLang());
  const queued = brush.queue[`${q},${r}`];
  const cell = useAdminCellView(q, r, queued);
  const act = useAdminCellActions(q, r);

  const put = (patch: Omit<CellPatch, "q" | "r">) => brush.queueCell({ q, r, ...patch });
  const move = (pick: GodMovePick) => {
    if (onMove({ q, r, ...pick })) onClose();
  };

  return toBody(
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center bg-black/75 backdrop-blur-sm sm:items-center"
      // Закрываем только по клику в сам фон: форма объекта лежит внутри этого
      // же слоя, и раньше клик по её подложке уносил оба окна разом.
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="flex max-h-[85dvh] w-full max-w-sm flex-col overflow-y-auto overscroll-contain rounded-t-3xl border border-gold/30 bg-background p-4 pb-[calc(env(safe-area-inset-bottom)+84px)] sm:max-h-[88vh] sm:rounded-3xl sm:pb-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-2">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-widest text-gold">
              {t.cellTitle(q, r)}
            </div>
            <h3 className="font-display text-lg font-bold">{t.liveEdit}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.close}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-border text-muted-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <AdminCellState
          cell={cell}
          act={act}
          onPut={put}
          // Форму обещаем только когда id объекта удалось разобрать: иначе
          // кнопка была бы, а окно не открывалось.
          onOpenSettings={cell.object?.editor ? () => setSettings(true) : null}
          onMove={move}
        />
        {/* Точка возрождения моба: встаёт сам, бродит вокруг. */}
        <AdminMobSpawnRow q={q} r={r} />
        {/* Добыча по погоде: в свою погоду на клетке появляется мешочек. */}
        <AdminLootSpawnRow q={q} r={r} />
        {/* Точка спавна: мобы, погода, частота и награда — в одном месте. */}
        <AdminSpawnPointRow q={q} r={r} />
        {/* Старт героя на острове: сюда встаёт новичок при входе. */}
        <AdminIslandStartRow q={q} r={r} />

        {/* Выгрузка прямо отсюда: панель кисти закрыта этим окном. */}
        {brush.pending > 0 && (
          <button
            type="button"
            onClick={() => void brush.publish()}
            disabled={brush.sending}
            className="mt-3 flex items-center justify-center gap-1.5 rounded-xl gradient-gold px-3 py-2.5 text-xs font-bold text-gold-foreground disabled:opacity-40"
          >
            {brush.sending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            {t.publish} · {brush.pending}
          </button>
        )}
      </div>

      {settings && cell.object?.editor && (
        <AdminObjectSettings
          q={q}
          r={r}
          object={cell.object.editor}
          cellConfig={cell.object.config}
          onQueue={(cfg) =>
            put({
              objectConfig: withKeptSnapshot(cell.object?.config, cfg) as Record<
                string,
                unknown
              > | null,
            })
          }
          onClose={() => setSettings(false)}
        />
      )}
    </div>,
  );
}
