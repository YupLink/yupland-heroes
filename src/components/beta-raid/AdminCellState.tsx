// Состав клетки в админ-окне: правится ровно то, что на ней стоит.
//
// Пустая клетка ничего не предлагает — кроме корабля на воде. Палитра «что
// поставить» живёт в режиме «Кисть», иначе окно превращалось бы во второй
// редактор карт. Правки уходят в очередь выгрузки, а не поштучно на сервер.
//
// Все подписи — из adminCellText: раньше по языку переключалась ровно одна
// фраза, и англоязычный админ читал русское окно с одним английским словом.
import { AlertTriangle, Heart, Loader2, Rabbit, Skull, Users } from "lucide-react";
import { useLang } from "@/lib/i18n";
import { VOID_DOME } from "@/lib/voidDome";
import { godText } from "./adminCellText";
import { Row, btn } from "./AdminCellRow";
import { AdminTagChecks } from "./AdminTagChecks";
import { AdminDecorInteract } from "./AdminDecorInteract";
import { AdminTerrainFinds } from "./AdminTerrainFinds";
import { AdminCellShipRow } from "./AdminCellShipRow";
import { AdminBuildingRow, AdminBuildingSettings } from "@/components/beta-raid/AdminCellBuilding";
import { GodMoveButton } from "@/components/beta-raid/god-move/GodMoveButton";
import { AdminCellGround } from "@/components/beta-raid/god-move/AdminCellGround";
import { useCellGround } from "@/components/beta-raid/god-move/useCellGround";
import type { GodMovePick } from "@/components/beta-raid/god-move/useGodMove";
import type { AdminCellComposed } from "./useAdminCellView";
import type { CellPatch } from "./patchMapCache";
import type { useAdminCellActions } from "./useAdminCellActions";

type Actions = ReturnType<typeof useAdminCellActions>;

export function AdminCellState({
  cell,
  act,
  onPut,
  onOpenSettings,
  onMove,
}: {
  cell: AdminCellComposed;
  act: Actions;
  /** Правка слоя — в очередь выгрузки. */
  onPut: (patch: Omit<CellPatch, "q" | "r">) => void;
  /** Открыть полную форму объекта: HP, награды, способности. */
  onOpenSettings: (() => void) | null;
  /** Взять на перенос (god-move): здание, декор, объект, сундук, мешочки. */
  onMove: (pick: GodMovePick) => void;
}) {
  const t = godText(useLang());
  const ground = useCellGround(cell.q, cell.r).data;
  // Переносим постройку без облика — её сверит сервер. Пока она неизвестна
  // (облик есть, ответ сервера ещё едет), кнопка неактивна.
  const b = cell.building;
  const baseId = b?.baseId;
  const moveBuilding =
    b && baseId ? () => onMove({ kind: "building", ref: baseId, name: b.name }) : null;
  const decor = cell.decoration;
  const obj = cell.object;
  // Купол и дорога — тоже содержимое клетки: иначе клетка под глухим туманом
  // или с одной лишь дорогой подписана сразу и «Купол», и «Ничего здесь нет».
  const empty =
    !cell.decoration &&
    !cell.object &&
    !cell.runner &&
    !cell.building &&
    !cell.voidFog &&
    !cell.road &&
    !ground?.chest &&
    !ground?.bags;

  return (
    <div className="rounded-2xl border border-border/60 bg-secondary/20 p-2.5">
      {cell.failed && (
        <div className="mb-1.5 flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-2 text-[11px]">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-destructive" />
          <span className="flex-1">{t.cellFailed}</span>
          <button type="button" className={btn} onClick={cell.retry}>
            {t.retry}
          </button>
        </div>
      )}

      <Row label={t.rowTerrain}>
        {cell.terrain?.name ?? "—"}
        {cell.terrainQueued && (
          <span className="rounded border border-gold/40 px-1 text-[10px] text-gold">
            {t.notPublished}
          </span>
        )}
        {/* Находки лопатой у этой местности (§8.24 п. 6б, 31.10). */}
        {cell.terrain && <AdminTerrainFinds terrainId={cell.terrain.id} name={cell.terrain.name} />}
      </Row>
      {/* Дорога снимается так же, как декор: она лежит ПОВЕРХ местности, и
          снятие возвращает клетке цену шага её собственной земли. */}
      {cell.road && (
        <Row label={t.rowRoad}>
          {cell.road.name}
          <button type="button" className={btn} onClick={() => onPut({ roadId: null })}>
            {t.remove}
          </button>
        </Row>
      )}

      {/* Купол — своя строка состава, а не приписка к местности: под ним
          местность настоящая и целая, снятие возвращает клетку как была.
          Метка той же фиолетовой краски, что и дымка зоны на карте. */}
      {cell.voidFog && (
        <Row label={t.rowDome}>
          <span
            title={t.domeHint}
            className="rounded border px-1 text-[10px]"
            style={{
              borderColor: VOID_DOME.edge,
              background: VOID_DOME.badgeBg,
              color: VOID_DOME.badgeText,
            }}
          >
            {t.domeOn}
          </span>
          <button type="button" className={btn} onClick={() => onPut({ voidFog: false })}>
            {t.domeLift}
          </button>
        </Row>
      )}

      {empty && (
        <p className="py-2 text-center text-[12px] text-muted-foreground">{t.nothingHere}</p>
      )}

      {cell.decoration && (
        <Row label={t.rowDecor}>
          {cell.decoration.name}
          <button type="button" className={btn} onClick={() => onPut({ decorationId: null })}>
            {t.remove}
          </button>
          <GodMoveButton
            onClick={() => decor && onMove({ kind: "decor", ref: decor.id, name: decor.name })}
          />
          <AdminTagChecks refId={cell.decoration.id} kind="decoration" />
          <AdminDecorInteract decorId={cell.decoration.id} />
        </Row>
      )}

      {cell.object && (
        <Row label={t.rowObject}>
          <span className={cell.object.alive ? "text-foreground" : "text-muted-foreground"}>
            {cell.object.name} · {cell.object.alive ? t.alive : t.defeated}
          </span>
          {/* Живость — в ту же очередь, что и слои: иначе выгрузка этой же
              клетки снимала бы её следом за отправкой. */}
          <button
            type="button"
            className={btn}
            onClick={() => onPut({ alive: !cell.object!.alive })}
          >
            {cell.object.alive ? (
              <span className="inline-flex items-center gap-1">
                <Skull className="h-3 w-3" /> {t.extinguish}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1">
                <Heart className="h-3 w-3" /> {t.revive}
              </span>
            )}
          </button>
          {/* Кнопка только у объекта, чей id удалось разобрать: молча
              не открывающаяся форма — худшее из обещаний. */}
          {onOpenSettings ? (
            <button type="button" className={btn} onClick={onOpenSettings}>
              {t.configure}
            </button>
          ) : (
            <span className="text-[10px] text-muted-foreground">{t.noEditor}</span>
          )}
          {/* Повергнутый не переносится: уборка трупов снимет его сама. */}
          <GodMoveButton
            disabled={!cell.object.alive}
            onClick={() => obj && onMove({ kind: "object", ref: obj.id, name: obj.name })}
          />
          <button type="button" className={btn} onClick={() => onPut({ objectId: null })}>
            {t.remove}
          </button>
        </Row>
      )}

      {/* Беглец — не слой клетки: он прибежал сам и живёт в своей таблице,
          поэтому и строка своя, и «убрать» уходит сразу, минуя очередь. */}
      {cell.runner && (
        <Row label={t.rowRunner}>
          <span
            title={t.runnerHint}
            className={cell.runner.alive ? "text-foreground" : "text-muted-foreground"}
          >
            <Rabbit className="mr-1 inline h-3 w-3" />
            {cell.runner.name} · {cell.runner.alive ? t.alive : t.defeated}
          </span>
          <button
            type="button"
            disabled={act.busy}
            className={btn}
            onClick={() => act.runner.mutate()}
          >
            {t.remove}
          </button>
        </Row>
      )}

      {/* Постройка: строка с обликом — здесь, настройки по поведению — после
          строки корабля (AdminCellBuilding). */}
      <AdminBuildingRow cell={cell} onPut={onPut} onMove={moveBuilding} />

      <AdminCellGround ground={ground} onMove={onMove} />

      <AdminCellShipRow cell={cell} act={act} t={t} />

      <AdminBuildingSettings cell={cell} onPut={onPut} />

      {cell.players.length > 0 && (
        <Row label={t.rowPlayers}>
          <span className="inline-flex items-center gap-1 text-gold">
            <Users className="h-3 w-3" />
            {cell.players.join(", ")}
          </span>
        </Row>
      )}

      {cell.loading && (
        <p className="flex items-center justify-center gap-1 pt-1 text-[10px] text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          {t.detailsComing}
        </p>
      )}
    </div>
  );
}
