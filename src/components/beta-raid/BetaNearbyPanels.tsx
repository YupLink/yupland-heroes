// Что рядом с героем: корабль и объект. Две карточки под картой.
//
// Вынесено из BetaRaidScreen (правило ≤250 строк) — экран остаётся
// оркестратором и только передаёт сюда, что нашлось по соседству.
import { BetaAdjacentObject } from "./BetaRaidControls";
import { useT } from "@/lib/i18n";
import { ShipAdjacent } from "./ShipAdjacent";
import { objectKind, objectBadge, objectAction } from "./objectKind";
import type { AdjacentObject } from "./useAdjacentObject";
import type { AdjacentShip } from "./useAdjacentShip";

export function BetaNearbyPanels({
  ship,
  object,
  objectBusy,
  onOpenShip,
  onOpenObject,
  onInfoObject,
}: {
  ship: AdjacentShip | null;
  object: AdjacentObject | null;
  objectBusy: boolean;
  onOpenShip: (ship: AdjacentShip) => void;
  onOpenObject: (object: AdjacentObject) => void;
  /** «i» у цели боя: нынешнее окно цели (отряд, награды, топ). */
  onInfoObject: (target: { objectId: string; q: number; r: number }) => void;
}) {
  const t = useT();
  const action = object
    ? objectAction(objectKind(object.id, object.meta, object.kind), object.meta, t)
    : null;
  return (
    <>
      {ship && (
        <ShipAdjacent ship={ship.mark} aboard={ship.aboard} onOpen={() => onOpenShip(ship)} />
      )}
      {object && action && (
        <BetaAdjacentObject
          name={object.name}
          imageUrl={object.imageUrl}
          kind={objectKind(object.id, object.meta, object.kind)}
          badgeLabel={objectBadge(object.id, object.meta, object.kind, t)}
          actionLabel={action.label}
          busy={objectBusy}
          onOpen={() => onOpenObject(object)}
          onInfo={
            action.opensBattle
              ? () => onInfoObject({ objectId: object.id, q: object.q, r: object.r })
              : undefined
          }
        />
      )}
    </>
  );
}
