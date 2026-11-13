// Особые действия постройки в её окне: ратуша и постройки голодающего города —
// своим блоком (town/TownExtra), остальное — BuildingExtraActions (верфь,
// вышка, маркет, таверна…). Одно место на два окна: обычное окно постройки
// (BuildModal) и вкладка «Лавка» у кузницы с ремонтом (forge/ForgeTabs). Ниже —
// действия хозяина постройки мира строителей (building-sale/OwnBuildingActions).
import type { BuildingExtra } from "@/lib/buildingEffect";
import type { OwnOffer } from "@/lib/buildingSale";
import { isTownExtra } from "@/lib/townHallView";
import { BuildingExtraActions } from "./BuildingExtraActions";
import { OwnBuildingActions } from "./building-sale/OwnBuildingActions";
import { TownExtra } from "./town/TownExtra";
import { ArtGenAction } from "./art-gen/ArtGenAction";

export function BuildingExtraBlock({
  q,
  r,
  extra,
  own = null,
  onDone,
}: {
  q: number;
  r: number;
  extra: BuildingExtra;
  /** Постройка игрока в мире строителей — его действия; чужая — null. */
  own?: OwnOffer | null;
  onDone: () => void;
}) {
  const body = isTownExtra(extra) ? (
    <TownExtra q={q} r={r} extra={extra} />
  ) : extra?.kind === "art_gen" ? (
    <ArtGenAction q={q} r={r} extra={extra} />
  ) : (
    <BuildingExtraActions q={q} r={r} extra={extra} onDone={onDone} />
  );
  if (!own) return body;
  return (
    <>
      {body}
      <OwnBuildingActions own={own} q={q} r={r} onDone={onDone} />
    </>
  );
}
