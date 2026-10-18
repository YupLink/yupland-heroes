// Корабль у клетки: сколько судов стоит и можно ли спустить ещё одно.
//
// Вынесено из AdminCellState (правило ≤250 строк). Строка особая: все прочие
// правки копятся в очереди выгрузки, а корабль уходит на сервер сразу —
// спускает его отдельная мутация, и вода должна быть уже выгружена.
import { Anchor } from "lucide-react";
import { Row, btn } from "./AdminCellRow";
import type { GodText } from "./adminCellText";
import type { AdminCellComposed } from "./useAdminCellView";
import type { useAdminCellActions } from "./useAdminCellActions";

type Actions = ReturnType<typeof useAdminCellActions>;

/** Почему корабля не будет, хотя клетка похожа на воду. */
function waterNote(cell: AdminCellComposed, t: GodText): string {
  if (cell.loading) return t.waterChecking;
  if (cell.failed) return t.waterUnconfirmed;
  return t.waterNotPublished;
}

export function AdminCellShipRow({
  cell,
  act,
  t,
}: {
  cell: AdminCellComposed;
  act: Actions;
  t: GodText;
}) {
  // Корабль ставится только на воду — на суше строки просто нет.
  if (!cell.water && !cell.waterLocalOnly && cell.ships === 0) return null;

  return (
    <Row label={t.rowShip}>
      {cell.ships > 0 && (
        <span className="inline-flex items-center gap-1">
          <Anchor className="h-3 w-3" /> {t.shipsCount(cell.ships)}
        </span>
      )}
      {cell.ships > 0 && (
        <button
          type="button"
          disabled={act.busy}
          className={btn}
          onClick={() => act.ship.mutate({ place: false })}
        >
          {t.remove}
        </button>
      )}
      {cell.water ? (
        <>
          <button
            type="button"
            disabled={act.busy}
            className={btn}
            onClick={() => act.ship.mutate({ place: true, kind: "small" })}
          >
            {t.launchShip}
          </button>
          <button
            type="button"
            disabled={act.busy}
            className={btn}
            onClick={() => act.ship.mutate({ place: true, kind: "big" })}
          >
            {t.launchBigShip}
          </button>
        </>
      ) : (
        cell.waterLocalOnly && (
          <span className="text-[10px] text-muted-foreground">{waterNote(cell, t)}</span>
        )
      )}
    </Row>
  );
}
