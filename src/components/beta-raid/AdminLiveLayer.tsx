// Слой режима бога поверх карты: тумблер, панель кисти, окно клетки и раздача.
import { useState } from "react";
import { AdminLiveToggle } from "./AdminLiveToggle";
import { AdminBrushBar } from "./AdminBrushBar";
import { AdminMergeBar } from "./AdminMergeBar";
import { AdminFogClear } from "./AdminFogClear";
import { AdminCellModal } from "./AdminCellModal";
import { ScatterPanel } from "./scatter/ScatterPanel";
import { QuickCreatePanel } from "./quick-create/QuickCreatePanel";
import { GodMoveBar } from "@/components/beta-raid/god-move/GodMoveBar";
import type { useAdminLive } from "./useAdminLive";

export function AdminLiveLayer({ live }: { live: ReturnType<typeof useAdminLive> }) {
  /**
   * Окно массовой раздачи, открытое из режима бога. Состояние своё, а не общее
   * с блоком над картой: открыть оба разом всё равно нечем — окно перекрывает
   * экран целиком, и вторая кнопка оказывается под ним.
   *
   * Держим его на слое, а не внутри панели кисти: панель уходит вместе с
   * выключением режима, а в полноэкранном её ещё и сворачивают — окно
   * закрылось бы посреди настройки. Само окно рисуется порталом в body, так
   * что ни свёрнутая панель, ни её прокрутка ему не мешают.
   */
  const [giveaway, setGiveaway] = useState(false);
  /** Окно создания объекта — на том же слое и по тем же причинам, что раздача. */
  const [creating, setCreating] = useState(false);

  return (
    <>
      <AdminLiveToggle on={live.on} onToggle={() => live.setOn(!live.on)} />
      {live.on && (
        <AdminBrushBar
          brush={live.brush.brush}
          onPick={live.pickBrush}
          mode={live.mode}
          onMode={live.setMode}
          size={live.brush.size}
          onSize={live.brush.setSize}
          pending={live.brush.pending}
          sending={live.brush.sending}
          onPublish={live.brush.publish}
          onReset={live.brush.reset}
          onGiveaway={() => setGiveaway(true)}
          onCreate={() => setCreating(true)}
        />
      )}
      {live.on && live.mode === "merge" && <AdminMergeBar merge={live.merge} />}
      {live.on && <GodMoveBar move={live.move} />}
      {/* Кнопка стоит ВНЕ панели правки нарочно. Внутри неё раскрытие
          залипало: выключил режим бога — кнопка исчезла, а карта осталась
          открытой навсегда, и вернуть туман было нечем.
          Второй вариант — гасить раскрытие на выходе из режима — ломает
          больше: в правку заходят и выходят десятки раз за сеанс, и каждый
          выход заново зашторивал бы карту. Здесь же тумблер всегда на виду и
          всегда обратим, а сам слой и так рисуется только админу. */}
      <AdminFogClear />
      {live.cell && (
        <AdminCellModal
          q={live.cell.q}
          r={live.cell.r}
          brush={live.brush}
          onMove={live.move.start}
          onClose={() => live.setCell(null)}
        />
      )}
      {giveaway && <ScatterPanel onClose={() => setGiveaway(false)} />}
      {creating && <QuickCreatePanel onClose={() => setCreating(false)} />}
    </>
  );
}
