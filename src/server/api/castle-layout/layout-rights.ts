// Права на расстановку замка: в сцене только то, что у аккаунта есть.
// Правило то же, что у редактора (castleAppearanceAccess + useWith*): сервер
// повторяет его по своим данным, клиенту не верит.
//  · Базовые здания — у всех: исходная сцена замка (originals в
//    modularCastleProfiles: shop … gates, в ней и Храм) и Банк (у всех с 21.10).
//  · Покупные здания — только построенные: Казино (castle_casino; админу — сразу,
//    как getCastleCasino), Аукционный дом и Архитектор (уровень ≥ 1), «Управление
//    шахтами», «Метеостанция», «Хижина шаманов» и «Газетный киоск»
//    (castle_building). Здание в
//    сцене одно на id; штук одного id — не больше, чем у аккаунта есть
//    (castle_building — по числу строк вида).
//  · Декор — вид каталога, купленный в Ратуше (castle_decor) или набором
//    «appearance:<стиль>»; вид купили — ставится сколько угодно (§8.64 п. 4).
//  · Стиль зданий — набор «appearance:<стиль>»; стиль дорожек — «road:<стиль>»
//    или набор; земля и стены — «territory:<стиль>» или набор. «base» — всем.
//  · Дорожки (pathCells, roadSegments) — когда есть хоть один стиль дорожек.
//  · Админ и дизайнер замка (isCastleEditor) — весь декор и все стили.
import {
  castleAppearanceAccess,
  type AppearanceAccess,
} from "@/components/castle-live/castleAppearanceAccess";
import { layoutError, type ModularLayoutItem } from "./layout-schema";

/** Исходная сцена (originals) и Банк — есть у всех. */
export const BASE_LAYOUT_BUILDINGS: readonly string[] = [
  "shop",
  "market",
  "hall",
  "tavern",
  "temple",
  "training",
  "warehouse",
  "glory",
  "notice",
  "gates",
  "bank",
];
/**
 * Здания, которые стоят в сцене только у построивших (ownedBuildingTemplates).
 * Сервер может знать здание раньше его облика: киоск (31.10) — облик в пакете Codex.
 */
export const OWNED_LAYOUT_BUILDINGS: readonly string[] = [
  "casino",
  "auction",
  "architect",
  "mine_office",
  "weather_station",
  "shaman_hut",
  "newspaper_kiosk",
  "buckwheat_game",
];

export type LayoutOwnership = {
  /** Сколько штук здания есть у аккаунта: id сцены → число. */
  buildings: Record<string, number>;
  /** Купленные виды Ратуши (castle_decor.kind). */
  decor: readonly string[];
  /** Админ или дизайнер замка: весь декор и стили. */
  full: boolean;
};

/** Все виды декора каталога замка (как у админа в редакторе). */
const ALL_DECOR = castleAppearanceAccess([], true).decor;

const notOwned = (id: string) => layoutError("castle.layout_not_owned", { id });
const unknown = (id: string) => layoutError("castle.layout_unknown", { id });

function checkBuilding(id: string, count: number, own: LayoutOwnership): Error | null {
  if (BASE_LAYOUT_BUILDINGS.includes(id)) return null;
  if (!OWNED_LAYOUT_BUILDINGS.includes(id)) return unknown(id);
  return count <= (own.buildings[id] ?? 0) ? null : notOwned(id);
}

function checkStyles(b: ModularLayoutItem, a: AppearanceAccess): Error | null {
  if (b.buildingStyle && !a.buildingStyles.includes(b.buildingStyle))
    return notOwned(`appearance:${b.buildingStyle}`);
  if (b.roadStyle && b.roadStyle !== "base" && !a.roadStyles.includes(b.roadStyle))
    return notOwned(`road:${b.roadStyle}`);
  if (
    b.territoryStyle &&
    b.territoryStyle !== "base" &&
    !a.territoryStyles.includes(b.territoryStyle)
  )
    return notOwned(`territory:${b.territoryStyle}`);
  const roads = (b.pathCells?.length ?? 0) + (b.roadSegments?.length ?? 0);
  if (roads > 0 && a.roadStyles.length === 0) return notOwned("road");
  return null;
}

/** Первая проблема с правами (ошибка-ключ) или null — всё своё. */
export function layoutRightsProblem(
  layout: readonly ModularLayoutItem[],
  own: LayoutOwnership,
): Error | null {
  const seen = new Map<string, number>();
  for (const b of layout) seen.set(b.id, (seen.get(b.id) ?? 0) + 1);
  for (const [id, n] of seen) if (n > 1) return layoutError("castle.layout_duplicate", { id });
  const access = castleAppearanceAccess(own.decor, own.full);
  for (const b of layout) {
    if (b.decor) {
      const kind = b.catalogId ?? "";
      if (!ALL_DECOR.has(kind)) return unknown(kind);
      if (!access.decor.has(kind)) return notOwned(kind);
    } else {
      const problem = checkBuilding(b.id, seen.get(b.id) ?? 0, own);
      if (problem) return problem;
    }
    const style = checkStyles(b, access);
    if (style) return style;
  }
  return null;
}
