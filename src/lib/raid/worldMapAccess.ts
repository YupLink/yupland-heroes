// Кто открывает карту мира и в каком режиме.
//
// Карта — по предмету (владелец, 05.10.2026: «карту — чтобы доступна была для
// всех, но ни у кого не было возможности её посмотреть — нужно будет покупать
// карту»; «просто этой кнопки быть не должно, пока не задастся такая функция»):
// у ВЫБРАННОГО героя в рюкзаке целая штука своего товара с галочкой «Карта»
// (raid_custom_item.is_map). Предмет не тратится и не изнашивается; продал,
// выбросил, сменил героя — карты нет. Обхода нет ни у кого: ни владельцу, ни
// админу без предмета.
//
// С предметом — «Разведанное»; «Вся карта» — если ещё и админ
// (isAdminWallet / session.isAdmin; владелец — ступень «Выплаты» — старшая
// ступень админа). Сервер (world-map.ts) и кружок у миникарты спрашивают одну
// эту функцию.
import type { WorldMapMode } from "./worldMapCodec";

export type WorldMapWho = { owner?: boolean; admin: boolean; hasMapItem: boolean };
export type WorldMapAccess = { seen: boolean; all: boolean };

export function worldMapAccess(who: WorldMapWho): WorldMapAccess {
  const seen = who.hasMapItem;
  return { seen, all: seen && (who.admin || who.owner === true) };
}

export function canOpenWorldMap(access: WorldMapAccess, mode: WorldMapMode): boolean {
  return mode === "all" ? access.all : access.seen;
}

/** Стопка рюкзака глазами правила: галочка «Карта» и сколько штук. */
type MapStack = { map?: boolean; count: number };

/**
 * Есть ли в рюкзаке (стопки getMyBackpack) целая штука товара «Карта» — то же
 * условие, что у сервера (world-map-item.ts). Нет поля (ответ прошлой версии) —
 * карты нет.
 */
export function hasMapIn(stacks: readonly MapStack[] | null | undefined): boolean {
  return Array.isArray(stacks) && stacks.some((s) => s.map === true && s.count >= 1);
}
