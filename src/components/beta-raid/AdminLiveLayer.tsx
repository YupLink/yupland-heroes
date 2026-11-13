// Слой режима бога поверх карты: тумблер, панель кисти, окно клетки и раздача.
import { useState } from "react";
import { AdminLiveToggle } from "./AdminLiveToggle";
import { AdminBrushBar } from "./AdminBrushBar";
import { CreatorBrushDock } from "./creator/CreatorBrushDock";
import { AdminMergeBar } from "./AdminMergeBar";
import { AdminFogClear } from "./AdminFogClear";
import { AdminCellModal } from "./AdminCellModal";
import { ScatterPanel } from "./scatter/ScatterPanel";
import { QuickCreatePanel } from "./quick-create/QuickCreatePanel";
import { GodMoveBar } from "@/components/beta-raid/god-move/GodMoveBar";
import { TownTemplatePanel } from "./town-template/TownTemplatePanel";
import { useTownBuildingIds } from "./town-template/useTownTemplates";
import { SpawnStampBar } from "./spawn-point/SpawnStampBar";
import { useSpawnMarks } from "./spawn-point/useSpawnMarks";
import type { useAdminLive } from "./useAdminLive";

/**
 * studio — мир креатора (creator/CreatorStudio): тумблер режима, туман и шаблон
 * города не нужны — режим включает «Ходьба», тумана в мире нет.
 */
export function AdminLiveLayer({
  live,
  studio = false,
}: {
  live: ReturnType<typeof useAdminLive>;
  studio?: boolean;
}) {
  // Дизайнер на своём острове: только кисть, блоки и шаблон города.
  const admin = !live.designer;
  const allow = useTownBuildingIds(live.designer);
  // Точки спавна значками на карте — пока включён режим бога (не дизайнеру).
  useSpawnMarks(live.on && admin);
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

  const brushBar = (
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
      actions={live.money}
      create={live.catalogs}
      allow={allow}
      studio={studio}
      eraseTarget={live.eraseTarget}
      onEraseTarget={live.setEraseTarget}
      eraseTerrain={live.creatorMap}
    />
  );
  const extraTools = (
    <>
      {live.mode === "merge" && <AdminMergeBar merge={live.merge} />}
      {admin && (
        <SpawnStampBar template={live.stamp.template} onPick={live.pickStamp} />
      )}
    </>
  );

  return (
    <>
      {!studio && (
        <AdminLiveToggle on={live.on} onToggle={() => live.setOn(!live.on)} />
      )}
      {live.on &&
        (studio ? (
          <CreatorBrushDock
            live={live}
            allow={allow}
            advanced={
              <>
                {brushBar}
                {extraTools}
              </>
            }
          />
        ) : (
          brushBar
        ))}
      {live.on && live.island && !studio && <TownTemplatePanel live={live} />}
      {live.on && !studio && extraTools}
      {live.on &&
        admin &&
        (studio ? (
          live.move.from && (
            <div className="creator-dock-moving">
              <GodMoveBar move={live.move} />
            </div>
          )
        ) : (
          <GodMoveBar move={live.move} />
        ))}
      {/* Кнопка стоит ВНЕ панели правки нарочно. Внутри неё раскрытие
          залипало: выключил режим бога — кнопка исчезла, а карта осталась
          открытой навсегда, и вернуть туман было нечем.
          Второй вариант — гасить раскрытие на выходе из режима — ломает
          больше: в правку заходят и выходят десятки раз за сеанс, и каждый
          выход заново зашторивал бы карту. Здесь же тумблер всегда на виду и
          всегда обратим, а сам слой и так рисуется только админу. */}
      {!studio && <AdminFogClear />}
      {live.cell && admin && (
        <AdminCellModal
          q={live.cell.q}
          r={live.cell.r}
          brush={live.brush}
          onMove={live.move.start}
          onClose={() => live.setCell(null)}
        />
      )}
      {giveaway && live.money && (
        <ScatterPanel onClose={() => setGiveaway(false)} />
      )}
      {creating && live.catalogs && (
        <QuickCreatePanel onClose={() => setCreating(false)} />
      )}
    </>
  );
}
